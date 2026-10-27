import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { openVariantStores, adjustVariantStores, closeVariantStores, sumStock } from '@/lib/variants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getOwnedSession(req: Request, id: string) {
  const { shop } = await requireShop(req);
  const session = await prisma.stockTakeSession.findFirst({
    where: { id, shopId: shop.id },
    include: { items: { orderBy: { productName: 'asc' } } },
  });
  if (!session) throw new ApiError(404, 'Stock take session not found');
  return { shop, session };
}

/** GET /api/v1/stock-take/[id] — full session with every item + its counted/system qty. */
export const GET = handle(async (req, ctx: any) => {
  const { id } = await ctx.params;
  const { session } = await getOwnedSession(req, id);
  return json(session);
});

/**
 * PATCH /api/v1/stock-take/[id]
 *
 * Body: { action: 'count', itemId, countedQty } — save one item's count
 * (autosaved as the shopkeeper walks the shop counting, so a closed tab
 * mid-count never loses progress).
 * Body: { action: 'commit' } — for every item where countedQty was entered
 * and differs from systemQty, apply the real stock change through the same
 * plain product-stock mutation `/products/[id]/adjust` uses (increment
 * currentStock + write a StockLog row) so the variance shows up in the
 * shop's normal stock history, then marks the session completed. Items
 * never counted are left untouched — a partial count still commits cleanly,
 * it just doesn't touch what wasn't counted.
 * Body: { action: 'cancel' } — abandons a draft session; nothing was ever
 * applied to real stock, so this is just a status flip.
 */
export const PATCH = handle(async (req, ctx: any) => {
  const { id } = await ctx.params;
  const { shop, session } = await getOwnedSession(req, id);
  const body = await readBody<any>(req);

  if (session.status !== 'draft') {
    throw new ApiError(400, `This stock take is already ${session.status}.`);
  }

  if (body.action === 'count') {
    const item = session.items.find((i) => i.id === body.itemId);
    if (!item) throw new ApiError(404, 'Item not found in this session');
    const countedQty = body.countedQty === null || body.countedQty === '' ? null : Number(body.countedQty);
    if (countedQty !== null && !Number.isFinite(countedQty)) throw new ApiError(400, 'Invalid counted quantity');
    const updated = await prisma.stockTakeItem.update({
      where: { id: item.id },
      data: { countedQty, countedAt: countedQty === null ? null : new Date() },
    });
    return json(updated);
  }

  if (body.action === 'cancel') {
    const updated = await prisma.stockTakeSession.update({ where: { id }, data: { status: 'cancelled', completedAt: new Date() } });
    return json(updated);
  }

  if (body.action === 'commit') {
    const toApply = session.items.filter((i) => i.countedQty !== null && i.countedQty !== i.systemQty);

    // Group by productId so variant items for the same product are applied together.
    const byProduct = new Map<string, typeof toApply>();
    for (const item of toApply) {
      if (!byProduct.has(item.productId)) byProduct.set(item.productId, []);
      byProduct.get(item.productId)!.push(item);
    }

    await prisma.$transaction(async (tx) => {
      for (const [productId, productItems] of byProduct.entries()) {
        const hasVariants = productItems.some((i) => (i as any).variantKey);

        if (hasVariants) {
          const product = await tx.product.findUnique({
            where: { id: productId },
            select: { size_variants: true, variants: true },
          });
          if (!product) continue;

          const stores = openVariantStores(product);
          for (const item of productItems) {
            const vk = (item as any).variantKey as string | null;
            if (!vk) continue;
            const delta = (item.countedQty as number) - item.systemQty;
            adjustVariantStores(stores, vk, delta, { createIfMissing: true });
            await tx.stockLog.create({
              data: {
                shopId: shop.id,
                productId,
                type: delta > 0 ? 'in' : 'out',
                quantity: Math.abs(delta),
                note: `Stock Take${session.name ? `: ${session.name}` : ''} — ${vk} (system ${item.systemQty} → counted ${item.countedQty})`,
              },
            });
          }

          const storeWrite = closeVariantStores(stores);
          const newTotal = stores.rows
            ? sumStock(stores.rows)
            : Object.values(stores.map || {}).reduce((s, v) => s + (Number(v) || 0), 0);
          await tx.product.update({
            where: { id: productId },
            data: { ...(storeWrite as any), currentStock: newTotal },
          });
        } else {
          for (const item of productItems) {
            const change = (item.countedQty as number) - item.systemQty;
            await tx.product.update({ where: { id: productId }, data: { currentStock: { increment: change } } });
            await tx.stockLog.create({
              data: {
                shopId: shop.id,
                productId,
                type: change > 0 ? 'in' : 'out',
                quantity: Math.abs(change),
                note: `Stock Take${session.name ? `: ${session.name}` : ''} (system ${item.systemQty} → counted ${item.countedQty})`,
              },
            });
          }
        }
      }
      await tx.stockTakeSession.update({ where: { id }, data: { status: 'completed', completedAt: new Date() } });
    }, { timeout: Math.max(15000, toApply.length * 2000) });

    const updated = await prisma.stockTakeSession.findUnique({ where: { id }, include: { items: true } });
    return json({ ...updated, adjustedCount: toApply.length });
  }

  throw new ApiError(400, 'Unknown action.');
});
