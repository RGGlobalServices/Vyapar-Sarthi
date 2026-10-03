import { randomUUID } from 'crypto';
import prisma from '@/lib/server/prisma';
import { ApiError } from '@/lib/server/http';
import { withTenantIdempotency } from '@/lib/server/idempotency';
import { parseLossKg, parseOutputs, toKg, kgPerUnit, round3 } from '@/lib/server/millProduction';
import { prepareOutputCredits, finalizeBatchTx, afterBatchFinalized } from '@/lib/server/productionFinalize';
import { recordAuditEvents } from '@/lib/server/productionWrites';
import { setBatchJobWork } from '@/lib/server/jobWorkLink';
import { reverseProductionTx } from '@/lib/server/productionReverse';
import { parsePackLines, insertPackLines, type PackLine } from '@/lib/server/packing';
import { QUICK_SOURCES, type QuickSource } from '@/lib/quickEntry';

/**
 * Quick Production Entry — one form instead of batch -> start -> stages -> finalize.
 *
 * In ONE transaction it opens a batch (a single "Production" stage), takes the input from its source, and closes the run with the
 * same engine the stage-based Finalize uses (productionFinalize.ts): raw material consumed, finished goods / by-products / WIP /
 * rejections booked into their own lots and stock, input = outputs + loss enforced. If anything fails nothing is written.
 *
 * Input sources:
 *   raw_lot    one purchased raw material lot, or SEVERAL lots of the same material at once (each consumed by its own weight)
 *   job_work   a customer's grain on a Job Work order (never mill stock; the order is completed and charged with the run)
 *   wip        a work-in-progress lot made by an earlier run
 *   rejection  a rejection lot sent for reprocessing
 */

const STAGE_NAME = 'Production';

type Source = { type: QuickSource; id: string; lots?: Array<{ id: string; kg: number }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseSource(raw: any): Source {
  const type = String(raw?.type ?? '').trim() as QuickSource;
  if (!QUICK_SOURCES.includes(type)) throw new ApiError(400, `source.type must be one of ${QUICK_SOURCES.join(', ')}.`, 'INVALID_SOURCE');
  if (type === 'raw_lot' && Array.isArray(raw?.lots) && raw.lots.length > 0) {
    if (raw.lots.length > 20) throw new ApiError(400, 'At most 20 lots in one production.', 'TOO_MANY_LOTS');
    const seen = new Set<string>();
    const lots = raw.lots.map((l: any) => {
      const lid = String(l?.id ?? '').trim();
      const kg = round3(Number(l?.quantityKg ?? l?.kg));
      if (!UUID_RE.test(lid)) throw new ApiError(400, 'Select the raw material lots this production uses.', 'SOURCE_REQUIRED');
      if (seen.has(lid)) throw new ApiError(400, 'The same lot is listed twice.', 'DUPLICATE_INPUT_LOT');
      seen.add(lid);
      if (!isFinite(kg) || kg <= 0) throw new ApiError(400, 'Enter a weight for every selected lot.', 'INVALID_QUANTITY');
      return { id: lid, kg };
    });
    return { type, id: lots[0].id, lots };
  }
  const id = String(raw?.id ?? '').trim();
  if (!UUID_RE.test(id)) throw new ApiError(400, 'Select the lot / order this production uses.', 'SOURCE_REQUIRED');
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

/**
 * `opts.replaceBatchId`: Edit-with-changes of a finished run — the old run is undone (productionReverse.ts) and the corrected one booked in the SAME
 * transaction, so either both happen or neither; the run keeps its batch number.
 */
export async function createQuickEntry(shop: any, body: any, idempotencyKey?: string | null, opts: { replaceBatchId?: string | null } = {}): Promise<{ result: QuickEntryResult; isDuplicate: boolean }> {
  const shopId: string = shop.id;
  const allowNegativeStock = Boolean(shop.allowNegativeStock);

  // ---- shape checks only; everything stock-related is re-read from the DB under lock below ----
  const source = parseSource(body.source);
  // several lots: the input is the sum of the lot weights; otherwise the entered quantity
  const enteredQty = source.lots ? source.lots.reduce((s, l) => s + l.kg, 0) : Number(body.inputQuantity ?? body.inputKg);
  if (!isFinite(enteredQty) || enteredQty <= 0) throw new ApiError(400, 'Enter how much material was used (a positive number).', 'INVALID_QUANTITY');
  const inputKg = source.lots ? round3(enteredQty) : toKg(enteredQty, body.unit ?? 'kg');
  if (inputKg <= 0) throw new ApiError(400, 'Enter how much material was used (a positive number).', 'INVALID_QUANTITY');

  const outputs = parseOutputs(body.outputs);
  const lossKg = parseLossKg(body.lossKg);
  const credits = await prepareOutputCredits(shopId, outputs);
  // how each ready product was packed (optional): ids are fixed here so the pack rows can point at their output
  const packRows: Array<{ outputId: string; lines: PackLine[] }> = [];
  credits.forEach((c, i) => {
    const outputId = randomUUID();
    (c as any).outputId = outputId;
    if (c.outputType === 'finished_good') {
      const lines = parsePackLines(body.outputs?.[i]?.packs, c.quantityKg, `Output ${i + 1} packing`);
      if (lines.length) packRows.push({ outputId, lines });
    }
  });

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
        let batchNumber = String(body.batchNumber ?? '').trim().slice(0, 40);
        if (opts.replaceBatchId) {
          const rev = await reverseProductionTx(tx, { shopId, batchId: opts.replaceBatchId, allowNegativeStock });
          if (!batchNumber) batchNumber = rev.batchNumber;
          events.push(...rev.events);
        }
        // a raw-lot run learns today's batch count from the same query that locks the lot; the other sources ask for it here
        if (!batchNumber && source.type !== 'raw_lot') batchNumber = await nextBatchNumber(tx, shopId);

        let batchType = 'NORMAL';
        let rawLotId: string | null = null;
        let rejectionLotId: string | null = null;
        let rawProductId: string | null = null;
        let jwOrder: any = null;
        let sourceNote = '';
        const inputLotRows: any[] = [];

        // ---------------- take the input from its source ----------------
        if (source.type === 'raw_lot') {
          // one lot (the whole input) or several lots of one material (each its own weight); locked in a fixed order so two runs cannot deadlock
          const wanted = source.lots ?? [{ id: source.id, kg: inputKg }];
          const ordered = [...wanted].sort((a, b) => (a.id < b.id ? -1 : 1));
          const nameById = new Map<string, string>();
          for (const w of ordered) {
            // lock the lot and read what is reserved by open batches (and today's batch count) in ONE query
            const d = new Date();
            const bnPrefix = `B-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
            const lots = await tx.$queryRaw<any[]>`
              SELECT l.id, l.product_id, l.quantity, l.remaining_quantity, l.lot_number,
                     COALESCE((SELECT SUM(CASE WHEN bil.id IS NOT NULL
                                               THEN bil.quantity * CASE lower(bil.unit) WHEN 'quintal' THEN 100 WHEN 'qtl' THEN 100 WHEN 'ton' THEN 1000 WHEN 'tons' THEN 1000 WHEN 'g' THEN 0.001 ELSE 1 END
                                               ELSE b.input_kg END)
                                 FROM production_batches b
                                 LEFT JOIN batch_input_lots bil ON bil.batch_id = b.id AND bil.raw_material_lot_id = l.id
                                WHERE b.shop_id = l.shop_id AND b.status IN ('open', 'in_progress') AND (bil.id IS NOT NULL OR b.raw_lot_id = l.id)), 0)::float8 AS allocated_kg,
                     (SELECT count(*)::int FROM production_batches WHERE shop_id = l.shop_id AND batch_number LIKE ${bnPrefix + '%'}) AS bn_count
                FROM raw_material_lots l
               WHERE l.id = ${w.id}::uuid AND l.shop_id = ${shopId}::uuid FOR UPDATE OF l`;
            if (!batchNumber && lots[0]) batchNumber = `${bnPrefix}-${String((Number(lots[0].bn_count) || 0) + 1).padStart(3, '0')}`;
            const lot = lots[0];
            if (!lot) throw new ApiError(404, 'Source raw material lot not found for this shop', 'LOT_NOT_FOUND');
            if (!lot.product_id) throw new ApiError(400, 'Link this raw material lot to its raw material product (Raw Material screen) before producing from it — that is the stock the run consumes.', 'RAW_PRODUCT_REQUIRED');
            if (rawProductId && lot.product_id !== rawProductId) throw new ApiError(400, 'All lots in one production must be of the same raw material.', 'PRODUCT_LOT_MISMATCH');
            rawProductId = lot.product_id;
            const unconsumed = round3(Number(lot.remaining_quantity ?? lot.quantity ?? 0));
            if (unconsumed <= 0) throw new ApiError(400, `Lot ${lot.lot_number || ''} is fully consumed — choose an available lot.`, 'LOT_UNAVAILABLE');
            const allocated = round3(Number(lot.allocated_kg) || 0);
            const available = round3(Math.max(0, unconsumed - allocated));
            if (available < w.kg) throw new ApiError(400, `Only ${available} kg remaining in lot ${lot.lot_number || ''} — cannot use ${w.kg} kg.`, 'INSUFFICIENT_RAW_STOCK');
            nameById.set(w.id, String(lot.lot_number || w.id.slice(0, 8)));
          }
          // keep the user's order for sequence / primary lot
          wanted.forEach((w, i) => inputLotRows.push({ id: randomUUID(), shopId, batchId, rawMaterialLotId: w.id, quantity: w.kg, unit: 'kg', sequence: i + 1 }));
          rawLotId = wanted[0].id;
          const names = wanted.map((w) => nameById.get(w.id) as string);
          sourceNote = `Raw lot${names.length > 1 ? 's' : ''} ${names.slice(0, 3).join(' + ')}${names.length > 3 ? ' …' : ''}`;
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

        // The batch, its input rows, its single completed stage and the 'production_start' marker (what makes the engine consume a raw
        // lot) go in as ONE statement — one round trip instead of four.
        try {
          await tx.$executeRawUnsafe(
            `WITH b AS (
               INSERT INTO production_batches (id, shop_id, batch_number, batch_type, raw_lot_id, rejection_lot_id, output_product_id, input_kg, status, current_stage, started_at, notes)
               VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6::uuid, $7::uuid, $8::float8, 'in_progress', $9, $10::timestamptz, $11) RETURNING 1),
             il AS (
               INSERT INTO batch_input_lots (id, shop_id, batch_id, raw_material_lot_id, rejection_lot_id, quantity, unit, sequence, notes)
               SELECT id, shop_id, batch_id, raw_material_lot_id, rejection_lot_id, quantity, unit, sequence, notes
                 FROM jsonb_to_recordset($12::jsonb) AS x(id uuid, shop_id uuid, batch_id uuid, raw_material_lot_id uuid, rejection_lot_id uuid, quantity float8, unit text, sequence int, notes text)
               RETURNING 1),
             st AS (
               INSERT INTO batch_stages (id, batch_id, stage_name, sequence, input_kg, output_kg, wastage_kg, started_at, completed_at, operator_name, notes, machine_id)
               VALUES ($13::uuid, $1::uuid, $9, 1, $8::float8, $14::float8, $15::float8, $10::timestamptz, now(), $16, $17, $18::uuid) RETURNING 1),
             mk AS (
               INSERT INTO stock_movements (id, shop_id, product_id, type, quantity, reference_id)
               SELECT $19::uuid, $2::uuid, $20::uuid, 'production_start', 0, $1::uuid WHERE $20::uuid IS NOT NULL RETURNING 1)
             SELECT 1`,
            batchId, shopId, batchNumber, batchType, rawLotId, rejectionLotId, firstFinished?.productId ?? null, inputKg, STAGE_NAME,
            startedAt.toISOString(), batchNotes,
            JSON.stringify(inputLotRows.map((r) => ({ id: r.id, shop_id: r.shopId, batch_id: r.batchId, raw_material_lot_id: r.rawMaterialLotId ?? null, rejection_lot_id: r.rejectionLotId ?? null, quantity: r.quantity, unit: r.unit, sequence: r.sequence, notes: r.notes ?? null }))),
            randomUUID(), finishedKg, lossKg, operatorName, userNotes, machineId,
            randomUUID(), rawLotId && rawProductId ? rawProductId : null,
          );
        } catch (e: any) {
          if (/23505|unique constraint|production_batches_shop_id_batch_number_key/i.test(String(e?.message || '') + String(e?.meta?.message || '') + String(e?.code || ''))) {
            throw new ApiError(409, `Batch number ${batchNumber} already exists.`, 'BATCH_NUMBER_EXISTS');
          }
          throw e;
        }
        if (jwOrder) await setBatchJobWork(tx, batchId, jwOrder.id);

        // ---------------- close the run with the shared engine ----------------
        const consumeRaw = batchType !== 'JOB_WORK' && !!(rawLotId && rawProductId);
        const fin = await finalizeBatchTx(tx, {
          shopId, batchId, credits, lossKg, notes: null, allowNegativeStock, jwOrder,
          // everything about the batch is known (we have just created it) — no need to read it back
          prefetched: {
            batchNumber, inputKg, batchType, consume: consumeRaw,
            lots: inputLotRows.filter((r) => r.rawMaterialLotId).map((r) => ({ lotId: r.rawMaterialLotId as string, qtyKg: r.quantity })),
            lastStageName: STAGE_NAME,
          },
        });
        events.push(...fin.events);
        await insertPackLines(tx, shopId, batchId, packRows);
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
    recordAuditEvents(shopId, events).catch(() => {});
  }
  return { result: outcome.result, isDuplicate: outcome.isDuplicate };
}
