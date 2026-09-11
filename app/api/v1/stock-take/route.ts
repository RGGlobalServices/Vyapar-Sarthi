import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/stock-take — every session for this shop, newest first, with
 * item counts (not the full item list — see [id] for that).
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const sessions = await prisma.stockTakeSession.findMany({
    where: { shopId: shop.id },
    orderBy: { startedAt: 'desc' },
    include: { _count: { select: { items: true } } },
  });
  return json(sessions.map((s) => ({
    id: s.id, name: s.name, status: s.status, startedAt: s.startedAt, completedAt: s.completedAt,
    notes: s.notes, itemCount: s._count.items,
  })));
});

/**
 * POST /api/v1/stock-take — starts a new session, snapshotting every
 * non-archived product's current name/unit/stock as the "system qty" to
 * count against. Deliberately a flat currentStock snapshot only (not a
 * per-colour/size breakdown) — this is the Dukan/Vyapar retail counting
 * workflow, where the vast majority of products are non-variant; a variant
 * product's total still gets counted and adjusted, same as the plain
 * `/products/[id]/adjust` endpoint this commits through only ever touches
 * the flat total too.
 */
export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req).catch(() => ({}));

  const openSession = await prisma.stockTakeSession.findFirst({ where: { shopId: shop.id, status: 'draft' } });
  if (openSession) throw new ApiError(400, 'A stock take is already in progress. Finish or cancel it first.');

  const products = await prisma.product.findMany({
    where: { shopId: shop.id, archived: { not: true } },
    select: { id: true, name: true, baseUnit: true, currentStock: true },
  });

  const session = await prisma.stockTakeSession.create({
    data: {
      shopId: shop.id,
      name: body.name || null,
      items: {
        create: products.map((p) => ({
          productId: p.id,
          productName: p.name || 'Product',
          unit: p.baseUnit || 'Unit',
          systemQty: p.currentStock || 0,
        })),
      },
    },
    include: { items: true },
  });

  return json(session);
});
