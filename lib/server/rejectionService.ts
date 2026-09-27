import prisma from '@/lib/server/prisma';
import { ApiError } from '@/lib/server/http';
import { round3 } from '@/lib/server/millProduction';
import { recordStageAuditEvent } from '@/lib/server/audit';

export type CreateRejectionLotInput = {
  shopId: string;
  batchId: string;
  sourceBatchStageId?: string | null;
  sourceOutputId?: string | null;
  productId: string;
  quantity: number;
  unit?: string;
  godownId?: string | null;
  rejectionReason?: string | null;
  qualityReference?: string | null;
  notes?: string | null;
};

/**
 * Generate generic, tenant-aware, unique Rejection lot number.
 * Format: RJ-YYYYMMDD-###
 */
export async function generateRejectionLotNumber(shopId: string, client: any = prisma): Promise<string> {
  const now = new Date();
  const dateStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');

  const prefix = `RJ-${dateStr}-`;

  const existingCount = await client.rejectionLot.count({
    where: {
      shopId,
      lotNumber: { startsWith: prefix },
    },
  });

  let seq = existingCount + 1;
  let candidate = `${prefix}${String(seq).padStart(3, '0')}`;

  let attempt = 0;
  while (attempt < 10) {
    const found = await client.rejectionLot.findFirst({
      where: { shopId, lotNumber: candidate },
      select: { id: true },
    });
    if (!found) break;
    seq++;
    candidate = `${prefix}${String(seq).padStart(3, '0')}`;
    attempt++;
  }

  return candidate;
}

/**
 * Create a RejectionLot from a stage output (Idempotent by sourceOutputId).
 * Stock is held separately from Finished Goods (does NOT auto-increment normal Product.currentStock).
 */
export async function createRejectionLot(
  input: CreateRejectionLotInput,
  client: any = prisma
) {
  const {
    shopId,
    batchId,
    sourceBatchStageId,
    sourceOutputId,
    productId,
    quantity,
    unit = 'kg',
    godownId,
    rejectionReason,
    qualityReference,
    notes,
  } = input;

  if (quantity <= 0) {
    throw new ApiError(400, 'Rejection quantity must be greater than zero', 'INVALID_REJECTION_QUANTITY');
  }

  // 1. Idempotency Check: If linking to sourceOutputId and RejectionLot already exists, return it
  if (sourceOutputId) {
    const existing = await client.rejectionLot.findFirst({
      where: { shopId, sourceOutputId },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        batch: { select: { id: true, batchNumber: true } },
        godown: { select: { id: true, name: true } },
      },
    });
    if (existing) {
      return existing;
    }
  }

  // 2. Validate Product & Shop
  const product = await client.product.findFirst({
    where: { id: productId, shopId },
    select: { id: true, name: true, sku: true, baseUnit: true },
  });
  if (!product) {
    throw new ApiError(404, 'Product not found for Rejection lot creation', 'PRODUCT_NOT_FOUND');
  }

  // 3. Determine target Godown
  let targetGodownId: string | null = godownId || null;
  if (!targetGodownId) {
    const defaultGodown = await client.godown.findFirst({
      where: { shopId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (defaultGodown) {
      targetGodownId = defaultGodown.id;
    }
  }

  // 4. Generate Lot Number
  const lotNumber = await generateRejectionLotNumber(shopId, client);
  const qtyNum = round3(quantity);

  // 5. Create RejectionLot record (separate stock tracking)
  const rjLot = await client.rejectionLot.create({
    data: {
      shopId,
      batchId,
      sourceBatchStageId: sourceBatchStageId || null,
      sourceOutputId: sourceOutputId || null,
      productId,
      quantity: qtyNum,
      availableQuantity: qtyNum,
      unit: unit.trim().toLowerCase(),
      godownId: targetGodownId,
      status: 'AVAILABLE',
      rejectionReason: rejectionReason || notes || 'Quality/Specification Failure',
      qualityReference: qualityReference || null,
      notes: notes || null,
      lotNumber,
    },
    include: {
      product: { select: { id: true, name: true, sku: true } },
      batch: { select: { id: true, batchNumber: true } },
      godown: { select: { id: true, name: true } },
    },
  });

  // 6. Audit log events
  await recordStageAuditEvent({
    shopId,
    action: 'REJECTION_LOT_CREATED',
    entityId: rjLot.id,
    details: { lotNumber, quantity: qtyNum, unit, productId, batchId, godownId: targetGodownId, rejectionReason: rjLot.rejectionReason },
  });

  await recordStageAuditEvent({
    shopId,
    action: 'REJECTION_STOCK_RECORDED',
    entityId: rjLot.id,
    details: { lotNumber, quantity: qtyNum, unit, productId, godownId: targetGodownId },
  });

  return rjLot;
}

/**
 * Get Paginated Rejections inventory list for shop
 */
export async function getRejectionLotsService(
  shopId: string,
  filters: {
    productId?: string;
    godownId?: string;
    status?: string;
    rejectionReason?: string;
    search?: string;
    batchId?: string;
    page?: number;
    limit?: number;
  }
) {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, Math.max(1, filters.limit || 20));
  const skip = (page - 1) * limit;

  const where: any = { shopId };

  if (filters.productId) {
    where.productId = filters.productId;
  }

  if (filters.godownId) {
    where.godownId = filters.godownId;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.batchId) {
    where.batchId = filters.batchId;
  }

  if (filters.rejectionReason) {
    where.rejectionReason = { contains: filters.rejectionReason, mode: 'insensitive' };
  }

  if (filters.search) {
    const term = filters.search.trim();
    where.OR = [
      { lotNumber: { contains: term, mode: 'insensitive' } },
      { product: { name: { contains: term, mode: 'insensitive' } } },
      { batch: { batchNumber: { contains: term, mode: 'insensitive' } } },
      { rejectionReason: { contains: term, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.rejectionLot.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true, baseUnit: true } },
        batch: { select: { id: true, batchNumber: true, currentStage: true } },
        sourceBatchStage: { select: { id: true, stageName: true } },
        godown: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.rejectionLot.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get single Rejection lot details
 */
export async function getRejectionLotByIdService(shopId: string, id: string) {
  const rjLot = await prisma.rejectionLot.findFirst({
    where: { id, shopId },
    include: {
      product: { select: { id: true, name: true, sku: true, baseUnit: true } },
      batch: {
        select: {
          id: true,
          batchNumber: true,
          status: true,
          inputLots: {
            include: {
              rawMaterialLot: {
                select: { id: true, lotNumber: true, farmerName: true, product: { select: { name: true } } },
              },
            },
          },
          wipLots: {
            include: {
              product: { select: { name: true } },
              sourceBatchStage: { select: { stageName: true } },
            },
          },
        },
      },
      sourceBatchStage: { select: { id: true, stageName: true, operatorName: true, completedAt: true } },
      godown: { select: { id: true, name: true } },
    },
  });

  if (!rjLot) {
    throw new ApiError(404, 'Rejection Lot not found', 'NOT_FOUND');
  }

  return rjLot;
}

/**
 * Get forward and reverse material traceability for a Rejection Lot
 */
export async function getRejectionTraceabilityService(shopId: string, id: string) {
  const rjLot = await getRejectionLotByIdService(shopId, id);

  const rawMaterialLots = rjLot.batch.inputLots.map((il: any) => ({
    id: il.rawMaterialLot.id,
    lotNumber: il.rawMaterialLot.lotNumber,
    productName: il.rawMaterialLot.product?.name || 'Raw Grain',
    farmerName: il.rawMaterialLot.farmerName,
    quantityConsumed: il.quantity,
    unit: il.unit,
  }));

  const wipLots = rjLot.batch.wipLots.map((wip: any) => ({
    id: wip.id,
    lotNumber: wip.lotNumber,
    productName: wip.product?.name || 'WIP Material',
    sourceStageName: wip.sourceBatchStage?.stageName || 'Stage Output',
    quantity: wip.quantity,
    unit: wip.unit,
    status: wip.status,
  }));

  // Fetch Reprocessing Batches created from this rejection lot
  const reprocessingBatches = await prisma.productionBatch.findMany({
    where: { shopId, rejectionLotId: id },
    include: {
      finishedGoodsLots: { select: { id: true, lotNumber: true, quantity: true, unit: true, product: { select: { name: true } } } },
      byProductLots: { select: { id: true, lotNumber: true, quantity: true, unit: true, product: { select: { name: true } } } },
      wipLots: { select: { id: true, lotNumber: true, quantity: true, unit: true, product: { select: { name: true } } } },
      rejectionLots: { select: { id: true, lotNumber: true, quantity: true, unit: true, product: { select: { name: true } } } },
    },
    orderBy: { startedAt: 'desc' },
  });

  return {
    rejectionLot: {
      id: rjLot.id,
      lotNumber: rjLot.lotNumber,
      productName: rjLot.product.name,
      originalQuantity: rjLot.quantity,
      availableQuantity: rjLot.availableQuantity,
      disposedQuantity: rjLot.disposedQuantity,
      disposalReason: rjLot.disposalReason,
      disposedAt: rjLot.disposedAt,
      unit: rjLot.unit,
      godownName: rjLot.godown?.name || 'Rejection Holding',
      status: rjLot.status,
      rejectionReason: rjLot.rejectionReason,
      qualityReference: rjLot.qualityReference,
      createdAt: rjLot.createdAt,
    },
    origin: {
      batchId: rjLot.batch.id,
      batchNumber: rjLot.batch.batchNumber,
      sourceStageName: rjLot.sourceBatchStage?.stageName || 'Stage Output',
      rawMaterialLots,
      wipLots,
    },
    reprocessingBatches: reprocessingBatches.map((b) => ({
      id: b.id,
      batchNumber: b.batchNumber,
      inputKg: b.inputKg,
      status: b.status,
      startedAt: b.startedAt,
      closedAt: b.closedAt,
      outputs: {
        finishedGoods: b.finishedGoodsLots.map((fg) => ({ id: fg.id, lotNumber: fg.lotNumber, productName: fg.product?.name, quantity: fg.quantity, unit: fg.unit })),
        byProducts: b.byProductLots.map((bp) => ({ id: bp.id, lotNumber: bp.lotNumber, productName: bp.product?.name, quantity: bp.quantity, unit: bp.unit })),
        wip: b.wipLots.map((w) => ({ id: w.id, lotNumber: w.lotNumber, productName: w.product?.name, quantity: w.quantity, unit: w.unit })),
        rejections: b.rejectionLots.map((rj) => ({ id: rj.id, lotNumber: rj.lotNumber, productName: rj.product?.name, quantity: rj.quantity, unit: rj.unit })),
      },
    })),
  };
}

/**
 * Generate unique reprocessing batch number.
 * Format: RB-YYYYMMDD-###
 */
export async function generateReprocessingBatchNumber(shopId: string, client: any = prisma): Promise<string> {
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const prefix = `RB-${dateStr}-`;

  const count = await client.productionBatch.count({
    where: { shopId, batchNumber: { startsWith: prefix } },
  });

  let seq = count + 1;
  let candidate = `${prefix}${String(seq).padStart(3, '0')}`;
  let attempt = 0;
  while (attempt < 10) {
    const found = await client.productionBatch.findFirst({
      where: { shopId, batchNumber: candidate },
      select: { id: true },
    });
    if (!found) break;
    seq++;
    candidate = `${prefix}${String(seq).padStart(3, '0')}`;
    attempt++;
  }
  return candidate;
}

/**
 * Reprocess a portion or full quantity of a RejectionLot into a new Reprocessing Batch.
 * Concurrency & Transaction Safe.
 */
export async function reprocessRejectionLotService(input: {
  shopId: string;
  rejectionId: string;
  quantity: number;
  unit?: string;
  godownId?: string | null;
  workflowVersionId?: string | null;
  notes?: string | null;
}) {
  const { shopId, rejectionId, quantity, unit = 'kg', workflowVersionId, notes } = input;

  if (quantity <= 0) {
    throw new ApiError(400, 'Reprocessing quantity must be a positive number', 'INVALID_QUANTITY');
  }

  const reqQtyKg = round3(quantity);

  return await prisma.$transaction(
    async (tx) => {
    // 1. Fetch Rejection Lot with tenant check
    const rjLot = await tx.rejectionLot.findFirst({
      where: { id: rejectionId, shopId },
      include: { product: true },
    });

    if (!rjLot) {
      throw new ApiError(404, 'Rejection Lot not found', 'NOT_FOUND');
    }

    if (['DISPOSED', 'BLOCKED', 'FULLY_REPROCESSED'].includes(rjLot.status)) {
      throw new ApiError(400, `Cannot reprocess rejection lot with status ${rjLot.status}`, 'INVALID_STATUS');
    }

    if (rjLot.availableQuantity < reqQtyKg - 0.0001) {
      throw new ApiError(
        400,
        `Concurrent over-consumption prevented: Rejection Lot #${rjLot.lotNumber} only has ${rjLot.availableQuantity} ${rjLot.unit} remaining.`,
        'REJECTION_STOCK_EXHAUSTED'
      );
    }

    // 2. Deduct available quantity & determine new status
    const newAvailable = round3(Math.max(0, rjLot.availableQuantity - reqQtyKg));
    const newStatus = newAvailable <= 0.0001 ? 'FULLY_REPROCESSED' : 'PARTIALLY_REPROCESSED';

    const updatedRjLot = await tx.rejectionLot.update({
      where: { id: rejectionId },
      data: {
        availableQuantity: newAvailable,
        status: newStatus,
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        godown: { select: { id: true, name: true } },
      },
    });

    // 3. Create Reprocessing Batch
    const batchNumber = await generateReprocessingBatchNumber(shopId, tx);

    let stageDefinitions: Array<{ name: string; processStageId?: string; machineId?: string }> = [];
    let loadedVersion: any = null;

    if (workflowVersionId) {
      loadedVersion = await tx.workflowVersion.findFirst({
        where: { id: workflowVersionId, workflow: { shopId } },
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
            },
          },
        },
      });

      if (!loadedVersion) {
        throw new ApiError(404, 'Workflow version not found', 'WORKFLOW_NOT_FOUND');
      }
      if (loadedVersion.status !== 'ACTIVE') {
        throw new ApiError(400, 'Workflow version must be ACTIVE to start a batch', 'WORKFLOW_NOT_ACTIVE');
      }
      stageDefinitions = loadedVersion.stages.map((s: any) => ({
        name: s.processStage.name,
        processStageId: s.processStageId,
        machineId: s.machineId || undefined,
      }));
    } else {
      stageDefinitions = [
        { name: 'Stage 1 - Cleaning & Sorting' },
        { name: 'Stage 2 - Reprocessing Milling' },
        { name: 'Stage 3 - Final Output & Packing' },
      ];
    }

    const firstStageName = stageDefinitions[0]?.name || 'Stage 1 - Reprocessing';

    const batch = await tx.productionBatch.create({
      data: {
        shopId,
        batchNumber,
        batchType: 'REPROCESSING',
        rejectionLotId: rejectionId,
        outputProductId: rjLot.productId,
        inputKg: reqQtyKg,
        status: 'in_progress',
        currentStage: firstStageName,
        workflowVersionId: workflowVersionId || null,
        notes: notes || `Reprocessing from Rejection Lot ${rjLot.lotNumber}`,
      },
    });

    // 4. Create BatchInputLot link
    await tx.batchInputLot.create({
      data: {
        shopId,
        batchId: batch.id,
        rejectionLotId: rejectionId,
        quantity: reqQtyKg,
        unit: (unit || rjLot.unit || 'kg').trim().toLowerCase(),
        sequence: 1,
        notes: `Reprocessed from Rejection Lot ${rjLot.lotNumber}`,
      },
    });

    // 5. Create BatchStage records
    for (let i = 0; i < stageDefinitions.length; i++) {
      const def = stageDefinitions[i];
      await tx.batchStage.create({
        data: {
          batchId: batch.id,
          stageName: def.name,
          sequence: i + 1,
          processStageId: def.processStageId || null,
          machineId: def.machineId || null,
        },
      });
    }

    // 6. Create Workflow Snapshot if version loaded
    if (loadedVersion) {
      const snapshot = await tx.batchWorkflowSnapshot.create({
        data: {
          productionBatchId: batch.id,
          workflowVersionId: loadedVersion.id,
          workflowName: loadedVersion.workflow.name,
          versionNumber: loadedVersion.versionNumber,
        },
      });

      for (const s of loadedVersion.stages) {
        const stageSnap = await tx.batchStageSnapshot.create({
          data: {
            batchWorkflowSnapshotId: snapshot.id,
            sourceWorkflowStageId: s.id,
            processStageId: s.processStageId,
            machineId: s.machineId,
            stageName: s.processStage.name,
            sequence: s.sequence,
            isRequired: s.isRequired,
            instructions: s.instructions,
          },
        });

        for (const inp of s.stageInputConfigs) {
          await tx.batchStageInput.create({
            data: {
              batchStageSnapshotId: stageSnap.id,
              sourceConfigId: inp.id,
              productId: inp.productId,
              inputType: inp.inputType,
              quantityRuleType: inp.quantityRuleType,
              configuredQuantityValue: inp.quantityValue,
              unit: inp.unit,
              isRequired: inp.isRequired,
              rejectionLotId: s.sequence === 1 ? rejectionId : null,
            },
          });
        }

        for (const out of s.stageOutputConfigs) {
          await tx.batchStageOutput.create({
            data: {
              batchStageSnapshotId: stageSnap.id,
              sourceConfigId: out.id,
              productId: out.productId,
              outputType: out.outputType,
              quantityRuleType: out.quantityRuleType,
              configuredQuantityValue: out.quantityValue,
              unit: out.unit,
              expectedQuantity: out.expectedQuantity,
              minimumQuantity: out.minimumQuantity,
              maximumQuantity: out.maximumQuantity,
              tolerancePercent: out.tolerancePercent,
              isRequired: out.isRequired,
            },
          });
        }
      }
    }

    // 7. Audit events
    await recordStageAuditEvent({
      shopId,
      action: 'REPROCESSING_BATCH_CREATED',
      entityId: batch.id,
      details: { batchNumber, rejectionLotId: rejectionId, quantity: reqQtyKg, unit },
    });

    await recordStageAuditEvent({
      shopId,
      action: 'REJECTION_QUANTITY_CONSUMED',
      entityId: rejectionId,
      details: { batchId: batch.id, batchNumber, consumedQuantity: reqQtyKg, remainingAvailable: newAvailable },
    });

    await recordStageAuditEvent({
      shopId,
      action: newStatus === 'FULLY_REPROCESSED' ? 'REJECTION_FULLY_REPROCESSED' : 'REJECTION_PARTIALLY_REPROCESSED',
      entityId: rejectionId,
      details: { batchId: batch.id, consumedQuantity: reqQtyKg, newAvailable, status: newStatus },
    });

    return { batch, rejectionLot: updatedRjLot };
  }, { maxWait: 20000, timeout: 60000 });
}

/**
 * Dispose or scrap remaining or partial quantity from a RejectionLot.
 */
export async function disposeRejectionLotService(input: {
  shopId: string;
  rejectionId: string;
  quantity: number;
  reason?: string | null;
  notes?: string | null;
}) {
  const { shopId, rejectionId, quantity, reason, notes } = input;

  if (quantity <= 0) {
    throw new ApiError(400, 'Disposal quantity must be a positive number', 'INVALID_QUANTITY');
  }

  const reqQtyKg = round3(quantity);

  return await prisma.$transaction(
    async (tx) => {
      const rjLot = await tx.rejectionLot.findFirst({
        where: { id: rejectionId, shopId },
      });

      if (!rjLot) {
        throw new ApiError(404, 'Rejection Lot not found', 'NOT_FOUND');
      }

      if (['DISPOSED', 'BLOCKED', 'FULLY_REPROCESSED'].includes(rjLot.status)) {
        throw new ApiError(400, `Cannot dispose rejection lot with status ${rjLot.status}`, 'INVALID_STATUS');
      }

      if (rjLot.availableQuantity < reqQtyKg - 0.0001) {
        throw new ApiError(
          400,
          `Cannot dispose ${reqQtyKg} ${rjLot.unit} — only ${rjLot.availableQuantity} ${rjLot.unit} available`,
          'INSUFFICIENT_QUANTITY'
        );
      }

      const newAvailable = round3(Math.max(0, rjLot.availableQuantity - reqQtyKg));
      const newDisposed = round3(rjLot.disposedQuantity + reqQtyKg);

      let newStatus = 'PARTIALLY_REPROCESSED';
      if (newAvailable <= 0.0001) {
        if (newDisposed >= rjLot.quantity - 0.0001) {
          newStatus = 'DISPOSED';
        } else {
          newStatus = 'FULLY_REPROCESSED';
        }
      }

      const updatedRjLot = await tx.rejectionLot.update({
        where: { id: rejectionId },
        data: {
          availableQuantity: newAvailable,
          disposedQuantity: newDisposed,
          disposalReason: reason || notes || 'Scrapped / Disposed',
          disposedAt: new Date(),
          status: newStatus,
        },
        include: {
          product: { select: { id: true, name: true, sku: true } },
          godown: { select: { id: true, name: true } },
        },
      });

      await recordStageAuditEvent({
        shopId,
        action: 'REJECTION_DISPOSED',
        entityId: rejectionId,
        details: {
          disposedQuantity: reqQtyKg,
          totalDisposed: newDisposed,
          remainingAvailable: newAvailable,
          reason: updatedRjLot.disposalReason,
          status: newStatus,
        },
      });

      return updatedRjLot;
    },
    { maxWait: 20000, timeout: 60000 }
  );
}

/**
 * Get reprocessing batches for a rejection lot
 */
export async function getReprocessingBatchesService(shopId: string, rejectionId: string) {
  const batches = await prisma.productionBatch.findMany({
    where: { shopId, rejectionLotId: rejectionId },
    include: {
      stages: { orderBy: { sequence: 'asc' } },
      outputs: true,
      finishedGoodsLots: { include: { product: { select: { name: true } } } },
      byProductLots: { include: { product: { select: { name: true } } } },
      wipLots: { include: { product: { select: { name: true } } } },
      rejectionLots: { include: { product: { select: { name: true } } } },
    },
    orderBy: { startedAt: 'desc' },
  });
  return batches;
}

export type ReturnRejectionInput = {
  shopId: string;
  rejectionId: string;
  quantity: number;
  returnTo: 'supplier' | 'farmer_customer';
  partyId?: string | null;
  partyName: string;
  partyMobile?: string | null;
  reason?: string | null;
  gatePassNumber?: string | null;
  transporterName?: string | null;
  vehicleNumber?: string | null;
  debitNoteAmount?: number | null;
  notes?: string | null;
};

/**
 * Return a rejection lot (or partial quantity) back to Supplier or Job-Work Customer/Farmer.
 */
export async function returnRejectionLotService(input: ReturnRejectionInput) {
  const {
    shopId,
    rejectionId,
    quantity,
    returnTo,
    partyId,
    partyName,
    partyMobile,
    reason,
    gatePassNumber,
    transporterName,
    vehicleNumber,
    debitNoteAmount,
    notes,
  } = input;

  if (quantity <= 0) {
    throw new ApiError(400, 'Return quantity must be greater than zero', 'INVALID_QUANTITY');
  }
  if (!partyName?.trim()) {
    throw new ApiError(400, 'Party / Supplier / Farmer name is required for return', 'INVALID_PARTY');
  }

  const reqQtyKg = round3(quantity);

  return await prisma.$transaction(
    async (tx) => {
      const rjLot = await tx.rejectionLot.findFirst({
        where: { id: rejectionId, shopId },
        include: {
          product: { select: { id: true, name: true, sku: true } },
          godown: { select: { id: true, name: true } },
          batch: { select: { id: true, batchNumber: true } },
        },
      });

      if (!rjLot) {
        throw new ApiError(404, 'Rejection Lot not found', 'NOT_FOUND');
      }

      if (['DISPOSED', 'BLOCKED', 'FULLY_REPROCESSED', 'RETURNED'].includes(rjLot.status) && rjLot.availableQuantity <= 0.0001) {
        throw new ApiError(400, `Cannot return rejection lot with status ${rjLot.status}`, 'INVALID_STATUS');
      }

      if (rjLot.availableQuantity < reqQtyKg - 0.0001) {
        throw new ApiError(
          400,
          `Cannot return ${reqQtyKg} ${rjLot.unit} — only ${rjLot.availableQuantity} ${rjLot.unit} available`,
          'INSUFFICIENT_QUANTITY'
        );
      }

      const newAvailable = round3(Math.max(0, rjLot.availableQuantity - reqQtyKg));
      const newDisposed = round3(rjLot.disposedQuantity + reqQtyKg);
      const isFullReturn = newAvailable <= 0.0001;
      const newStatus = isFullReturn ? 'RETURNED' : 'PARTIALLY_RETURNED';

      const gpNumber = gatePassNumber?.trim() || `GP-RET-${Date.now().toString().slice(-6)}`;
      const returnReason = reason?.trim() || notes?.trim() || 'Quality / Specification Failure - Material Returned';

      const updatedRjLot = await tx.rejectionLot.update({
        where: { id: rejectionId },
        data: {
          availableQuantity: newAvailable,
          disposedQuantity: newDisposed,
          disposalReason: returnTo === 'supplier' ? `RETURNED_TO_SUPPLIER: ${partyName}` : `RETURNED_TO_FARMER: ${partyName}`,
          disposedAt: new Date(),
          status: newStatus,
          notes: notes ? `${rjLot.notes ? rjLot.notes + ' | ' : ''}Returned: ${reqQtyKg} ${rjLot.unit} via ${gpNumber}` : rjLot.notes,
        },
        include: {
          product: { select: { id: true, name: true, sku: true } },
          godown: { select: { id: true, name: true } },
        },
      });

      // Log Return Audit Event
      await recordStageAuditEvent({
        shopId,
        action: returnTo === 'supplier' ? 'REJECTION_RETURNED_TO_SUPPLIER' : 'REJECTION_RETURNED_TO_FARMER',
        entityId: rejectionId,
        details: {
          lotNumber: rjLot.lotNumber,
          productName: rjLot.product.name,
          returnedQuantity: reqQtyKg,
          unit: rjLot.unit,
          returnTo,
          partyId: partyId || null,
          partyName,
          partyMobile: partyMobile || null,
          reason: returnReason,
          gatePassNumber: gpNumber,
          transporterName: transporterName || null,
          vehicleNumber: vehicleNumber || null,
          debitNoteAmount: debitNoteAmount || 0,
          remainingAvailable: newAvailable,
          status: newStatus,
        },
      });

      return {
        rejectionLot: updatedRjLot,
        returnSlip: {
          gatePassNumber: gpNumber,
          lotNumber: rjLot.lotNumber,
          productName: rjLot.product.name,
          quantity: reqQtyKg,
          unit: rjLot.unit,
          returnTo,
          partyName,
          partyMobile,
          transporterName,
          vehicleNumber,
          debitNoteAmount,
          reason: returnReason,
          returnedAt: new Date(),
        },
      };
    },
    { maxWait: 20000, timeout: 60000 }
  );
}

/**
 * Get full Rejection Return History across all returned batches & lots
 */
export async function getRejectionReturnsHistoryService(shopId: string) {
  const auditLogs = await prisma.activityLog.findMany({
    where: {
      shopId,
      action: { in: ['REJECTION_RETURNED_TO_SUPPLIER', 'REJECTION_RETURNED_TO_FARMER'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return auditLogs.map((log: any) => {
    const d = (log.details as any) || {};
    return {
      id: log.id,
      rejectionLotId: log.entityId,
      lotNumber: d.lotNumber || '—',
      productName: d.productName || 'Material',
      returnedQuantity: d.returnedQuantity || 0,
      unit: d.unit || 'kg',
      returnTo: d.returnTo || (log.action.includes('SUPPLIER') ? 'supplier' : 'farmer_customer'),
      partyName: d.partyName || '—',
      partyMobile: d.partyMobile || null,
      reason: d.reason || 'Quality Rejection',
      gatePassNumber: d.gatePassNumber || '—',
      transporterName: d.transporterName || null,
      vehicleNumber: d.vehicleNumber || null,
      debitNoteAmount: d.debitNoteAmount || 0,
      returnedAt: log.createdAt,
    };
  });
}


