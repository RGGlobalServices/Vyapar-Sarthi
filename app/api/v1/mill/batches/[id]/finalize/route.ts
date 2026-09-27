import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { checkBalance, kgToProductUnit, parseLossKg, parseOutputs, round3 } from '@/lib/server/millProduction';
import { createFinishedGoodsLot } from '@/lib/server/finishedGoodsService';
import { createWipLotFromStageOutput } from '@/lib/server/wipService';
import { createRejectionLot } from '@/lib/server/rejectionService';
import { recordStageAuditEvent } from '@/lib/server/audit';
import { computeQualityFlag } from '@/lib/businessConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const MOVEMENT_TYPE: Record<string, string> = {
  finished_good: 'production_output',
  wip: 'production_wip',
  by_product: 'production_byproduct',
  rejection: 'production_rejection',
};

/**
 * POST /api/v1/mill/batches/[id]/finalize
 *
 * Closes a production run: consumes the raw material and books every output, in ONE transaction.
 *
 *   body: { outputs: [{ productId?, name?, outputType: finished_good|by_product|rejection, quantity, unit, outputLotNumber?, notes? }],
 *           lossKg?, notes? }
 *
 * Everything that matters is decided here, never by the client:
 *  - the input weight is the batch's own stored input, and the raw lot's remaining stock is re-read under the lock;
 *  - the run must balance:  input = Σ outputs + loss  (an unexplained difference is rejected — it must be entered as loss or
 *    a rejection);
 *  - the batch row is locked FOR UPDATE, so a double submit cannot finalize twice, and the lot is decremented with a
 *    conditional UPDATE, so two runs can never consume the same kilos;
 *  - outputs are only linked to products the user picked — a product is never created from free text here.
 * If any step fails nothing is written.
 */
export const POST = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);

  const outputs = parseOutputs(body.outputs);
  const lossKg = parseLossKg(body.lossKg);
  const allowNegativeStock = Boolean((shop as any).allowNegativeStock);

  // The batch must be this shop's before anything else about the request is examined.
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) throw new ApiError(404, 'Production batch not found');

  const owned = await prisma.productionBatch.findFirst({ where: { id, shopId: shop.id }, select: { id: true } });
  if (!owned) throw new ApiError(404, 'Production batch not found');

  // Products the outputs are linked to must belong to this shop; their base unit decides how the stock credit is expressed.
  const productIds = [...new Set(outputs.map((o) => o.productId).filter(Boolean) as string[])];
  const products = productIds.length
    ? await prisma.product.findMany({ where: { id: { in: productIds }, shopId: shop.id }, select: { id: true, name: true, baseUnit: true } })
    : [];
  const productById = new Map(products.map((p) => [p.id, p]));
  for (const pid of productIds) if (!productById.has(pid)) throw new ApiError(400, 'A selected output product was not found in this shop.', 'PRODUCT_NOT_FOUND');
  const credits = outputs.map((o) => {
    const p = o.productId ? productById.get(o.productId)! : null;
    return { ...o, name: o.name || p?.name || '', stockQty: p ? kgToProductUnit(o.quantityKg, p.baseUnit, p.name ?? '') : null };
  });

  const finalized = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<any[]>`
      SELECT id, batch_number, status, input_kg, raw_lot_id, batch_type FROM production_batches
      WHERE id = ${id}::uuid AND shop_id = ${shop.id}::uuid FOR UPDATE`;
    const batch = rows[0];
    if (!batch) throw new ApiError(404, 'Production batch not found');
    if (batch.status === 'closed') throw new ApiError(409, 'This batch is already finalized.', 'BATCH_ALREADY_FINALIZED');

    const inputKg = Number(batch.input_kg) || 0;
    if (inputKg <= 0) throw new ApiError(400, 'This batch has no input weight.', 'NO_INPUT');

    const outputsKg = credits.reduce((s, o) => s + o.quantityKg, 0);
    const bal = checkBalance(inputKg, outputsKg, lossKg);
    if (!bal.ok) {
      throw new ApiError(
        400,
        bal.differenceKg < 0
          ? `Outputs (${bal.outputsKg} kg) plus loss (${bal.lossKg} kg) exceed the ${bal.inputKg} kg input by ${Math.abs(bal.differenceKg)} kg.`
          : `${bal.differenceKg} kg of the ${bal.inputKg} kg input is unaccounted for — enter it as an output, a rejection or loss.`,
        'MASS_BALANCE_MISMATCH',
      );
    }

    // Batches started under this workflow carry a `production_start` marker and consume their input here.
    // Job Work batches do NOT consume from mill's purchased raw material lots because the grain is customer-owned.
    const isJobWork = batch.batch_type === 'JOB_WORK';
    const marker = !isJobWork ? await tx.stockMovement.findFirst({ where: { shopId: shop.id, type: 'production_start', referenceId: id }, select: { id: true } }) : null;
    const consume = !!marker;

    if (consume && !isJobWork) {
      if (!batch.raw_lot_id) throw new ApiError(400, 'This batch has no raw material lot to consume.', 'RAW_LOT_REQUIRED');
      
      // Structure as an array to naturally support multiple lots without rewriting the core flow.
      const consumedLots = [{
        lotId: batch.raw_lot_id,
        consumedQty: inputKg
      }];

      for (const cl of consumedLots) {
        const took = await tx.$executeRaw`
          UPDATE raw_material_lots SET remaining_quantity = remaining_quantity - ${cl.consumedQty}
          WHERE id = ${cl.lotId}::uuid AND shop_id = ${shop.id}::uuid AND COALESCE(remaining_quantity, 0) >= ${cl.consumedQty}`;
        
        if (took === 0) {
          const lot = await tx.$queryRaw<any[]>`SELECT remaining_quantity, lot_number FROM raw_material_lots WHERE id = ${cl.lotId}::uuid AND shop_id = ${shop.id}::uuid`;
          throw new ApiError(409, `Only ${round3(Number(lot[0]?.remaining_quantity) || 0)} left in lot ${lot[0]?.lot_number || cl.lotId} — this batch needs ${cl.consumedQty}.`, 'INSUFFICIENT_RAW_STOCK');
        }
        
        const lotRow = await tx.$queryRaw<any[]>`SELECT product_id, godown_id FROM raw_material_lots WHERE id = ${cl.lotId}::uuid`;
        const rawProductId: string | null = lotRow[0]?.product_id ?? null;
        const godownId: string | null = lotRow[0]?.godown_id ?? null;
        
        if (rawProductId) {
          if (allowNegativeStock) {
            await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) - ${cl.consumedQty} WHERE id = ${rawProductId}::uuid AND shop_id = ${shop.id}::uuid`;
          } else {
            await tx.$executeRaw`UPDATE products SET current_stock = GREATEST(COALESCE(current_stock, 0) - ${cl.consumedQty}, 0) WHERE id = ${rawProductId}::uuid AND shop_id = ${shop.id}::uuid`;
          }
          await tx.stockMovement.create({ data: { shopId: shop.id, productId: rawProductId, type: 'production_consume', quantity: -cl.consumedQty, referenceId: id } });
          
          if (godownId) {
            const godownIdUuid = String(godownId);
            const gp = await tx.godownProduct.findUnique({ where: { godownId_productId: { godownId: godownIdUuid, productId: rawProductId } } });
            const currentGodownQty = gp?.quantity || 0;
            
            if (!allowNegativeStock && currentGodownQty < cl.consumedQty) {
              throw new ApiError(409, `Insufficient stock in Godown. Batch requires ${cl.consumedQty} kg, but only ${currentGodownQty} kg available.`, 'INSUFFICIENT_GODOWN_STOCK');
            }
            
            await tx.godownProduct.upsert({
              where: { godownId_productId: { godownId: godownIdUuid, productId: rawProductId } },
              update: { quantity: { decrement: cl.consumedQty } },
              create: { godownId: godownIdUuid, productId: rawProductId, quantity: -cl.consumedQty }
            });
          }
        }
      }
    }

    const jwOrder: any = null; // job_work_order_id column does not exist on production_batches

    // Outputs: the traceable record for this batch
    const lotDefault = String(batch.batch_number);
    await tx.productionOutput.createMany({
      data: credits.map((o) => ({
        shopId: shop.id, batchId: id, productId: o.productId, name: o.name, outputType: o.outputType,
        quantity: o.quantity, unit: o.unit, quantityKg: o.quantityKg, outputLotNumber: o.outputLotNumber || lotDefault, notes: o.notes,
      })),
    });

    // Stock allocation based on ownership:
    // For normal batches: by_product, rejection, wip outputs increment stock here.
    //   finished_good is EXCLUDED — createFinishedGoodsLot() below handles its own
    //   stock increment + godown assignment to avoid double-counting.
    // For Job Work batches:
    // - Finished Goods belong to customer (not added to mill stock).
    // - By-products belong to mill only if byproductRetainedByMill === true.
    // - WIP is intermediate.
    const eligibleForMillStock = credits.filter((o) => {
      if (!o.productId || !o.stockQty) return false;
      if (o.outputType === 'finished_good') return false; // handled by createFinishedGoodsLot
      if (!isJobWork) return true;
      if (o.outputType === 'by_product') {
        return jwOrder?.byproductRetainedByMill !== false;
      }
      return false;
    });

    const perProduct = new Map<string, number>();
    for (const o of eligibleForMillStock) {
      if (o.productId && o.stockQty) {
        perProduct.set(o.productId, round3((perProduct.get(o.productId) || 0) + o.stockQty));
      }
    }
    for (const [pid, qty] of perProduct) {
      await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) + ${qty} WHERE id = ${pid}::uuid AND shop_id = ${shop.id}::uuid`;
    }

    if (eligibleForMillStock.length) {
      await tx.stockMovement.createMany({
        data: eligibleForMillStock.map((o) => ({
          shopId: shop.id,
          productId: o.productId!,
          type: MOVEMENT_TYPE[o.outputType],
          quantity: o.stockQty!,
          referenceId: id,
        })),
      });
      // Batch-wise stock: each tracked output becomes a lot of that product carrying the production batch number.
      await tx.batch.createMany({
        data: eligibleForMillStock.map((o) => ({
          shopId: shop.id,
          productId: o.productId!,
          batchNumber: o.outputLotNumber || lotDefault,
          quantity: o.stockQty!,
          initialQuantity: o.stockQty!,
          mfgDate: new Date(),
          purchaseDate: new Date(),
        })),
      });
    }

    // By-products ledger (Mill retained or tracked)
    const byProducts = credits.filter((o) => o.outputType === 'by_product');
    if (byProducts.length && (!isJobWork || jwOrder?.byproductRetainedByMill !== false)) {
      await tx.byProduct.createMany({
        data: byProducts.map((o) => ({
          shopId: shop.id,
          batchId: id,
          productId: o.productId,
          name: o.name,
          quantityKg: o.quantityKg,
          notes: isJobWork ? `Retained from Job Work Order ${jwOrder?.orderNumber || ''}` : o.notes,
        })),
      });
    }

    if (!isJobWork) {
      const fgOutputs = credits.filter((o) => o.outputType === 'finished_good' && o.productId);
      // Run lot creation concurrently — each is independent
      await Promise.all(fgOutputs.map((fg) =>
        createFinishedGoodsLot(
          { shopId: shop.id, batchId: id, productId: fg.productId!, quantity: fg.quantity, unit: fg.unit, notes: fg.notes },
          tx
        )
      ));
      // StockMovement records for FG (excluded from eligibleForMillStock block above)
      if (fgOutputs.filter(o => o.stockQty).length) {
        await tx.stockMovement.createMany({
          data: fgOutputs
            .filter((o) => o.stockQty)
            .map((o) => ({
              shopId: shop.id,
              productId: o.productId!,
              type: MOVEMENT_TYPE['finished_good'],
              quantity: o.stockQty!,
              referenceId: id,
            })),
        });
      }
    }

    const wipOutputs = credits.filter((o) => o.outputType === 'wip' && o.productId);
    await Promise.all(wipOutputs.map((wip) =>
      createWipLotFromStageOutput(
        { shopId: shop.id, batchId: id, productId: wip.productId!, quantity: wip.quantity, unit: wip.unit, notes: wip.notes },
        tx
      )
    ));

    const rjOutputs = credits.filter((o) => o.outputType === 'rejection' && o.productId);
    await Promise.all(rjOutputs.map((rj) =>
      createRejectionLot(
        { shopId: shop.id, batchId: id, productId: rj.productId!, quantity: rj.quantity, unit: rj.unit, notes: rj.notes },
        tx
      )
    ));

    const finishedKg = credits.filter((o) => o.outputType === 'finished_good').reduce((s, o) => s + o.quantityKg, 0);
    const lastStage = await tx.batchStage.findFirst({ where: { batchId: id }, orderBy: { sequence: 'desc' }, select: { stageName: true } });
    await tx.productionBatch.update({
      where: { id },
      data: {
        status: 'closed', closedAt: new Date(),
        outputKg: round3(finishedKg), wastageKg: lossKg,
        recoveryPct: Math.round((finishedKg / inputKg) * 10000) / 100,
        ...(lastStage ? { currentStage: lastStage.stageName } : {}),
        ...(body.notes ? { notes: String(body.notes).trim().slice(0, 250) } : {}),
      },
    });

    // If linked to a Job Work Order, complete the order and calculate processing charges
    if (isJobWork && jwOrder) {
      const chargeBasis = jwOrder.feeBasis === 'output' ? 'output' : 'input';
      const billableKg = chargeBasis === 'output' ? finishedKg : Number(jwOrder.inputWeightKg || inputKg);
      const rate = Number(jwOrder.ratePerKg) || 0;
      const feeAmount = round3(billableKg * rate);

      await (tx as any).jobWorkOrder.update({
        where: { id: jwOrder.id },
        data: {
          status: 'completed',
          outputWeightKg: round3(finishedKg),
          feeAmount,
          completedAt: new Date(),
        },
      });

      if (jwOrder.customerId && feeAmount > 0) {
        await tx.customer_transactions.create({
          data: {
            customer_id: jwOrder.customerId,
            type: 'charge',
            amount: feeAmount,
            note: `Job Work Milling Charge — Order ${jwOrder.orderNumber} (${round3(billableKg)} Kg @ ₹${rate}/Kg)`,
          },
        });
        await tx.customer.update({
          where: { id: jwOrder.customerId },
          data: {
            totalDue: { increment: feeAmount },
          },
        });
      }
    }

    return { balance: bal, consumed: consume ? inputKg : 0, finishedKg, isJobWork };
  }, { timeout: 90000, maxWait: 15000 });

  // Auto-create a Quality Lab record from stage quality parameters — same pattern
  // as by-products/rejections going to their sections. Only fires when stages have
  // at least one quality parameter defined (even if no actual value recorded yet).
  // Runs outside the transaction so a Quality Lab failure never rolls back the batch.
  (async () => {
    try {
      const snapshot = await (prisma as any).batchWorkflowSnapshot.findFirst({
        where: { productionBatchId: id },
        include: {
          stages: {
            include: { qualityParameters: true },
          },
        },
      });

      const allParams: any[] = snapshot?.stages?.flatMap((s: any) => s.qualityParameters ?? []) ?? [];
      if (allParams.length === 0) return; // no quality checks defined for this batch — skip

      // Map parameterName / parameterCode to QualityTest fields by keyword match.
      const canon = (s: string) => String(s).toLowerCase().replace(/[^a-z]/g, '');
      const num = (v: any) => { const n = parseFloat(String(v ?? '')); return isFinite(n) ? n : null; };

      const fieldMap: Record<string, string> = {};
      for (const p of allParams) {
        const key = canon(p.parameterCode || p.parameterName);
        let field: string | null = null;
        if (/moisture/.test(key)) field = 'moisturePct';
        else if (/foreign|fm/.test(key)) field = 'foreignMatterPct';
        else if (/broken/.test(key)) field = 'brokenPct';
        else if (/damage/.test(key)) field = 'damagedPct';
        else if (/doc/.test(key)) field = 'docPct';
        if (field && p.actualValue != null) fieldMap[field] = p.actualValue;
      }

      const reading = {
        moisturePct: num(fieldMap.moisturePct),
        foreignMatterPct: num(fieldMap.foreignMatterPct),
        brokenPct: num(fieldMap.brokenPct),
        damagedPct: num(fieldMap.damagedPct),
      };

      // Skip if a QualityTest for this batch already exists (idempotent).
      const existing = await (prisma as any).qualityTest.findFirst({ where: { shopId: shop.id, batchId: id } });
      if (existing) return;

      await (prisma as any).qualityTest.create({
        data: {
          shopId: shop.id,
          batchId: id,
          testDate: new Date(),
          ...reading,
          docPct: num(fieldMap.docPct),
          flag: computeQualityFlag(reading),
          decision: 'pending',
          notes: 'Auto-created from batch stage quality checks on finalize.',
        },
      });
    } catch (_) {
      // Non-critical — batch is already finalized; Quality Lab entry can be added manually.
    }
  })();

  // Audit outside the transaction — non-critical and avoids extending the lock window
  recordStageAuditEvent({
    shopId: shop.id,
    action: 'BATCH_FINALIZED',
    entityId: id,
    details: { batchId: id, finishedKg: finalized.finishedKg, lossKg, isJobWork: finalized.isJobWork },
  }).catch(() => {});

  const batch = await prisma.productionBatch.findFirst({
    where: { id, shopId: shop.id },
    include: {
      rawLot: { select: { id: true, lotNumber: true, product: { select: { id: true, name: true } } } },
      stages: { orderBy: { sequence: 'asc' } },
      outputs: { orderBy: { createdAt: 'asc' } },
      byProducts: true,
    },
  });
  return json({ ...finalized, batch });
});
