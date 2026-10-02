import prisma from '@/lib/server/prisma';

/**
 * How much of each raw material lot is reserved by batches that are open / in progress (not yet finalized).
 *
 * A batch can draw from SEVERAL lots (one product, many lots), so the share of each lot comes from the batch's input-lot rows
 * (batch_input_lots). A batch without a row for the lot but pointing at it through raw_lot_id (older batches) reserves its whole
 * input weight against that lot — so single-lot batches behave exactly as before. Weights are in kg.
 */

type Db = Pick<typeof prisma, '$queryRaw'>;

export type LotAllocation = { kg: number; inProgress: boolean };

export async function allocatedByLot(db: Db, shopId: string, lotIds: string[]): Promise<Map<string, LotAllocation>> {
  const out = new Map<string, LotAllocation>();
  if (!lotIds.length) return out;
  const rows = await db.$queryRaw<Array<{ lot_id: string; kg: number; in_progress: boolean }>>`
    SELECT l.id::text AS lot_id,
           COALESCE(SUM(CASE WHEN bil.id IS NOT NULL
                             THEN bil.quantity * CASE lower(bil.unit) WHEN 'quintal' THEN 100 WHEN 'qtl' THEN 100 WHEN 'ton' THEN 1000 WHEN 'tons' THEN 1000 WHEN 'g' THEN 0.001 ELSE 1 END
                             ELSE b.input_kg END), 0)::float8 AS kg,
           COALESCE(bool_or(b.status = 'in_progress'), false) AS in_progress
      FROM raw_material_lots l
      JOIN production_batches b ON b.shop_id = l.shop_id AND b.status IN ('open', 'in_progress')
      LEFT JOIN batch_input_lots bil ON bil.batch_id = b.id AND bil.raw_material_lot_id = l.id
     WHERE l.shop_id = ${shopId}::uuid AND l.id = ANY(${lotIds}::uuid[]) AND (bil.id IS NOT NULL OR b.raw_lot_id = l.id)
     GROUP BY l.id`;
  for (const r of rows) out.set(r.lot_id, { kg: Math.round(Number(r.kg) * 1000) / 1000, inProgress: !!r.in_progress });
  return out;
}
