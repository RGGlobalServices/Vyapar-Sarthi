import prisma from '@/lib/server/prisma';
import { ApiError } from '@/lib/server/http';
import { checkBalance, kgToProductUnit, round3, toKg, type ParsedOutput } from '@/lib/server/millProduction';
import { consumeRawLot, writeOutputsBulk, recordAuditEvents, type AuditEvent } from '@/lib/server/productionWrites';
import { recordStageAuditEvent } from '@/lib/server/audit';
import { computeQualityFlag } from '@/lib/businessConfig';

/**
 * The production engine that closes a batch: consumes the raw material and books every output (finished goods, by-products,
 * WIP, rejections) in ONE transaction, enforcing input = outputs + loss. Shared by the stage-based Finalize and the
 * Quick Production Entry, so both behave identically — one set of stock rules, not two.
 */

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
  /**
   * Facts a caller that has just created the batch inside this same transaction already knows — passing them saves four
   * round trips (the batch lock, the marker, the input-lot rows, the last stage).
   */
  prefetched?: {
    batchNumber: string;
    inputKg: number;
    batchType: string;
    consume: boolean;
    lots: Array<{ lotId: string; qtyKg: number }>;
    lastStageName: string | null;
  };
};

/** Runs inside the caller's interactive transaction. Throws (so nothing is written) on any failure. */
export async function finalizeBatchTx(tx: any, p: FinalizeParams) {
  const { shopId, batchId: id, credits, lossKg, allowNegativeStock } = p;
  const jwOrder: any = p.jwOrder ?? null;
  const shop = { id: shopId };
  const body = { notes: p.notes ?? null };

  let batchNumber: string;
  let inputKg: number;
  let isJobWork: boolean;
  let consume: boolean;
  let consumedLots: Array<{ lotId: string; qtyKg: number }>;
  let lastStageName: string | null;

  if (p.prefetched) {
    ({ batchNumber, inputKg, consume, lastStageName } = p.prefetched);
    isJobWork = p.prefetched.batchType === 'JOB_WORK';
    consumedLots = p.prefetched.lots;
  } else {
    const rows = await tx.$queryRaw<any[]>`
      SELECT id, batch_number, status, input_kg, raw_lot_id, batch_type FROM production_batches
      WHERE id = ${id}::uuid AND shop_id = ${shop.id}::uuid FOR UPDATE`;
    const batch = rows[0];
    if (!batch) throw new ApiError(404, 'Production batch not found');
    if (batch.status === 'closed') throw new ApiError(409, 'This batch is already finalized.', 'BATCH_ALREADY_FINALIZED');
    batchNumber = String(batch.batch_number);
    inputKg = Number(batch.input_kg) || 0;
    // Batches started under this workflow carry a `production_start` marker and consume their input here.
    // Job Work batches do NOT consume from mill's purchased raw material lots because the grain is customer-owned.
    isJobWork = batch.batch_type === 'JOB_WORK';
    const marker = !isJobWork ? await tx.stockMovement.findFirst({ where: { shopId: shop.id, type: 'production_start', referenceId: id }, select: { id: true } }) : null;
    consume = !!marker;
    consumedLots = [];
    if (consume && !isJobWork) {
      if (!batch.raw_lot_id) throw new ApiError(400, 'This batch has no raw material lot to consume.', 'RAW_LOT_REQUIRED');
      // A batch can draw from several lots of one material: every raw-lot row of the batch is consumed by its own weight. A batch
      // without such rows (older ones) consumes its whole input from its single raw lot, exactly as before.
      const lotRows = await tx.$queryRaw<any[]>`
        SELECT raw_material_lot_id::text AS lot_id, quantity, unit FROM batch_input_lots
        WHERE batch_id = ${id}::uuid AND raw_material_lot_id IS NOT NULL ORDER BY sequence`;
      consumedLots = [{ lotId: batch.raw_lot_id as string, qtyKg: inputKg }];
      if (lotRows.length > 1) {
        consumedLots = lotRows.map((r: any) => ({ lotId: r.lot_id as string, qtyKg: toKg(Number(r.quantity), r.unit) }));
        const sum = round3(consumedLots.reduce((s, l) => s + l.qtyKg, 0));
        if (Math.abs(sum - inputKg) > 0.005) throw new ApiError(400, `The lots add up to ${sum} kg but the batch input is ${inputKg} kg.`, 'INPUT_LOTS_MISMATCH');
      } else if (lotRows.length === 1) {
        consumedLots = [{ lotId: lotRows[0].lot_id as string, qtyKg: inputKg }];
      }
    }
    const ls = await tx.batchStage.findFirst({ where: { batchId: id }, orderBy: { sequence: 'desc' }, select: { stageName: true } });
    lastStageName = ls?.stageName ?? null;
  }

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

  // raw material out: one statement per lot (lot + product stock + godown stock + movement)
  if (consume && !isJobWork) {
    for (const cl of consumedLots) {
      await consumeRawLot(tx, { shopId, lotId: cl.lotId, qtyKg: cl.qtyKg, batchId: id, allowNegativeStock });
    }
  }

  // outputs in: the traceable record, stock, lots, by-products — a handful of statements, however many outputs there are
  const { events } = await writeOutputsBulk(tx, { shopId, batchId: id, lotDefault: batchNumber, credits, isJobWork, jwOrder });

  const finishedKg = credits.filter((o) => o.outputType === 'finished_good').reduce((s, o) => s + o.quantityKg, 0);
  await tx.productionBatch.update({
    where: { id },
    data: {
      status: 'closed', closedAt: new Date(),
      outputKg: round3(finishedKg), wastageKg: lossKg,
      recoveryPct: Math.round((finishedKg / inputKg) * 10000) / 100,
      ...(lastStageName ? { currentStage: lastStageName } : {}),
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

  return { balance: bal, consumed: consume ? inputKg : 0, finishedKg, isJobWork, events: events as AuditEvent[] };
}

/**
 * After the transaction has committed: the Quality Lab record from the stage quality parameters, and the audit event.
 * Neither can fail the batch (they run after it is already closed).
 */
export function afterBatchFinalized(p: { shopId: string; batchId: string; finishedKg: number; lossKg: number; isJobWork: boolean; events?: AuditEvent[] }) {
  // the audit rows of the lots / stock credits, in ONE insert
  if (p.events?.length) recordAuditEvents(p.shopId, p.events).catch(() => {});
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
