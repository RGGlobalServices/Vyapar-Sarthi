import prisma from '@/lib/server/prisma';

/**
 * batches.variant_key and sale_item_batches.price_at_sale come from supabase/16_lot_variant_key_and_price_at_sale.sql.
 * They are deliberately NOT in prisma/schema.prisma: Prisma selects every modelled column, so a build deployed
 * before the migration was run would fail on every batch query and take billing down with it. Instead these
 * two columns are read/written with small raw queries that only run once the columns are known to exist,
 * which makes the deploy order irrelevant and leaves existing data untouched.
 */

let ready: { variantKey: boolean; priceAtSale: boolean } | null = null;
let checkedAt = 0;
const RECHECK_MS = 60_000;

export async function lotColumns(): Promise<{ variantKey: boolean; priceAtSale: boolean }> {
  const now = Date.now();
  // Positive results are permanent for this process; a "not yet" is re-checked every minute so running the
  // migration takes effect without a restart.
  if (ready && ((ready.variantKey && ready.priceAtSale) || now - checkedAt < RECHECK_MS)) return ready;
  try {
    const rows = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND ((table_name = 'batches' AND column_name = 'variant_key')
          OR (table_name = 'sale_item_batches' AND column_name = 'price_at_sale'))`;
    ready = {
      variantKey: rows.some((r) => r.table_name === 'batches' && r.column_name === 'variant_key'),
      priceAtSale: rows.some((r) => r.table_name === 'sale_item_batches' && r.column_name === 'price_at_sale'),
    };
  } catch {
    ready = { variantKey: false, priceAtSale: false };
  }
  checkedAt = now;
  return ready;
}

type Db = Pick<typeof prisma, '$queryRaw' | '$executeRawUnsafe'>;

/** batchId -> variant_key for the given batches (empty map when the column does not exist yet). */
export async function readLotVariantKeys(db: Db, batchIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (!batchIds.length || !(await lotColumns()).variantKey) return out;
  const rows = await db.$queryRaw<Array<{ id: string; variant_key: string | null }>>`
    SELECT id::text AS id, variant_key FROM batches WHERE id = ANY(${batchIds}::uuid[])`;
  for (const r of rows) out.set(r.id, r.variant_key);
  return out;
}

/** Tags a lot with the variant it was bought for. No-op until the column exists or when there is no variant. */
export async function setLotVariantKey(db: Db, batchId: string, variantKey: string | null | undefined) {
  const key = String(variantKey ?? '').trim();
  if (!key || !(await lotColumns()).variantKey) return;
  await db.$executeRawUnsafe(`UPDATE batches SET variant_key = $1 WHERE id = $2::uuid`, key, batchId);
}

/** Records the price each lot was sold at on a bill. No-op until the column exists. */
export async function savePriceAtSale(db: Db, rows: Array<{ saleItemId: string; batchId: string; price: number }>) {
  if (!rows.length || !(await lotColumns()).priceAtSale) return;
  await db.$executeRawUnsafe(
    `UPDATE sale_item_batches AS s SET price_at_sale = v.price
       FROM (SELECT unnest($1::uuid[]) AS sale_item_id, unnest($2::uuid[]) AS batch_id, unnest($3::float8[]) AS price) AS v
      WHERE s.sale_item_id = v.sale_item_id AND s.batch_id = v.batch_id`,
    rows.map((r) => r.saleItemId), rows.map((r) => r.batchId), rows.map((r) => r.price),
  );
}
