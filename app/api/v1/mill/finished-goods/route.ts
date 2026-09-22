import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/mill/finished-goods — the Finished Goods view: every product classed `finished_goods` with what production made of it.
 *
 * It is a VIEW over existing data — the Product master (name, unit, price, current stock), the production outputs (what each batch
 * made) and the per-lot Batch rows production created (batch-wise stock). Nothing is stored or credited here; the product stays the
 * single source of stock, and sales use it through Billing as usual.
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);

  const products = await prisma.product.findMany({
    where: { shopId: shop.id, millCategory: 'finished_goods' },
    select: { id: true, name: true, baseUnit: true, currentStock: true, sellingPrice: true, mrp: true, minStock: true, category: true },
    orderBy: { name: 'asc' },
  });
  const ids = products.map((p) => p.id);
  if (ids.length === 0) return json([]);

  const [outputs, lots] = await Promise.all([
    prisma.productionOutput.findMany({
      where: { shopId: shop.id, productId: { in: ids }, outputType: 'finished_good' },
      select: { productId: true, quantity: true, batch: { select: { id: true, batchNumber: true, closedAt: true, startedAt: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.batch.findMany({
      where: { shopId: shop.id, productId: { in: ids }, quantity: { gt: 0 } },
      select: { id: true, productId: true, batchNumber: true, quantity: true, initialQuantity: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return json(products.map((p) => {
    const outs = outputs.filter((o) => o.productId === p.id);
    const produced = outs.reduce((a, o) => a + (o.quantity || 0), 0);
    const last = outs[0]?.batch;
    return {
      ...p,
      produced: Math.round(produced * 1000) / 1000,
      batchesCount: new Set(outs.map((o) => o.batch?.id)).size,
      lastBatch: last ? { id: last.id, batchNumber: last.batchNumber, date: last.closedAt || last.startedAt } : null,
      lots: lots.filter((l) => l.productId === p.id).map((l) => ({ id: l.id, batchNumber: l.batchNumber, quantity: l.quantity, initialQuantity: l.initialQuantity, createdAt: l.createdAt })),
    };
  }));
});
