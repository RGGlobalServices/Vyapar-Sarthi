import { ApiError } from '@/lib/server/http';
import { kgPerUnit, round3, toKg } from '@/lib/server/millProduction';
import { jobWorkLinkColumn } from '@/lib/server/jobWorkLink';
import type { AuditEvent } from '@/lib/server/productionWrites';

/**
 * Undo a CLOSED production run (Delete / Edit-with-changes of a run), inside the caller's transaction.
 *
 * It is the exact mirror of closing a run (productionFinalize.ts + productionWrites.ts):
 *   the input goes back  — raw lot(s) / WIP lot / rejection lot get their kilos back (product + godown stock follow), a Job Work order
 *                          goes back to "received" and its milling charge is taken off the customer;
 *   the outputs go away  — finished goods / WIP / rejection lots, by-product rows, batch-wise lots, product + godown stock credited;
 *   a 'production_reversal' stock movement is written for every stock change, so the stock history still explains the numbers.
 *
 * It REFUSES (nothing is written) when the run's output has already been used — a finished-goods / WIP / rejection lot that was
 * partly sold, issued on a challan or reprocessed, a by-product that was sold, or product stock that is no longer there — because
 * undoing it would leave the stock wrong. The message says exactly which one.
 */

const OUTPUT_MOVEMENTS = ['production_output', 'production_wip', 'production_byproduct', 'production_rejection'];
const EPS = 0.0005;

type Lot = { id: string; lot_number: string; product_id: string | null; quantity: number; available_quantity: number; godown_id: string | null };

export async function reverseProductionTx(
  tx: any,
  p: { shopId: string; batchId: string; allowNegativeStock: boolean },
): Promise<{ batchNumber: string; startedAt: Date; events: AuditEvent[] }> {
  const { shopId, batchId, allowNegativeStock } = p;

  // ---- one read: the batch and everything it created ----
  const rows: any[] = await tx.$queryRawUnsafe(
    `SELECT b.id::text AS id, b.batch_number, b.batch_type, b.status, b.raw_lot_id::text AS raw_lot_id, b.rejection_lot_id::text AS rejection_lot_id,
            COALESCE(b.input_kg, 0)::float8 AS input_kg, b.notes, b.started_at,
       (SELECT COALESCE(jsonb_agg(jsonb_build_object('lot_id', raw_material_lot_id, 'quantity', quantity, 'unit', unit) ORDER BY sequence), '[]'::jsonb)
          FROM batch_input_lots WHERE batch_id = b.id AND raw_material_lot_id IS NOT NULL) AS in_lots,
       (SELECT count(*)::int FROM stock_movements WHERE shop_id = b.shop_id AND reference_id = b.id AND type = 'production_start') AS marker,
       (SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id', product_id, 'type', type, 'qty', q)), '[]'::jsonb)
          FROM (SELECT product_id, type, sum(quantity)::float8 AS q FROM stock_movements
                 WHERE shop_id = b.shop_id AND reference_id = b.id AND type = ANY($3::text[]) AND product_id IS NOT NULL GROUP BY product_id, type) m) AS moves,
       (SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (SELECT id::text AS id, lot_number, product_id::text AS product_id, quantity, available_quantity, godown_id::text AS godown_id
          FROM finished_goods_lots WHERE batch_id = b.id) x) AS fg,
       (SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (SELECT id::text AS id, lot_number, product_id::text AS product_id, quantity, available_quantity, godown_id::text AS godown_id
          FROM wip_lots WHERE batch_id = b.id) x) AS wip,
       (SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (SELECT id::text AS id, lot_number, product_id::text AS product_id, quantity, available_quantity, godown_id::text AS godown_id
          FROM rejection_lots WHERE batch_id = b.id) x) AS rj,
       (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'quantity_kg', quantity_kg, 'sold_kg', COALESCE(sold_kg, 0))), '[]'::jsonb) FROM by_products WHERE batch_id = b.id) AS bps,
       (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', x.id, 'product_id', x.product_id, 'batch_number', x.batch_number, 'quantity', x.quantity, 'initial_quantity', x.initial_quantity)), '[]'::jsonb)
          FROM batches x WHERE x.shop_id = b.shop_id AND EXISTS (SELECT 1 FROM production_outputs po WHERE po.batch_id = b.id AND po.product_id = x.product_id AND po.output_lot_number = x.batch_number)) AS vlots
       FROM production_batches b WHERE b.id = $1::uuid AND b.shop_id = $2::uuid FOR UPDATE OF b`,
    batchId, shopId, OUTPUT_MOVEMENTS,
  );
  const b = rows[0];
  if (!b) throw new ApiError(404, 'Production run not found', 'BATCH_NOT_FOUND');
  if (b.status !== 'closed') throw new ApiError(409, 'Only a finished production run can be deleted here. An open batch is cancelled from its own screen.', 'BATCH_NOT_CLOSED');

  const batchNumber = String(b.batch_number);
  const inputKg = Number(b.input_kg) || 0;
  const isJobWork = b.batch_type === 'JOB_WORK';
  const events: AuditEvent[] = [];

  // ---- 1. refuse if the output has been used ----
  const usedLot = (kind: string, l: Lot) => new ApiError(
    409,
    `${kind} lot ${l.lot_number} (${round3(l.quantity)}) from this run has already been used — only ${round3(l.available_quantity)} is left. A run whose output was used cannot be deleted.`,
    'BATCH_OUTPUT_USED',
  );
  for (const l of b.fg as Lot[]) if (Number(l.available_quantity) < Number(l.quantity) - EPS) throw usedLot('Finished goods', l);
  for (const l of b.wip as Lot[]) if (Number(l.available_quantity) < Number(l.quantity) - EPS) throw usedLot('WIP', l);
  for (const l of b.rj as Lot[]) if (Number(l.available_quantity) < Number(l.quantity) - EPS) throw usedLot('Rejected', l);
  for (const bp of b.bps as any[]) {
    if (Number(bp.sold_kg) > EPS) throw new ApiError(409, `By-product "${bp.name}" from this run has already been sold (${round3(Number(bp.sold_kg))} kg). A run whose output was used cannot be deleted.`, 'BATCH_OUTPUT_USED');
  }
  for (const v of b.vlots as any[]) {
    if (Number(v.quantity) < Number(v.initial_quantity) - EPS) throw new ApiError(409, `Stock from this run (lot ${v.batch_number}) has already been used or sold. A run whose output was used cannot be deleted.`, 'BATCH_OUTPUT_USED');
  }

  // ---- 2. what each product's stock got from this run ----
  const credit = new Map<string, number>();      // all outputs, per product
  const fgCredit = new Map<string, number>();    // finished goods only (these also went into the godown)
  for (const m of b.moves as Array<{ product_id: string; type: string; qty: number }>) {
    credit.set(m.product_id, round3((credit.get(m.product_id) || 0) + Number(m.qty)));
    if (m.type === 'production_output') fgCredit.set(m.product_id, round3((fgCredit.get(m.product_id) || 0) + Number(m.qty)));
  }
  // a finished-goods lot whose product stock had no movement row (unit not convertible): its stock credit was the lot quantity
  const fgWithMove = new Set((b.moves as any[]).filter((m) => m.type === 'production_output').map((m) => m.product_id));
  for (const l of b.fg as Lot[]) {
    if (l.product_id && !fgWithMove.has(l.product_id)) {
      credit.set(l.product_id, round3((credit.get(l.product_id) || 0) + Number(l.quantity)));
      fgCredit.set(l.product_id, round3((fgCredit.get(l.product_id) || 0) + Number(l.quantity)));
    }
  }
  const fgGodown = new Map<string, string>(); // product -> godown of its lots
  for (const l of b.fg as Lot[]) if (l.product_id && l.godown_id) fgGodown.set(l.product_id, l.godown_id);

  if (credit.size && !allowNegativeStock) {
    const have: Array<{ id: string; name: string; current_stock: number }> = await tx.$queryRawUnsafe(
      `SELECT id::text AS id, name, COALESCE(current_stock, 0)::float8 AS current_stock FROM products WHERE shop_id = $1::uuid AND id = ANY($2::uuid[])`,
      shopId, [...credit.keys()],
    );
    for (const h of have) {
      const need = credit.get(h.id) || 0;
      if (Number(h.current_stock) < need - EPS) {
        throw new ApiError(409, `This run added ${round3(need)} of ${h.name} to stock, but only ${round3(Number(h.current_stock))} is in stock now (the rest was sold or used). A run whose output was used cannot be deleted.`, 'BATCH_OUTPUT_USED');
      }
    }
  }

  // ---- 3. where the input goes back ----
  const rawBack: Array<{ lot_id: string; kg: number }> = [];
  let wipLotNumber: string | null = null;
  const sourceNote = String(b.notes || '');
  if (!isJobWork && b.marker > 0 && b.raw_lot_id) {
    const inLots = b.in_lots as Array<{ lot_id: string; quantity: number; unit: string }>;
    if (inLots.length > 1) for (const l of inLots) rawBack.push({ lot_id: l.lot_id, kg: toKg(Number(l.quantity), l.unit) });
    else rawBack.push({ lot_id: inLots[0]?.lot_id || (b.raw_lot_id as string), kg: inputKg });
  } else if (!isJobWork && b.batch_type !== 'REPROCESSING' && !b.raw_lot_id && /^WIP lot /i.test(sourceNote)) {
    wipLotNumber = sourceNote.slice('WIP lot '.length).split(' · ')[0].trim();
  }

  // Job Work order of this run
  let jwOrder: any = null;
  if (isJobWork) {
    let orderId: string | null = null;
    if (await jobWorkLinkColumn()) {
      const r: any[] = await tx.$queryRawUnsafe(`SELECT job_work_order_id::text AS id FROM production_batches WHERE id = $1::uuid`, batchId);
      orderId = r[0]?.id ?? null;
    }
    if (orderId) jwOrder = await tx.jobWorkOrder.findFirst({ where: { id: orderId, shopId } });
    else {
      const m = sourceNote.match(/^Job Work: (\S+)/);
      if (m) jwOrder = await tx.jobWorkOrder.findFirst({ where: { shopId, orderNumber: m[1] } });
    }
    if (jwOrder && jwOrder.status === 'delivered') {
      throw new ApiError(409, `Job Work order ${jwOrder.orderNumber} has already been delivered to the customer — this run cannot be deleted.`, 'JOB_WORK_DELIVERED');
    }
  }

  // ---- 4. put the input back ----
  if (rawBack.length) {
    await tx.$executeRawUnsafe(
      `WITH l AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(lot_id uuid, kg float8)),
       up AS (UPDATE raw_material_lots r SET remaining_quantity = COALESCE(r.remaining_quantity, 0) + l.kg FROM l WHERE r.id = l.lot_id AND r.shop_id = $2::uuid RETURNING r.product_id, r.godown_id, l.kg),
       pr AS (UPDATE products pd SET current_stock = COALESCE(pd.current_stock, 0) + s.kg
                FROM (SELECT product_id, sum(kg) AS kg FROM up WHERE product_id IS NOT NULL GROUP BY product_id) s WHERE pd.id = s.product_id AND pd.shop_id = $2::uuid RETURNING 1),
       mv AS (INSERT INTO stock_movements (id, shop_id, product_id, type, quantity, reference_id)
              SELECT gen_random_uuid(), $2::uuid, product_id, 'production_reversal', sum(kg), $3::uuid FROM up WHERE product_id IS NOT NULL GROUP BY product_id RETURNING 1),
       gp AS (INSERT INTO godown_products (id, godown_id, product_id, quantity, updated_at)
              SELECT gen_random_uuid(), godown_id, product_id, sum(kg), now() FROM up WHERE godown_id IS NOT NULL AND product_id IS NOT NULL GROUP BY godown_id, product_id
              ON CONFLICT (godown_id, product_id) DO UPDATE SET quantity = godown_products.quantity + EXCLUDED.quantity, updated_at = now() RETURNING 1)
       SELECT count(*)::int AS n FROM up`,
      JSON.stringify(rawBack), shopId, batchId,
    );
  }
  if (wipLotNumber) {
    const w: any[] = await tx.$queryRawUnsafe(`SELECT id::text AS id, unit, quantity::float8 AS quantity FROM wip_lots WHERE shop_id = $1::uuid AND lot_number = $2 LIMIT 1`, shopId, wipLotNumber);
    const per = w[0] ? kgPerUnit(w[0].unit) : null;
    if (!w[0] || per === null) throw new ApiError(409, `The WIP lot ${wipLotNumber} this run used could not be found, so its material cannot be put back. Nothing was changed.`, 'SOURCE_LOT_MISSING');
    const back = round3(inputKg / per);
    await tx.$executeRawUnsafe(
      `UPDATE wip_lots SET available_quantity = LEAST(quantity, available_quantity + $1::float8),
              status = CASE WHEN available_quantity + $1::float8 >= quantity - 0.0001 THEN 'AVAILABLE' ELSE 'PARTIALLY_CONSUMED' END
        WHERE id = $2::uuid AND shop_id = $3::uuid`, back, w[0].id, shopId);
  }
  if (b.batch_type === 'REPROCESSING' && b.rejection_lot_id) {
    await tx.$executeRawUnsafe(
      `UPDATE rejection_lots SET available_quantity = LEAST(quantity, available_quantity + $1::float8),
              status = CASE WHEN status IN ('DISPOSED', 'BLOCKED') THEN status
                            WHEN available_quantity + $1::float8 >= quantity - 0.0001 THEN 'AVAILABLE' ELSE 'PARTIALLY_REPROCESSED' END
        WHERE id = $2::uuid AND shop_id = $3::uuid`, inputKg, b.rejection_lot_id, shopId);
  }
  if (jwOrder) {
    await tx.jobWorkOrder.update({ where: { id: jwOrder.id }, data: { status: 'received', outputWeightKg: null, feeAmount: null, completedAt: null } });
    if (jwOrder.customerId) {
      const charge = await tx.customer_transactions.findFirst({
        where: { customer_id: jwOrder.customerId, type: 'charge', note: { startsWith: `Job Work Milling Charge — Order ${jwOrder.orderNumber}` } },
        orderBy: { created_at: 'desc' },
      });
      if (charge) {
        await tx.customer_transactions.delete({ where: { id: charge.id } });
        await tx.customer.update({ where: { id: jwOrder.customerId }, data: { totalDue: { decrement: Number(charge.amount) || 0 } } });
      }
    }
  }

  // ---- 5. take the output away ----
  const stockRows = [...credit.entries()].filter(([, q]) => q !== 0).map(([id, qty]) => ({ id, qty }));
  const godownRows = [...fgCredit.entries()].filter(([pid, q]) => q !== 0 && fgGodown.has(pid)).map(([pid, qty]) => ({ godown_id: fgGodown.get(pid), product_id: pid, qty }));
  await tx.$executeRawUnsafe(
    `WITH s AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, qty float8)),
     pr AS (UPDATE products SET current_stock = COALESCE(products.current_stock, 0) - s.qty FROM s WHERE products.id = s.id AND products.shop_id = $2::uuid RETURNING 1),
     mv AS (INSERT INTO stock_movements (id, shop_id, product_id, type, quantity, reference_id) SELECT gen_random_uuid(), $2::uuid, s.id, 'production_reversal', -s.qty, $3::uuid FROM s RETURNING 1),
     gd AS (UPDATE godown_products g SET quantity = g.quantity - v.qty, updated_at = now()
              FROM jsonb_to_recordset($4::jsonb) AS v(godown_id uuid, product_id uuid, qty float8) WHERE g.godown_id = v.godown_id AND g.product_id = v.product_id RETURNING 1),
     d1 AS (DELETE FROM batches WHERE shop_id = $2::uuid AND id = ANY($5::uuid[]) RETURNING 1),
     d2 AS (DELETE FROM by_products WHERE batch_id = $3::uuid RETURNING 1),
     d3 AS (DELETE FROM quality_tests WHERE batch_id = $3::uuid AND notes LIKE 'Auto-created%' RETURNING 1)
     SELECT 1`,
    JSON.stringify(stockRows), shopId, batchId, JSON.stringify(godownRows), (b.vlots as any[]).map((v) => v.id),
  );

  // the run itself — its stages, input rows, outputs and FG / WIP / rejection lots go with it (cascade)
  await tx.$executeRawUnsafe(`DELETE FROM production_batches WHERE id = $1::uuid AND shop_id = $2::uuid`, batchId, shopId);

  events.push({ action: 'PRODUCTION_REVERSED', entityId: batchId, details: { batchNumber, inputKg, batchType: b.batch_type } });
  return { batchNumber, startedAt: b.started_at instanceof Date ? b.started_at : new Date(b.started_at), events };
}
