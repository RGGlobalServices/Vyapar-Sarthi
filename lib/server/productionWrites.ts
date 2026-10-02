import { randomUUID } from 'crypto';
import prisma from '@/lib/server/prisma';
import { ApiError } from '@/lib/server/http';
import { round3 } from '@/lib/server/millProduction';
import type { OutputCredit } from '@/lib/server/productionFinalize';

/**
 * The write side of closing a production run, folded into a handful of round trips.
 *
 * Every query to the database costs a network round trip, and a closed run used to need 40-60 of them (a product lookup, a lot
 * number count, a stock update, an audit row … repeated per output). Here the same writes are done with one statement per
 * concern, using data-modifying CTEs and jsonb record sets, so the number of round trips no longer grows with the number of
 * outputs. The rules are exactly the ones the old per-output services applied:
 *   - raw material: the lot is decremented only if enough is left; product stock and godown stock follow; one 'production_consume' movement
 *   - finished goods: an FG lot in the shop's first godown, product + godown stock credited (job-work batches: customer's grain, no FG lot)
 *   - by-product / WIP / rejected: stock credited and a movement + a batch-wise lot recorded (job work: by-products only if the mill keeps them)
 *   - by-products ledger, WIP lots, rejection lots, production outputs
 * Audit events are returned, not written here (the caller writes them in one insert after the commit).
 */

export type AuditEvent = { action: string; entityId: string; details: Record<string, any> };

const MOVEMENT_TYPE: Record<string, string> = {
  finished_good: 'production_output',
  wip: 'production_wip',
  by_product: 'production_byproduct',
  rejection: 'production_rejection',
};

/** Takes `qtyKg` out of one raw material lot (and its product + godown stock) in ONE statement. Throws if the lot / godown cannot cover it. */
export async function consumeRawLot(
  tx: any,
  p: { shopId: string; lotId: string; qtyKg: number; batchId: string; allowNegativeStock: boolean },
) {
  const rows: Array<{ product_id: string | null; godown_id: string | null; g_updated: number }> = await tx.$queryRawUnsafe(
    `WITH l AS (
       UPDATE raw_material_lots SET remaining_quantity = remaining_quantity - $1::float8
        WHERE id = $2::uuid AND shop_id = $3::uuid AND COALESCE(remaining_quantity, 0) >= $1::float8
       RETURNING product_id, godown_id),
     pr AS (
       UPDATE products SET current_stock = CASE WHEN $6::boolean THEN COALESCE(current_stock, 0) - $1::float8
                                                ELSE GREATEST(COALESCE(current_stock, 0) - $1::float8, 0) END
         FROM l WHERE products.id = l.product_id AND products.shop_id = $3::uuid
       RETURNING 1),
     mv AS (
       INSERT INTO stock_movements (id, shop_id, product_id, type, quantity, reference_id)
       SELECT $4::uuid, $3::uuid, l.product_id, 'production_consume', -($1::float8), $5::uuid FROM l WHERE l.product_id IS NOT NULL
       RETURNING 1),
     g AS (
       UPDATE godown_products gp SET quantity = gp.quantity - $1::float8, updated_at = now()
         FROM l WHERE gp.godown_id = l.godown_id AND gp.product_id = l.product_id AND ($6::boolean OR gp.quantity >= $1::float8)
       RETURNING 1),
     gi AS (
       INSERT INTO godown_products (id, godown_id, product_id, quantity, updated_at)
       SELECT gen_random_uuid(), l.godown_id, l.product_id, -($1::float8), now() FROM l
        WHERE $6::boolean AND l.godown_id IS NOT NULL AND l.product_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM godown_products x WHERE x.godown_id = l.godown_id AND x.product_id = l.product_id)
       RETURNING 1)
     SELECT l.product_id::text AS product_id, l.godown_id::text AS godown_id, (SELECT count(*)::int FROM g) AS g_updated FROM l`,
    p.qtyKg, p.lotId, p.shopId, randomUUID(), p.batchId, p.allowNegativeStock,
  );
  if (rows.length === 0) {
    const lot = await tx.$queryRawUnsafe(`SELECT remaining_quantity, lot_number FROM raw_material_lots WHERE id = $1::uuid AND shop_id = $2::uuid`, p.lotId, p.shopId);
    throw new ApiError(409, `Only ${round3(Number(lot[0]?.remaining_quantity) || 0)} left in lot ${lot[0]?.lot_number || p.lotId} — this batch needs ${p.qtyKg}.`, 'INSUFFICIENT_RAW_STOCK');
  }
  const r = rows[0];
  if (r.product_id && r.godown_id && !p.allowNegativeStock && Number(r.g_updated) === 0) {
    throw new ApiError(409, `Insufficient stock in Godown. Batch requires ${p.qtyKg} kg, but not enough is available there.`, 'INSUFFICIENT_GODOWN_STOCK');
  }
}

function lotPrefix(kind: 'FG' | 'WIP' | 'RJ', now: Date) {
  const d = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('');
  return `${kind}-${d}-`;
}

/** Next free numbers for `count` lots with this prefix: starts after the existing ones and skips any number already taken. */
function nextLotNumbers(prefix: string, existing: Set<string>, count: number): string[] {
  const out: string[] = [];
  let seq = existing.size + 1;
  while (out.length < count) {
    const cand = `${prefix}${String(seq).padStart(3, '0')}`;
    seq++;
    if (existing.has(cand)) continue;
    existing.add(cand);
    out.push(cand);
  }
  return out;
}

/** Books every output of a run (see the file header). Returns the audit events to record after the commit. */
export async function writeOutputsBulk(
  tx: any,
  p: { shopId: string; batchId: string; lotDefault: string; credits: OutputCredit[]; isJobWork: boolean; jwOrder: any },
): Promise<{ events: AuditEvent[] }> {
  const { shopId, batchId, lotDefault, credits, isJobWork, jwOrder } = p;
  const now = new Date();
  const events: AuditEvent[] = [];

  const mine = (type: string) => credits.filter((o) => o.outputType === type);
  const keepByProducts = !isJobWork || jwOrder?.byproductRetainedByMill !== false;

  // finished goods exist only for the mill's own production; WIP / rejected lots are always recorded
  const fgOutputs = isJobWork ? [] : mine('finished_good').filter((o) => o.productId);
  const wipOutputs = mine('wip').filter((o) => o.productId);
  const rjOutputs = mine('rejection').filter((o) => o.productId);

  // Which outputs credit product stock + get a movement and a batch-wise lot (everything but FG, which has its own lot below).
  const eligible = credits.filter((o) => {
    if (!o.productId || !o.stockQty) return false;
    if (o.outputType === 'finished_good') return false;
    if (!isJobWork) return true;
    return o.outputType === 'by_product' ? jwOrder?.byproductRetainedByMill !== false : false;
  });

  // ---- one read: the default godown and the lot numbers already used today ----
  let godownId: string | null = null;
  const fgTaken = new Set<string>(); const wipTaken = new Set<string>(); const rjTaken = new Set<string>();
  const needLots = fgOutputs.length + wipOutputs.length + rjOutputs.length > 0;
  if (needLots) {
    const prep: Array<{ k: string; v: string }> = await tx.$queryRawUnsafe(
      `SELECT 'godown' AS k, id::text AS v FROM (SELECT id FROM godowns WHERE shop_id = $1::uuid ORDER BY created_at ASC LIMIT 1) g
       UNION ALL SELECT 'fg', lot_number FROM finished_goods_lots WHERE shop_id = $1::uuid AND lot_number LIKE $2
       UNION ALL SELECT 'wip', lot_number FROM wip_lots WHERE shop_id = $1::uuid AND lot_number LIKE $3
       UNION ALL SELECT 'rj', lot_number FROM rejection_lots WHERE shop_id = $1::uuid AND lot_number LIKE $4`,
      shopId, `${lotPrefix('FG', now)}%`, `${lotPrefix('WIP', now)}%`, `${lotPrefix('RJ', now)}%`,
    );
    for (const r of prep) {
      if (r.k === 'godown') godownId = r.v;
      else if (r.k === 'fg') fgTaken.add(r.v);
      else if (r.k === 'wip') wipTaken.add(r.v);
      else rjTaken.add(r.v);
    }
  }
  const fgNums = nextLotNumbers(lotPrefix('FG', now), fgTaken, fgOutputs.length);
  const wipNums = nextLotNumbers(lotPrefix('WIP', now), wipTaken, wipOutputs.length);
  const rjNums = nextLotNumbers(lotPrefix('RJ', now), rjTaken, rjOutputs.length);

  // ---- rows ----
  const outputs = credits.map((o) => ({
    id: randomUUID(), shop_id: shopId, batch_id: batchId, product_id: o.productId, name: o.name, output_type: o.outputType,
    quantity: o.quantity, unit: o.unit, quantity_kg: o.quantityKg, output_lot_number: o.outputLotNumber || lotDefault, notes: o.notes,
  }));

  const moves: any[] = [];
  const stock = new Map<string, number>();
  const bump = (pid: string, q: number) => stock.set(pid, round3((stock.get(pid) || 0) + q));
  for (const o of eligible) {
    moves.push({ id: randomUUID(), shop_id: shopId, product_id: o.productId, type: MOVEMENT_TYPE[o.outputType], quantity: o.stockQty, reference_id: batchId });
    bump(o.productId!, o.stockQty!);
  }
  for (const o of fgOutputs) {
    if (o.stockQty) {
      moves.push({ id: randomUUID(), shop_id: shopId, product_id: o.productId, type: MOVEMENT_TYPE.finished_good, quantity: o.stockQty, reference_id: batchId });
    }
    bump(o.productId!, o.stockQty ?? round3(o.quantity));
  }

  const lots = eligible.map((o) => ({ id: randomUUID(), shop_id: shopId, product_id: o.productId, batch_number: o.outputLotNumber || lotDefault, quantity: o.stockQty }));

  const byProducts = keepByProducts
    ? mine('by_product').map((o) => ({
        id: randomUUID(), shop_id: shopId, batch_id: batchId, product_id: o.productId, name: o.name, quantity_kg: o.quantityKg,
        notes: isJobWork ? `Retained from Job Work Order ${jwOrder?.orderNumber || ''}` : o.notes,
      }))
    : [];

  const fgRows = fgOutputs.map((o, i) => {
    const id = randomUUID();
    const qty = round3(o.quantity);
    events.push({ action: 'FINISHED_GOOD_LOT_CREATED', entityId: id, details: { lotNumber: fgNums[i], quantity: qty, unit: o.unit, productId: o.productId, batchId, godownId } });
    events.push({ action: 'FINISHED_GOOD_STOCK_CREDITED', entityId: id, details: { lotNumber: fgNums[i], quantity: qty, unit: o.unit, productId: o.productId, godownId } });
    return { id, shop_id: shopId, lot_number: fgNums[i], product_id: o.productId, quantity: qty, unit: o.unit.trim().toLowerCase(), batch_id: batchId, godown_id: godownId, notes: o.notes };
  });
  const wipRows = wipOutputs.map((o, i) => {
    const id = randomUUID();
    const qty = round3(o.quantity);
    events.push({ action: 'WIP_LOT_CREATED', entityId: id, details: { lotNumber: wipNums[i], quantity: qty, unit: o.unit, productId: o.productId } });
    return { id, shop_id: shopId, lot_number: wipNums[i], product_id: o.productId, quantity: qty, unit: o.unit.trim().toLowerCase(), batch_id: batchId, notes: o.notes };
  });
  const rjRows = rjOutputs.map((o, i) => {
    const id = randomUUID();
    const qty = round3(o.quantity);
    const reason = o.notes || 'Quality/Specification Failure';
    events.push({ action: 'REJECTION_LOT_CREATED', entityId: id, details: { lotNumber: rjNums[i], quantity: qty, unit: o.unit, productId: o.productId, batchId, godownId, rejectionReason: reason } });
    events.push({ action: 'REJECTION_STOCK_RECORDED', entityId: id, details: { lotNumber: rjNums[i], quantity: qty, unit: o.unit, productId: o.productId, godownId } });
    return { id, shop_id: shopId, lot_number: rjNums[i], product_id: o.productId, quantity: qty, unit: o.unit.trim().toLowerCase(), batch_id: batchId, godown_id: godownId, rejection_reason: reason, notes: o.notes };
  });

  const stockRows = [...stock.entries()].map(([id, qty]) => ({ id, qty }));
  // godown stock follows the finished goods (summed per product)
  const gdMap = new Map<string, number>();
  if (godownId) for (const o of fgOutputs) gdMap.set(o.productId!, round3((gdMap.get(o.productId!) || 0) + (o.stockQty ?? round3(o.quantity))));
  const godownRows = [...gdMap.entries()].map(([pid, qty]) => ({ id: randomUUID(), godown_id: godownId, product_id: pid, qty }));

  const j = (v: any[]) => JSON.stringify(v);
  await tx.$executeRawUnsafe(
    `WITH
     o AS (INSERT INTO production_outputs (id, shop_id, batch_id, product_id, name, output_type, quantity, unit, quantity_kg, output_lot_number, notes)
           SELECT id, shop_id, batch_id, product_id, name, output_type, quantity, unit, quantity_kg, output_lot_number, notes
             FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, shop_id uuid, batch_id uuid, product_id uuid, name text, output_type text, quantity float8, unit text, quantity_kg float8, output_lot_number text, notes text)
           RETURNING 1),
     sm AS (INSERT INTO stock_movements (id, shop_id, product_id, type, quantity, reference_id)
            SELECT id, shop_id, product_id, type, quantity, reference_id
              FROM jsonb_to_recordset($2::jsonb) AS x(id uuid, shop_id uuid, product_id uuid, type text, quantity float8, reference_id uuid)
            RETURNING 1),
     lt AS (INSERT INTO batches (id, shop_id, product_id, batch_number, mfg_date, purchase_date, quantity, initial_quantity)
            SELECT id, shop_id, product_id, batch_number, now(), now(), quantity, quantity
              FROM jsonb_to_recordset($3::jsonb) AS x(id uuid, shop_id uuid, product_id uuid, batch_number text, quantity float8)
            RETURNING 1),
     bp AS (INSERT INTO by_products (id, shop_id, batch_id, product_id, name, quantity_kg, notes)
            SELECT id, shop_id, batch_id, product_id, name, quantity_kg, notes
              FROM jsonb_to_recordset($4::jsonb) AS x(id uuid, shop_id uuid, batch_id uuid, product_id uuid, name text, quantity_kg float8, notes text)
            RETURNING 1),
     fg AS (INSERT INTO finished_goods_lots (id, shop_id, lot_number, product_id, quantity, available_quantity, unit, batch_id, godown_id, status, notes)
            SELECT id, shop_id, lot_number, product_id, quantity, quantity, unit, batch_id, godown_id, 'AVAILABLE', notes
              FROM jsonb_to_recordset($5::jsonb) AS x(id uuid, shop_id uuid, lot_number text, product_id uuid, quantity float8, unit text, batch_id uuid, godown_id uuid, notes text)
            RETURNING 1),
     wp AS (INSERT INTO wip_lots (id, shop_id, lot_number, product_id, quantity, available_quantity, unit, batch_id, status, notes)
            SELECT id, shop_id, lot_number, product_id, quantity, quantity, unit, batch_id, 'AVAILABLE', notes
              FROM jsonb_to_recordset($6::jsonb) AS x(id uuid, shop_id uuid, lot_number text, product_id uuid, quantity float8, unit text, batch_id uuid, notes text)
            RETURNING 1),
     rj AS (INSERT INTO rejection_lots (id, shop_id, lot_number, product_id, quantity, available_quantity, unit, batch_id, godown_id, status, rejection_reason, notes)
            SELECT id, shop_id, lot_number, product_id, quantity, quantity, unit, batch_id, godown_id, 'AVAILABLE', rejection_reason, notes
              FROM jsonb_to_recordset($7::jsonb) AS x(id uuid, shop_id uuid, lot_number text, product_id uuid, quantity float8, unit text, batch_id uuid, godown_id uuid, rejection_reason text, notes text)
            RETURNING 1),
     st AS (UPDATE products SET current_stock = COALESCE(products.current_stock, 0) + v.qty
              FROM jsonb_to_recordset($8::jsonb) AS v(id uuid, qty float8)
             WHERE products.id = v.id AND products.shop_id = $9::uuid
            RETURNING 1),
     gd AS (INSERT INTO godown_products (id, godown_id, product_id, quantity, updated_at)
            SELECT id, godown_id, product_id, qty, now()
              FROM jsonb_to_recordset($10::jsonb) AS v(id uuid, godown_id uuid, product_id uuid, qty float8)
            ON CONFLICT (godown_id, product_id) DO UPDATE SET quantity = godown_products.quantity + EXCLUDED.quantity, updated_at = now()
            RETURNING 1)
     SELECT 1`,
    j(outputs), j(moves), j(lots), j(byProducts), j(fgRows), j(wipRows), j(rjRows), j(stockRows), shopId, j(godownRows),
  );

  return { events };
}

/** One insert for all audit rows of a run. Never throws: a failed audit entry must not undo or hide a booked production. */
export async function recordAuditEvents(shopId: string, events: AuditEvent[]) {
  if (!events.length) return;
  try {
    await prisma.activityLog.createMany({
      data: events.map((e) => ({ shopId, action: e.action, entityId: e.entityId, details: e.details })),
    });
  } catch (err) {
    console.error('Audit log batch failed non-fatally:', err);
  }
}
