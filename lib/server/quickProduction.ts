import { randomUUID } from 'crypto';
import prisma from '@/lib/server/prisma';
import { ApiError } from '@/lib/server/http';
import { withTenantIdempotency } from '@/lib/server/idempotency';
import { parseLossKg, parseOutputs, toKg, kgPerUnit, round3 } from '@/lib/server/millProduction';
import { prepareOutputCredits, finalizeBatchTx, afterBatchFinalized } from '@/lib/server/productionFinalize';
import { recordStageAuditEvent } from '@/lib/server/audit';
import { setBatchJobWork } from '@/lib/server/jobWorkLink';
import { QUICK_SOURCES, type QuickSource } from '@/lib/quickEntry';

/**
 * Quick Production Entry — one form instead of batch -> start -> stages -> finalize.
 *
 * In ONE transaction it opens a batch (a single "Production" stage), takes the input from its source, and closes the run with the
 * same engine the stage-based Finalize uses (productionFinalize.ts): raw material consumed, finished goods / by-products / WIP /
 * rejections booked into their own lots and stock, input = outputs + loss enforced. If anything fails nothing is written.
 *
 * Input sources:
 *   raw_lot    a purchased raw material lot (consumed at the end, like any batch)
 *   job_work   a customer's grain on a Job Work order (never mill stock; the order is completed and charged with the run)
 *   wip        a work-in-progress lot made by an earlier run
 *   rejection  a rejection lot sent for reprocessing
 */

const STAGE_NAME = 'Production';

type Source = { type: QuickSource; id: string };

function parseSource(raw: any): Source {
  const type = String(raw?.type ?? '').trim() as QuickSource;
  if (!QUICK_SOURCES.includes(type)) throw new ApiError(400, `source.type must be one of ${QUICK_SOURCES.join(', ')}.`, 'INVALID_SOURCE');
  const id = String(raw?.id ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new ApiError(400, 'Select the lot / order this production uses.', 'SOURCE_REQUIRED');
  return { type, id };
}

async function nextBatchNumber(tx: any, shopId: string): Promise<string> {
  const d = new Date();
  const prefix = `B-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const same = await tx.productionBatch.count({ where: { shopId, batchNumber: { startsWith: prefix } } });
  return `${prefix}-${String(same + 1).padStart(3, '0')}`;
}

export type QuickEntryResult = {
  batchId: string;
  batchNumber: string;
  inputKg: number;
  finishedKg: number;
  lossKg: number;
  yieldPct: number | null;
  source: QuickSource;
};

export async function createQuickEntry(shop: any, body: any, idempotencyKey?: string | null): Promise<{ result: QuickEntryResult; isDuplicate: boolean }> {
  const shopId: string = shop.id;
  const allowNegativeStock = Boolean(shop.allowNegativeStock);

  // ---- shape checks only; everything stock-related is re-read from the DB under lock below ----
  const source = parseSource(body.source);
  const enteredQty = Number(body.inputQuantity ?? body.inputKg);
  if (!isFinite(enteredQty) || enteredQty <= 0) throw new ApiError(400, 'Enter how much material was used (a positive number).', 'INVALID_QUANTITY');
  const inputKg = toKg(enteredQty, body.unit ?? 'kg');
  if (inputKg <= 0) throw new ApiError(400, 'Enter how much material was used (a positive number).', 'INVALID_QUANTITY');

  const outputs = parseOutputs(body.outputs);
  const lossKg = parseLossKg(body.lossKg);
  const credits = await prepareOutputCredits(shopId, outputs);

  const operatorName = String(body.operatorName ?? '').trim().slice(0, 80) || null;
  const userNotes = String(body.notes ?? '').trim().slice(0, 200) || null;
  const startedAt = body.startedAt ? new Date(body.startedAt) : new Date();
  if (isNaN(startedAt.getTime())) throw new ApiError(400, 'Invalid date.', 'INVALID_DATE');

  let machineId: string | null = body.machineId ? String(body.machineId) : null;
  if (machineId) {
    const m = await (prisma as any).machine.findFirst({ where: { id: machineId, shopId }, select: { id: true } });
    if (!m) throw new ApiError(404, 'Machine not found for this shop', 'MACHINE_NOT_FOUND');
  }

  const events: Array<{ action: string; entityId: string; details: Record<string, any> }> = [];

  const outcome = await prisma.$transaction(async (tx: any) => {
    return withTenantIdempotency<QuickEntryResult>(tx, {
      shopId,
      idempotencyKey,
      entityType: 'quick_production',
      handler: async () => {
        const batchId = randomUUID();
        const batchNumber = String(body.batchNumber ?? '').trim().slice(0, 40) || (await nextBatchNumber(tx, shopId));

        let batchType = 'NORMAL';
        let rawLotId: string | null = null;
        let rejectionLotId: string | null = null;
        let rawProductId: string | null = null;
        let jwOrder: any = null;
        let sourceNote = '';
        const inputLotRows: any[] = [];

        // ---------------- take the input from its source ----------------
        if (source.type === 'raw_lot') {
          const lots = await tx.$queryRaw<any[]>`
            SELECT id, product_id, quantity, remaining_quantity, lot_number FROM raw_material_lots
            WHERE id = ${source.id}::uuid AND shop_id = ${shopId}::uuid FOR UPDATE`;
          const lot = lots[0];
          if (!lot) throw new ApiError(404, 'Source raw material lot not found for this shop', 'LOT_NOT_FOUND');
          if (!lot.product_id) throw new ApiError(400, 'Link this raw material lot to its raw material product (Raw Material screen) before producing from it — that is the stock the run consumes.', 'RAW_PRODUCT_REQUIRED');
          const unconsumed = round3(Number(lot.remaining_quantity ?? lot.quantity ?? 0));
          if (unconsumed <= 0) throw new ApiError(400, 'That raw material lot is fully consumed — choose an available lot.', 'LOT_UNAVAILABLE');
          const active = await tx.productionBatch.findMany({ where: { rawLotId: source.id, shopId, status: { in: ['open', 'in_progress'] } }, select: { inputKg: true } });
          const allocated = round3(active.reduce((s: number, b: any) => s + (Number(b.inputKg) || 0), 0));
          const available = round3(Math.max(0, unconsumed - allocated));
          if (available < inputKg) throw new ApiError(400, `Only ${available} kg remaining in lot ${lot.lot_number || ''} — cannot use ${inputKg} kg.`, 'INSUFFICIENT_RAW_STOCK');
          rawLotId = source.id;
          rawProductId = lot.product_id;
          sourceNote = `Raw lot ${lot.lot_number || source.id.slice(0, 8)}`;
          inputLotRows.push({ id: randomUUID(), shopId, batchId, rawMaterialLotId: source.id, quantity: inputKg, unit: 'kg', sequence: 1 });
        } else if (source.type === 'job_work') {
          const order = await tx.jobWorkOrder.findFirst({ where: { id: source.id, shopId }, include: { customer: true } });
          if (!order) throw new ApiError(404, 'Job work order not found for this shop', 'JOB_WORK_NOT_FOUND');
          if (order.status === 'completed' || order.status === 'delivered') throw new ApiError(400, 'Job Work order is already completed or delivered', 'JOB_WORK_ALREADY_COMPLETED');
          const moved = await tx.jobWorkOrder.updateMany({ where: { id: order.id, shopId, status: { in: ['received', 'processing'] } }, data: { status: 'processing' } });
          if (moved.count === 0) throw new ApiError(409, 'This Job Work order is no longer open', 'INVALID_STATUS');
          batchType = 'JOB_WORK';
          jwOrder = order;
          sourceNote = `Job Work: ${order.orderNumber} (${order.customer?.name || 'Customer'}) · ${order.materialDescription}`;
        } else if (source.type === 'wip') {
          const wip = await tx.wipLot.findFirst({ where: { id: source.id, shopId } });
          if (!wip) throw new ApiError(404, 'WIP Lot not found for this shop', 'WIP_LOT_NOT_FOUND');
          if (wip.status === 'BLOCKED' || wip.status === 'FULLY_CONSUMED') throw new ApiError(400, `WIP Lot #${wip.lotNumber} is ${String(wip.status).toLowerCase().replace('_', ' ')} and cannot be used.`, 'WIP_LOT_UNAVAILABLE');
          const perUnit = kgPerUnit(wip.unit);
          if (perUnit === null) throw new ApiError(400, `WIP Lot #${wip.lotNumber} is kept in "${wip.unit}", which is not a weight unit.`, 'UNIT_NOT_WEIGHT');
          const qtyInLotUnit = round3(inputKg / perUnit);
          // conditional decrement: two entries can never take the same kilos
          const took = await tx.$executeRaw`
            UPDATE wip_lots SET available_quantity = available_quantity - ${qtyInLotUnit},
                   status = CASE WHEN available_quantity - ${qtyInLotUnit} <= 0.0001 THEN 'FULLY_CONSUMED' ELSE 'PARTIALLY_CONSUMED' END
            WHERE id = ${wip.id}::uuid AND shop_id = ${shopId}::uuid AND available_quantity >= ${qtyInLotUnit} - 0.0001`;
          if (took === 0) throw new ApiError(400, `Insufficient quantity in WIP Lot #${wip.lotNumber}. Available: ${wip.availableQuantity} ${wip.unit}, needed: ${qtyInLotUnit} ${wip.unit}.`, 'INSUFFICIENT_WIP_STOCK');
          sourceNote = `WIP lot ${wip.lotNumber}`;
          events.push({ action: 'WIP_LOT_CONSUMED', entityId: wip.id, details: { consumedQuantity: qtyInLotUnit, lotNumber: wip.lotNumber, batchId } });
        } else {
          const rj = await tx.rejectionLot.findFirst({ where: { id: source.id, shopId } });
          if (!rj) throw new ApiError(404, 'Rejection Lot not found', 'NOT_FOUND');
          if (['DISPOSED', 'BLOCKED', 'FULLY_REPROCESSED'].includes(rj.status)) throw new ApiError(400, `Cannot reprocess rejection lot with status ${rj.status}`, 'INVALID_STATUS');
          const took = await tx.$executeRaw`
            UPDATE rejection_lots SET available_quantity = GREATEST(available_quantity - ${inputKg}, 0),
                   status = CASE WHEN available_quantity - ${inputKg} <= 0.0001 THEN 'FULLY_REPROCESSED' ELSE 'PARTIALLY_REPROCESSED' END
            WHERE id = ${rj.id}::uuid AND shop_id = ${shopId}::uuid AND available_quantity >= ${inputKg} - 0.0001
              AND status NOT IN ('DISPOSED', 'BLOCKED', 'FULLY_REPROCESSED')`;
          if (took === 0) throw new ApiError(400, `Rejection Lot #${rj.lotNumber} only has ${rj.availableQuantity} ${rj.unit} remaining.`, 'REJECTION_STOCK_EXHAUSTED');
          batchType = 'REPROCESSING';
          rejectionLotId = rj.id;
          sourceNote = `Reprocessing from Rejection Lot ${rj.lotNumber}`;
          inputLotRows.push({ id: randomUUID(), shopId, batchId, rejectionLotId: rj.id, quantity: inputKg, unit: 'kg', sequence: 1, notes: `Reprocessed from Rejection Lot ${rj.lotNumber}` });
          events.push({ action: 'REJECTION_QUANTITY_CONSUMED', entityId: rj.id, details: { batchId, batchNumber, consumedQuantity: inputKg } });
        }

        // ---------------- the batch, its input, its single stage ----------------
        const finishedKg = round3(credits.filter((o) => o.outputType === 'finished_good').reduce((s, o) => s + o.quantityKg, 0));
        const firstFinished = credits.find((o) => o.outputType === 'finished_good' && o.productId);
        const batchNotes = [sourceNote, userNotes].filter(Boolean).join(' · ').slice(0, 250) || null;

        try {
          await tx.productionBatch.create({
            data: {
              id: batchId, shopId, batchNumber, batchType, rawLotId, rejectionLotId,
              outputProductId: firstFinished?.productId ?? null,
              inputKg, status: 'in_progress', currentStage: STAGE_NAME, startedAt, notes: batchNotes,
            },
          });
        } catch (e: any) {
          if (e?.code === 'P2002') throw new ApiError(409, `Batch number ${batchNumber} already exists.`, 'BATCH_NUMBER_EXISTS');
          throw e;
        }
        if (inputLotRows.length) await tx.batchInputLot.createMany({ data: inputLotRows });
        await tx.batchStage.create({
          data: {
            batchId, stageName: STAGE_NAME, sequence: 1, inputKg, operatorName, machineId, startedAt,
            outputKg: finishedKg, wastageKg: lossKg, completedAt: new Date(), notes: userNotes,
          },
        });
        // Raw-lot runs carry the `production_start` marker — it is what makes the engine consume the lot at the end.
        if (rawLotId && rawProductId) {
          await tx.stockMovement.create({ data: { shopId, productId: rawProductId, type: 'production_start', quantity: 0, referenceId: batchId } });
        }
        if (jwOrder) await setBatchJobWork(tx, batchId, jwOrder.id);

        // ---------------- close the run with the shared engine ----------------
        const fin = await finalizeBatchTx(tx, { shopId, batchId, credits, lossKg, notes: null, allowNegativeStock, jwOrder });
        events.push({ action: 'QUICK_PRODUCTION_ENTRY', entityId: batchId, details: { batchNumber, source: source.type, inputKg, finishedKg: fin.finishedKg, lossKg } });
        if (batchType === 'REPROCESSING') events.push({ action: 'REPROCESSING_BATCH_CREATED', entityId: batchId, details: { batchNumber, rejectionLotId, quantity: inputKg } });

        const pct = inputKg > 0 ? Math.round((fin.finishedKg / inputKg) * 1000) / 10 : null;
        return {
          serverId: batchId,
          response: { batchId, batchNumber, inputKg, finishedKg: fin.finishedKg, lossKg, yieldPct: pct, source: source.type },
        };
      },
    });
  }, { timeout: 90000, maxWait: 15000 });

  if (!outcome.isDuplicate) {
    const r = outcome.result;
    afterBatchFinalized({ shopId, batchId: r.batchId, finishedKg: r.finishedKg, lossKg: r.lossKg, isJobWork: r.source === 'job_work' });
    for (const ev of events) recordStageAuditEvent({ shopId, action: ev.action, entityId: ev.entityId, details: ev.details }).catch(() => {});
  }
  return { result: outcome.result, isDuplicate: outcome.isDuplicate };
}
