import prisma from '@/lib/server/prisma';
import { ApiError } from '@/lib/server/http';
import { checkBalance, kgToProductUnit, round3, toKg, type ParsedOutput } from '@/lib/server/millProduction';
import { createFinishedGoodsLot } from '@/lib/server/finishedGoodsService';
import { createWipLotFromStageOutput } from '@/lib/server/wipService';
import { createRejectionLot } from '@/lib/server/rejectionService';
import { recordStageAuditEvent } from '@/lib/server/audit';
import { computeQualityFlag } from '@/lib/businessConfig';

/**
 * The production engine that closes a batch: consumes the raw material and books every output (finished goods, by-products,
 * WIP, rejections) in ONE transaction, enforcing input = outputs + loss. Shared by the stage-based Finalize and the
 * Quick Production Entry, so both behave identically — one set of stock rules, not two.
 */

const MOVEMENT_TYPE: Record<string, string> = {
  finished_good: 'production_output',
  wip: 'production_wip',
  by_product: 'production_byproduct',
  rejection: 'production_rejection',
};

export type OutputCredit = ParsedOutput & { stockQty: number | null };

/** Output rows -> credits: every linked product must belong to the shop; its base unit decides how the stock credit is expressed. */
export async function prepareOutputCredits(shopId: string, outputs: ParsedOutput[]): Promise<OutputCredit[]> {
  const productIds = [...new Set(outputs.map((o) => o.productId).filter(Boolean) as string[])];
  const products = productIds.length
    ? await prisma.product.findMany({ where: { id: { in: productIds }, shopId }, select: { id: true, name: true, baseUnit: true } })
    : [];
  const productById = new Map(products.map((p) => [p.id, p]));
  for (const pid of productIds) if (!productById.has(pid)) throw new ApiError(400, 'A selected output product was not found in this shop.', 'PRODUCT_NOT_FOUND');
  return outputs.map((o) => {
    const p = o.productId ? productById.get(o.productId)! : null;
    return { ...o, name: o.name || p?.name || '', stockQty: p ? kgToProductUnit(o.quantityKg, p.baseUnit, p.name ?? '') : null };
  });
}

export type FinalizeParams = {
  shopId: string;
  batchId: string;
  credits: OutputCredit[];
  lossKg: number;
  notes?: string | null;
  allowNegativeStock: boolean;
  /** The Job Work order this batch processes, when the caller wants it completed and charged with the batch. */
  jwOrder?: any;
};

/** Runs inside the caller's interactive transaction. Throws (so nothing is written) on any failure. */
export async function finalizeBatchTx(tx: any, p: FinalizeParams) {
  const { shopId, batchId: id, credits, lossKg, allowNegativeStock } = p;
  const jwOrder: any = p.jwOrder ?? null;
  const shop = { id: shopId };
  const body = { notes: p.notes ?? null };
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
    
    // A batch can draw from several lots of one material: every raw-lot row of the batch is consumed by its own weight. A batch
    // without such rows (older ones) consumes its whole input from its single raw lot, exactly as before.
    const lotRows = await tx.$queryRaw<any[]>`
      SELECT raw_material_lot_id::text AS lot_id, quantity, unit FROM batch_input_lots
      WHERE batch_id = ${id}::uuid AND raw_material_lot_id IS NOT NULL ORDER BY sequence`;
    let consumedLots = [{ lotId: batch.raw_lot_id as string, consumedQty: inputKg }];
    if (lotRows.length > 1) {
      consumedLots = lotRows.map((r: any) => ({ lotId: r.lot_id as string, consumedQty: toKg(Number(r.quantity), r.unit) }));
      const sum = round3(consumedLots.reduce((s, l) => s + l.consumedQty, 0));
      if (Math.abs(sum - inputKg) > 0.005) throw new ApiError(400, `The lots add up to ${sum} kg but the batch input is ${inputKg} kg.`, 'INPUT_LOTS_MISMATCH');
    } else if (lotRows.length === 1) {
      consumedLots = [{ lotId: lotRows[0].lot_id as string, consumedQty: inputKg }];
    }

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
}

/**
 * After the transaction has committed: the Quality Lab record from the stage quality parameters, and the audit event.
 * Neither can fail the batch (they run after it is already closed).
 */
export function afterBatchFinalized(p: { shopId: string; batchId: string; finishedKg: number; lossKg: number; isJobWork: boolean }) {
  const shop = { id: p.shopId };
  const id = p.batchId;
  const lossKg = p.lossKg;
  const finalized = { finishedKg: p.finishedKg, isJobWork: p.isJobWork };
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

}
