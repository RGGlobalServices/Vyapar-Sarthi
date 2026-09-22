import type { Prisma, PrismaClient } from '@prisma/client';
import { ApiError } from '@/lib/server/http';

export type VariantStockDelta = { productId: string; variantKey: string | null | undefined; delta: number };

// Same "Colour / Size" (or bare size when the row has no colour) composite
// used by the Purchases and Billing UIs — see makeVariantKey/splitVariantKey
// in components/ColorSizeVariantGrid.tsx. Duplicated here (not imported)
// since that file is a 'use client' component and this runs server-only.
function rowKey(v: any): string {
  return v.color ? `${v.color} / ${v.size || ''}` : (v.size || '');
}

/**
 * Applies signed stock deltas to Product.variants[] JSON rows, batched and
 * locked per product in deterministic ID order to prevent lost updates under concurrency.
 */
export async function applyVariantStockDeltas(
  db: Prisma.TransactionClient | PrismaClient,
  deltas: VariantStockDelta[],
  shopId: string,
  opts?: { rejectNegative?: boolean }
): Promise<void> {
  // FOR UPDATE only holds inside a transaction. A caller passing the plain
  // client (post-commit best-effort callers) gets its own short one, so the
  // read-modify-write of the variants JSON can never interleave with another.
  if (typeof (db as PrismaClient).$transaction === 'function') {
    return (db as PrismaClient).$transaction((tx) => applyVariantStockDeltas(tx, deltas, shopId, opts), { maxWait: 30000, timeout: 60000 });
  }
  const byProduct = new Map<string, Map<string, number>>();
  for (const d of deltas) {
    if (!d.variantKey || !d.delta) continue;
    const perVariant = byProduct.get(d.productId) || new Map<string, number>();
    perVariant.set(d.variantKey, (perVariant.get(d.variantKey) || 0) + d.delta);
    byProduct.set(d.productId, perVariant);
  }

  // Deterministic order to prevent deadlocks across concurrent transactions
  const productIds = [...byProduct.keys()].sort();

  for (const productId of productIds) {
    const perVariant = byProduct.get(productId);
    if (!perVariant) continue;

    // Lock product row to prevent read-modify-write lost update on the variants JSON
    const lockedRows = await db.$queryRaw<Array<{ id: string; variants: any }>>`
      SELECT id, variants FROM products
      WHERE id = ${productId}::uuid AND shop_id = ${shopId}::uuid
      FOR UPDATE
    `;
    if (!lockedRows.length) continue;

    const rawVariants = lockedRows[0].variants;
    const variants = Array.isArray(rawVariants)
      ? (rawVariants as any[]).map((v) => ({ ...v }))
      : [];
    if (!variants.length) continue;

    let changed = false;
    for (const [variantKey, netDelta] of perVariant) {
      if (!netDelta) continue;
      const row = variants.find((v) => rowKey(v) === variantKey);
      if (!row) continue;
      const next = (Number(row.stock) || 0) + netDelta;
      // Manual stock adjustments must reject, not silently clamp: clamping would leave the
      // variant and the product/warehouse totals out of step. Checked under the product row lock.
      if (opts?.rejectNegative && next < 0) throw new ApiError(400, `Negative stock is not allowed for "${variantKey}".`);
      row.stock = Math.max(0, next);
      changed = true;
    }
    if (changed) {
      await db.product.update({ where: { id: productId, shopId }, data: { variants } });
    }
  }
}
