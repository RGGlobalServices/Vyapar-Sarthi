import type { PrismaClient } from '@prisma/client';

export type VariantStockDelta = { productId: string; variantKey: string | null | undefined; delta: number };

// Same "Colour / Size" (or bare size when the row has no colour) composite
// used by the Purchases and Billing UIs — see makeVariantKey/splitVariantKey
// in components/ColorSizeVariantGrid.tsx. Duplicated here (not imported)
// since that file is a 'use client' component and this runs server-only.
function rowKey(v: any): string {
  return v.color ? `${v.color} / ${v.size || ''}` : (v.size || '');
}

/**
 * Applies signed stock deltas to Product.variants[] JSON rows, batched per
 * product so multiple lines against the same product in one call don't race
 * on read-modify-write (each product gets exactly one read + one write).
 * Deltas with no matching row (stale/renamed variant) are silently skipped —
 * the flat Product.currentStock counter, updated separately and
 * unconditionally by the caller, stays correct either way. Decrements clamp
 * at 0 rather than going negative.
 *
 * Best-effort by design: call this AFTER the caller's own critical
 * transaction has committed, wrapped in try/catch — see purchases/route.ts
 * and purchases/[id]/route.ts for the established pattern (mirrors
 * cleanupPurchaseLedgerAndBatches in lib/server/purchases.ts).
 */
export async function applyVariantStockDeltas(prisma: PrismaClient, deltas: VariantStockDelta[]) {
  // Net every delta for the same (product, variant) pair down to one number
  // BEFORE touching any stock value. Applying deltas one at a time with a
  // clamp-at-0 on each step would make the result depend on call order —
  // e.g. an edit's reverse(-5) then reapply(+8) clamps through 0 and lands
  // on 8, while the reverse order lands on 6. Summing first and clamping
  // exactly once against the real current value avoids that entirely.
  const byProduct = new Map<string, Map<string, number>>();
  for (const d of deltas) {
    if (!d.variantKey || !d.delta) continue;
    const perVariant = byProduct.get(d.productId) || new Map<string, number>();
    perVariant.set(d.variantKey, (perVariant.get(d.variantKey) || 0) + d.delta);
    byProduct.set(d.productId, perVariant);
  }

  for (const [productId, perVariant] of byProduct) {
    const product = await prisma.product.findUnique({ where: { id: productId }, select: { variants: true } });
    if (!product || !Array.isArray(product.variants)) continue;

    const variants = (product.variants as any[]).map((v) => ({ ...v }));
    let changed = false;
    for (const [variantKey, netDelta] of perVariant) {
      if (!netDelta) continue;
      const row = variants.find((v) => rowKey(v) === variantKey);
      if (!row) continue;
      row.stock = Math.max(0, (Number(row.stock) || 0) + netDelta);
      changed = true;
    }
    if (changed) {
      await prisma.product.update({ where: { id: productId }, data: { variants } });
    }
  }
}
