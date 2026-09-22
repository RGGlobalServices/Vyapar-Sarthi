import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { round3, kgToProductUnit } from '@/lib/server/millProduction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * By-Products — what a production batch (or a job-work order the mill kept the husk/bran of) throws off besides its main output.
 *
 *  - Production-generated: finalizing a batch writes the ByProduct row AND credits the linked product's stock through the batch's
 *    outputs. This page only displays those rows; nothing here credits that quantity again.
 *  - Manual: POST below. It is new material, so it credits the linked product's stock once. A manual entry for a by-product that
 *    Production already recorded on the same batch is refused (409) — that would be a double credit.
 *
 * GET  /api/v1/mill/by-products — list (optional ?batchId=), each row tagged with its `source` (production | job_work | manual)
 * POST /api/v1/mill/by-products — manual entry
 */

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const url = new URL(req.url);
  const batchId = url.searchParams.get('batchId');

  const where: any = { shopId: shop.id };
  if (batchId) where.batchId = batchId;

  const rows = await (prisma as any).byProduct.findMany({
    where,
    include: {
      product: { select: { id: true, name: true, baseUnit: true } },
      batch: { select: { id: true, batchNumber: true, startedAt: true, closedAt: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const outs = await prisma.productionOutput.findMany({ where: { shopId: shop.id, outputType: 'by_product' }, select: { batchId: true, name: true, productId: true } });
  return json(rows.map((r: any) => {
    const fromProduction = !!r.batchId && outs.some((o) => o.batchId === r.batchId && ((o.productId && o.productId === r.productId) || o.name.toLowerCase() === String(r.name).toLowerCase()));
    const source = fromProduction ? 'production' : /^Job work /i.test(r.notes || '') ? 'job_work' : 'manual';
    return { ...r, source };
  }));
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);

  const name = (body.name || '').toString().trim().slice(0, 80);
  if (!name) throw new ApiError(400, 'By-product name is required', 'NAME_REQUIRED');

  const quantityKg = Number(body.quantityKg);
  if (!isFinite(quantityKg) || quantityKg <= 0 || quantityKg > 1e9) {
    throw new ApiError(400, 'quantityKg must be a positive number', 'INVALID_QUANTITY');
  }
  const ratePerKg = body.ratePerKg != null && body.ratePerKg !== '' ? Number(body.ratePerKg) : null;
  if (ratePerKg !== null && (!isFinite(ratePerKg) || ratePerKg < 0)) throw new ApiError(400, 'Rate must be zero or a positive number', 'INVALID_RATE');

  const batchId: string | null = body.batchId || null;
  if (batchId) {
    const batch = await (prisma as any).productionBatch.findFirst({ where: { id: batchId, shopId: shop.id } });
    if (!batch) throw new ApiError(404, 'Production batch not found for this shop', 'BATCH_NOT_FOUND');
  }
  const productId: string | null = body.productId || null;
  let product: { id: string; name: string | null; baseUnit: string | null } | null = null;
  if (productId) {
    product = await prisma.product.findFirst({ where: { id: productId, shopId: shop.id }, select: { id: true, name: true, baseUnit: true } });
    if (!product) throw new ApiError(404, 'Product not found for this shop', 'PRODUCT_NOT_FOUND');
  }

  if (batchId) {
    const dup = await prisma.productionOutput.findFirst({
      where: { shopId: shop.id, batchId, outputType: 'by_product', OR: [{ name: { equals: name, mode: 'insensitive' } }, ...(productId ? [{ productId }] : [])] },
      select: { id: true },
    });
    if (dup) throw new ApiError(409, 'Production already recorded this by-product for that batch (and added its stock). Nothing to add manually.', 'DUPLICATE_OF_PRODUCTION');
  }

  const qty = round3(quantityKg);
  const stockQty = product ? kgToProductUnit(qty, product.baseUnit, product.name ?? '') : null;
  const created = await prisma.$transaction(async (tx) => {
    const row = await (tx as any).byProduct.create({
      data: { shopId: shop.id, batchId, productId, name, quantityKg: qty, ratePerKg, notes: (body.notes || '').toString().trim().slice(0, 250) || null },
    });
    if (product && stockQty) {
      await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) + ${stockQty} WHERE id = ${product.id}::uuid AND shop_id = ${shop.id}::uuid`;
      await tx.stockMovement.create({ data: { shopId: shop.id, productId: product.id, type: 'byproduct_manual', quantity: stockQty, referenceId: row.id } });
    }
    return row;
  });
  return json(created, 201);
});
