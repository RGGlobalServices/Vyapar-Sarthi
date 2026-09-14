import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * By-Products — what a production batch throws off besides its main output
 * (bran, husk, broken rice, dust, …). The batch-close flow auto-fills three
 * of these from ProductionBatch.brokenKg/branKg/huskKg; this endpoint is for
 * anything beyond those three, or for adding one after the batch has already
 * closed. When `productId` is set, recording quantity here credits that
 * product's stock (same COALESCE-safe raw-SQL pattern purchases/route.ts
 * uses) so a by-product the mill actually sells shows up in Products/Stock
 * immediately — nothing else in the codebase writes ByProduct rows today.
 *
 * GET  /api/v1/mill/by-products — list, optional ?batchId=
 * POST /api/v1/mill/by-products — create
 */

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const url = new URL(req.url);
  const batchId = url.searchParams.get('batchId');

  // ByProduct has no shopId-scoped-only guarantee via a direct where — scope
  // through the batch (when given) or by shopId column directly.
  const where: any = { shopId: shop.id };
  if (batchId) where.batchId = batchId;

  const rows = await (prisma as any).byProduct.findMany({
    where,
    include: {
      product: { select: { id: true, name: true, baseUnit: true } },
      batch: { select: { id: true, batchNumber: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return json(rows);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);

  const name = (body.name || '').toString().trim();
  if (!name) throw new ApiError(400, 'By-product name is required');

  const quantityKg = body.quantityKg != null && body.quantityKg !== '' ? Number(body.quantityKg) : null;
  if (quantityKg != null && (!isFinite(quantityKg) || quantityKg < 0)) {
    throw new ApiError(400, 'quantityKg must be a non-negative number');
  }

  const batchId: string | null = body.batchId || null;
  if (batchId) {
    const batch = await (prisma as any).productionBatch.findFirst({ where: { id: batchId, shopId: shop.id } });
    if (!batch) throw new ApiError(400, 'Production batch not found for this shop');
  }

  const productId: string | null = body.productId || null;
  if (productId) {
    const product = await prisma.product.findFirst({ where: { id: productId, shopId: shop.id } });
    if (!product) throw new ApiError(400, 'Product not found for this shop');
  }

  const ratePerKg = body.ratePerKg != null && body.ratePerKg !== '' ? Number(body.ratePerKg) : null;

  const ops: any[] = [
    (prisma as any).byProduct.create({
      data: {
        shopId: shop.id,
        batchId,
        productId,
        name,
        quantityKg,
        ratePerKg,
        notes: (body.notes || '').trim() || null,
      },
    }),
  ];

  if (productId && quantityKg && quantityKg > 0) {
    ops.push(
      prisma.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) + ${quantityKg} WHERE id = ${productId}::uuid`,
      prisma.stockMovement.create({
        data: {
          shopId: shop.id,
          productId,
          type: 'production_output',
          quantity: quantityKg,
          referenceId: batchId,
        },
      }),
    );
  }

  const [created] = await prisma.$transaction(ops);
  return json(created, 201);
});
