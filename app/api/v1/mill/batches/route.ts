import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { toKg, lotSource, canonicalReceivedDate, computeLotQuantities, round3 } from '@/lib/server/millProduction';
import { validateInputLots } from '@/lib/server/batchMaterialService';
import { randomUUID } from 'crypto';
import { setBatchJobWork } from '@/lib/server/jobWorkLink';
import { allocatedByLot } from '@/lib/server/lotAllocation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Neutral default only — a mill names its own stages (rice, wheat, millet … differ), see `stages` in the POST body.
const DEFAULT_STAGES = ['cleaning', 'processing', 'packing'];

function parseStages(raw: any): string[] {
  if (raw === undefined || raw === null) return DEFAULT_STAGES;
  if (!Array.isArray(raw)) throw new ApiError(400, 'stages must be a list of stage names', 'INVALID_STAGES');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    const name = String(x ?? '').trim().slice(0, 40);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  if (out.length === 0) return DEFAULT_STAGES;
  if (out.length > 20) throw new ApiError(400, 'At most 20 stages per batch', 'INVALID_STAGES');
  return out;
}

/**
 * Production batches — one run of the mill pipeline consuming a raw lot and
 * producing user-defined outputs. Stages are advanced through /mill/batches/[id]/stages, and the run is closed — raw material
 * consumed, outputs booked, balance enforced — through /mill/batches/[id]/finalize.
 *
 * GET  /api/v1/mill/batches — list with rawLot + stages, newest first
 * POST /api/v1/mill/batches — create; auto-numbers B-YYYYMMDD-NNN if not given, requires a raw material lot with enough
 *                              available stock (protects against concurrent over-allocation), seeds the stages. The raw material
 *                              is NOT consumed here — it is consumed, atomically and re-validated, when the batch is finalized.
 */

async function nextBatchNumber(shopId: string): Promise<string> {
  const d = new Date();
  const prefix = `B-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const same = await (prisma as any).productionBatch.count({
    where: { shopId, batchNumber: { startsWith: prefix } },
  });
  return `${prefix}-${String(same + 1).padStart(3, '0')}`;
}

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const url = new URL(req.url);
  const status = url.searchParams.get('status'); // 'open' | 'in_progress' | 'closed'

  const where: any = { shopId: shop.id };
  if (status) where.status = status;

  const rows = await (prisma as any).productionBatch.findMany({
    where,
    include: {
      rawLot: {
        select: {
          id: true,
          lotNumber: true,
          quantity: true,
          remainingQuantity: true,
          farmerName: true,
          moisturePct: true,
          ratePerUnit: true,
          notes: true,
          purchaseDate: true,
          createdAt: true,
          product: { select: { id: true, name: true } },
          weighbridgeEntries: { select: { slipNumber: true } },
          batches: { select: { inputKg: true, status: true } },
        },
      },
      stages: { orderBy: { sequence: 'asc' } },
      byProducts: { select: { id: true, name: true, quantityKg: true, soldKg: true } },
      outputs: { orderBy: { createdAt: 'asc' } },
      inputLots: {
        include: {
          rawMaterialLot: {
            select: {
              id: true,
              lotNumber: true,
              product: { select: { id: true, name: true } },
              supplier: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { sequence: 'asc' },
      },
    },
    orderBy: { startedAt: 'desc' },
    take: 200,
  });

  // Extract any Job Work order numbers referenced in batch notes
  const jwOrderNumbers = rows
    .map((b: any) => {
      const match = (b.notes || '').match(/Job Work:\s*(JW-[A-Za-z0-9-]+)/i);
      return match ? match[1] : null;
    })
    .filter(Boolean) as string[];

  let jwOrdersMap = new Map<string, any>();
  if (jwOrderNumbers.length > 0) {
    const jwOrders = await (prisma as any).jobWorkOrder.findMany({
      where: { shopId: shop.id, orderNumber: { in: jwOrderNumbers } },
      select: {
        id: true,
        orderNumber: true,
        materialDescription: true,
        inputWeightKg: true,
        byproductRetainedByMill: true,
        customer: { select: { id: true, name: true, mobile: true } },
      },
    });
    jwOrders.forEach((o: any) => jwOrdersMap.set(o.orderNumber, o));
  }

  return json(rows.map((b: any) => {
    let jobWorkOrder = null;
    if (b.notes) {
      const match = b.notes.match(/Job Work:\s*(JW-[A-Za-z0-9-]+)/i);
      if (match && jwOrdersMap.has(match[1])) {
        jobWorkOrder = jwOrdersMap.get(match[1]);
      }
    }

    if (!b.rawLot) return { ...b, jobWorkOrder };
    const { weighbridgeEntries, notes, batches, ...lot } = b.rawLot;
    const src = lotSource(b.rawLot);
    const recDate = canonicalReceivedDate(b.rawLot);
    const qty = computeLotQuantities(b.rawLot);
    return {
      ...b,
      jobWorkOrder,
      rawLot: {
        ...lot,
        ...src,
        receivedDate: recDate.toISOString(),
        receivedKg: qty.quantity,
        allocatedKg: qty.allocatedKg,
        consumedKg: qty.consumedKg,
        availableKg: qty.availableKg,
        operationalStatus: qty.operationalStatus,
      },
    };
  }));
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);

  // The input is entered in a weight unit (kg / quintal / ton / g) and always stored in kg — converted here, never by the client.
  const enteredQty = Number(body.inputQuantity ?? body.inputKg);
  if (!isFinite(enteredQty) || enteredQty <= 0) {
    throw new ApiError(400, 'Input quantity must be a positive number', 'INVALID_QUANTITY');
  }
  const inputKg = toKg(enteredQty, body.unit ?? 'kg');
  if (inputKg <= 0) throw new ApiError(400, 'Input quantity must be a positive number', 'INVALID_QUANTITY');

  if (body.productId) {
    const own = await prisma.product.findFirst({ where: { id: String(body.productId), shopId: shop.id }, select: { id: true } });
    if (!own) throw new ApiError(404, 'Product not found for this shop', 'PRODUCT_NOT_FOUND');
  }

  const rawLotId: string | null = body.rawLotId || null;
  const jobWorkOrderId: string | null = body.jobWorkOrderId || null;

  if (!rawLotId && !jobWorkOrderId && (!Array.isArray(body.inputLots) || body.inputLots.length === 0)) {
    throw new ApiError(400, 'Select the raw material lot or Job Work order this batch will consume.', 'SOURCE_REQUIRED');
  }

  let jobWorkOrder: any = null;
  if (jobWorkOrderId) {
    jobWorkOrder = await (prisma as any).jobWorkOrder.findFirst({
      where: { id: jobWorkOrderId, shopId: shop.id },
      include: { customer: true },
    });
    if (!jobWorkOrder) throw new ApiError(404, 'Job work order not found for this shop', 'JOB_WORK_NOT_FOUND');
    if (jobWorkOrder.status === 'completed' || jobWorkOrder.status === 'delivered') {
      throw new ApiError(400, 'Job Work order is already completed or delivered', 'JOB_WORK_ALREADY_COMPLETED');
    }
  }
  
  let stageDefinitions: Array<{ name: string, processStageId?: string, machineId?: string }> = [];
  const workflowVersionId: string | null = body.workflowVersionId || null;

  let loadedVersion: any = null;
  if (workflowVersionId) {
    loadedVersion = await prisma.workflowVersion.findFirst({
      where: { id: workflowVersionId, workflow: { shopId: shop.id } },
      include: {
        workflow: true,
        stages: {
          orderBy: { sequence: 'asc' },
          include: { 
            processStage: true,
            stageInputConfigs: true,
            stageOutputConfigs: true,
            stageQualityConfigs: true,
            stageExecutionFieldConfigs: true,
          }
        }
      }
    });
    if (!loadedVersion) throw new ApiError(404, 'Workflow version not found', 'WORKFLOW_NOT_FOUND');
    if (loadedVersion.status !== 'ACTIVE') throw new ApiError(400, 'Workflow version must be ACTIVE to start a batch', 'WORKFLOW_NOT_ACTIVE');
    if (loadedVersion.stages.length === 0) throw new ApiError(400, 'Workflow version has no stages', 'WORKFLOW_EMPTY');
    
    stageDefinitions = loadedVersion.stages.map((s: any) => ({
      name: s.processStage.name,
      processStageId: s.processStageId,
      machineId: s.machineId || undefined
    }));
  } else {
    const stageNames = parseStages(body.stages);
    stageDefinitions = stageNames.map(name => ({ name }));
  }



  const batchNumber = (body.batchNumber || '').toString().trim()
    || await nextBatchNumber(shop.id);

  const startedAt = body.startedAt ? new Date(body.startedAt) : new Date();

  let outputProductId: string | null = body.outputProductId || null;
  if (outputProductId) {
    const product = await prisma.product.findFirst({ where: { id: outputProductId, shopId: shop.id } });
    if (!product) throw new ApiError(400, 'Output product not found for this shop');
  }

  const plannedOutputKg = body.plannedOutputKg !== undefined && body.plannedOutputKg !== ''
    ? Number(body.plannedOutputKg) : null;

  const newBatchId = randomUUID();
  const batchStageIds = stageDefinitions.map(() => randomUUID());

  let finalInputKg = inputKg;
  let primaryRawLotId: string | null = rawLotId || null;
  let inputLotsToCreate: any[] = [];

  if (jobWorkOrderId) {
    finalInputKg = inputKg;
    primaryRawLotId = null;
    inputLotsToCreate = [];
  } else if (Array.isArray(body.inputLots) && body.inputLots.length > 0) {
    const validatedLots = await validateInputLots(shop.id, body.inputLots, body.productId);
    finalInputKg = round3(validatedLots.reduce((acc, item) => acc + item.quantityKg, 0));
    primaryRawLotId = validatedLots[0].rawMaterialLotId;
    inputLotsToCreate = validatedLots.map((item, idx) => ({
      id: randomUUID(),
      shopId: shop.id,
      batchId: newBatchId,
      rawMaterialLotId: item.rawMaterialLotId,
      quantity: item.quantity,
      unit: item.unit,
      sequence: idx + 1,
    }));
  } else {
    if (!rawLotId) {
      throw new ApiError(400, 'Either rawLotId, jobWorkOrderId, or inputLots must be provided', 'RAW_LOT_REQUIRED');
    }
    const rawLot = await (prisma as any).rawMaterialLot.findFirst({
      where: { id: rawLotId, shopId: shop.id },
      select: { id: true, shopId: true, productId: true, quantity: true, remainingQuantity: true, lotNumber: true },
    });
    if (!rawLot) throw new ApiError(404, 'Source raw material lot not found for this shop', 'LOT_NOT_FOUND');
    if (!rawLot.productId) {
      throw new ApiError(400, 'Link this raw material lot to its raw material product (Raw Material screen) before producing from it — that is the stock the run consumes.', 'RAW_PRODUCT_REQUIRED');
    }
    if (body.productId && rawLot.productId && body.productId !== rawLot.productId) {
      throw new ApiError(400, 'The selected raw material does not match that lot.', 'PRODUCT_LOT_MISMATCH');
    }

    const unconsumedKg = round3(Number(rawLot.remainingQuantity ?? rawLot.quantity ?? 0));
    if (unconsumedKg <= 0) {
      throw new ApiError(400, 'That raw material lot is fully consumed — choose an available lot.', 'LOT_UNAVAILABLE');
    }

    const allocatedKg = (await allocatedByLot(prisma as any, shop.id, [rawLotId])).get(rawLotId)?.kg ?? 0;
    const availableKg = round3(Math.max(0, unconsumedKg - allocatedKg));

    if (availableKg < inputKg) {
      throw new ApiError(400, `Only ${availableKg} kg remaining in that lot — cannot start a ${inputKg} kg batch`, 'INSUFFICIENT_RAW_STOCK');
    }

    inputLotsToCreate = [
      {
        id: randomUUID(),
        shopId: shop.id,
        batchId: newBatchId,
        rawMaterialLotId: rawLotId,
        quantity: inputKg,
        unit: 'kg',
        sequence: 1,
      },
    ];
  }

  const batchNotes = jobWorkOrder
    ? `Job Work: ${jobWorkOrder.orderNumber} (${jobWorkOrder.customer?.name || 'Customer'}) · ${jobWorkOrder.materialDescription}${body.notes ? ' · ' + body.notes : ''}`
    : (body.notes || '').trim() || null;

  const ops: any[] = [
    (prisma as any).productionBatch.create({
      data: {
        id: newBatchId,
        shopId: shop.id,
        batchNumber,
        batchType: jobWorkOrderId ? 'JOB_WORK' : 'NORMAL',
        rawLotId: primaryRawLotId,
        outputProductId,
        plannedOutputKg,
        inputKg: finalInputKg,
        status: 'open',
        currentStage: stageDefinitions[0].name,
        startedAt,
        notes: batchNotes,
        workflowVersionId,
      },
    }),
    ...(inputLotsToCreate.length > 0
      ? [
          prisma.batchInputLot.createMany({
            data: inputLotsToCreate,
          }),
        ]
      : []),
    (prisma as any).batchStage.createMany({
      data: stageDefinitions.map((def, i) => ({
        id: batchStageIds[i],
        batchId: newBatchId,
        stageName: def.name,
        processStageId: def.processStageId || null,
        machineId: def.machineId || null,
        sequence: i + 1,
        inputKg: i === 0 ? finalInputKg : null,
      })),
    }),
    ...(jobWorkOrderId
      ? [
          (prisma as any).jobWorkOrder.update({
            where: { id: jobWorkOrderId },
            data: { status: 'processing' },
          }),
        ]
      : []),
  ];

  if (loadedVersion) {
    const executionFieldsToCreate: any[] = [];
    loadedVersion.stages.forEach((s: any, idx: number) => {
      const stageId = batchStageIds[idx];
      const activeConfigs = (s.stageExecutionFieldConfigs || []).filter((c: any) => c.isActive !== false);
      activeConfigs.forEach((c: any) => {
        executionFieldsToCreate.push({
          id: randomUUID(),
          batchStageId: stageId,
          sourceConfigId: c.id,
          fieldCode: c.fieldCode,
          fieldName: c.fieldName,
          description: c.description || null,
          fieldType: c.fieldType,
          unit: c.unit || null,
          isRequired: c.isRequired ?? false,
          sequence: c.sequence ?? 0,
          options: c.options ?? null,
          section: c.section || null,
          actualValue: c.defaultValue ? c.defaultValue : null,
        });
      });
    });

    if (executionFieldsToCreate.length > 0) {
      ops.push(
        prisma.batchStageExecutionField.createMany({
          data: executionFieldsToCreate,
        })
      );
    }

    const snapshotId = randomUUID();
    ops.push(
      prisma.batchWorkflowSnapshot.create({
        data: {
          id: snapshotId,
          productionBatchId: newBatchId,
          workflowVersionId: loadedVersion.id,
          workflowName: loadedVersion.workflow.name,
          versionNumber: loadedVersion.versionNumber,
          stages: {
            create: loadedVersion.stages.map((s: any, idx: number) => ({
              id: randomUUID(),
              sourceWorkflowStageId: s.id,
              processStageId: s.processStageId,
              machineId: s.machineId,
              stageName: s.processStage.name,
              sequence: idx + 1,
              isRequired: true,
              instructions: s.instructions,
              status: idx === 0 ? 'PENDING' : 'PENDING',
              inputs: {
                create: (s.stageInputConfigs || []).map((i: any) => ({
                  id: randomUUID(),
                  sourceConfigId: i.id,
                  productId: i.productId,
                  inputType: i.inputType,
                  quantityRuleType: i.quantityRuleType,
                  configuredQuantityValue: i.quantityValue,
                  unit: i.unit,
                  isRequired: i.isRequired,
                }))
              },
              outputs: {
                create: (s.stageOutputConfigs || []).map((o: any) => ({
                  id: randomUUID(),
                  sourceConfigId: o.id,
                  productId: o.productId,
                  outputType: o.outputType,
                  quantityRuleType: o.quantityRuleType,
                  configuredQuantityValue: o.quantityValue,
                  unit: o.unit,
                  expectedQuantity: o.expectedQuantity,
                  minimumQuantity: o.minimumQuantity,
                  maximumQuantity: o.maximumQuantity,
                  tolerancePercent: o.tolerancePercent,
                  isRequired: o.isRequired,
                }))
              },
              qualityParameters: {
                create: (s.stageQualityConfigs || []).map((q: any) => ({
                  id: randomUUID(),
                  sourceConfigId: q.id,
                  parameterName: q.parameterName,
                  parameterCode: q.parameterCode,
                  dataType: q.dataType,
                  unit: q.unit,
                  minValue: q.minValue,
                  maxValue: q.maxValue,
                  targetValue: q.targetValue,
                  isRequired: q.isRequired,
                  isCritical: q.isCritical,
                  failureAction: q.failureAction,
                  instructions: q.instructions,
                }))
              }
            }))
          }
        }
      })
    );
  }

  if (primaryRawLotId) {
    const rawLotRecord = await prisma.rawMaterialLot.findFirst({ where: { id: primaryRawLotId }, select: { productId: true } });
    if (rawLotRecord?.productId) {
      ops.push(
        prisma.stockMovement.create({
          data: {
            shopId: shop.id,
            productId: rawLotRecord.productId,
            type: 'production_start',
            quantity: 0,
            referenceId: newBatchId,
          },
        })
      );
    }
  }

  await prisma.$transaction(ops).catch((e: any) => {
    if (e?.code === 'P2002') throw new ApiError(409, `Batch number ${batchNumber} already exists.`, 'BATCH_NUMBER_EXISTS');
    throw e;
  });

  // Permanent batch -> Job Work order link (no-op until supabase/17 is run; the order number in the notes covers it meanwhile).
  if (jobWorkOrderId) await setBatchJobWork(prisma as any, newBatchId, jobWorkOrderId).catch((e: any) => console.error('job work link failed', e?.message));

  const full = await (prisma as any).productionBatch.findUnique({
    where: { id: newBatchId },
    include: {
      stages: { orderBy: { sequence: 'asc' } },
      rawLot: {
        select: {
          id: true,
          lotNumber: true,
          farmerName: true,
          quantity: true,
          remainingQuantity: true,
          purchaseDate: true,
          createdAt: true,
          product: { select: { id: true, name: true } },
          batches: { select: { inputKg: true, status: true } },
        },
      },
    },
  });

  if (full?.rawLot) {
    const qty = computeLotQuantities(full.rawLot);
    full.rawLot = {
      ...full.rawLot,
      receivedDate: canonicalReceivedDate(full.rawLot).toISOString(),
      receivedKg: qty.quantity,
      allocatedKg: qty.allocatedKg,
      consumedKg: qty.consumedKg,
      availableKg: qty.availableKg,
      operationalStatus: qty.operationalStatus,
    };
  }

  return json(full, 201);
});
