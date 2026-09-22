import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { round3, kgToProductUnit } from '@/lib/server/millProduction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/mill/by-products/[id] — record a sale / internal use (`addSoldKg`) or edit rate/notes. quantityKg is immutable here
 *   (it is what was produced). Recording a sale is race-safe (conditional updates): it can never exceed what remains, and a linked
 *   product's stock is reduced in the same transaction and can never go negative.
 * DELETE — only a manual entry nothing has been taken from; production-generated rows are permanent.
 */

const INCLUDE = {
  product: { select: { id: true, name: true, baseUnit: true } },
  batch: { select: { id: true, batchNumber: true } },
};

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const existing = await (prisma as any).byProduct.findFirst({ where: { id, shopId: shop.id } });
  if (!existing) throw new ApiError(404, 'By-product entry not found');

  const body = await readBody<any>(req);
  const patch: any = {};

  if (body.addSoldKg !== undefined) {
    const add = round3(Number(body.addSoldKg));
    if (!isFinite(add) || add <= 0) throw new ApiError(400, 'addSoldKg must be a positive number', 'INVALID_QUANTITY');
    let product: { id: string; name: string | null; baseUnit: string | null } | null = null;
    if (existing.productId) product = await prisma.product.findFirst({ where: { id: existing.productId, shopId: shop.id }, select: { id: true, name: true, baseUnit: true } });
    const stockQty = product ? kgToProductUnit(add, product.baseUnit, product.name ?? '') : null;
    await prisma.$transaction(async (tx) => {
      const moved = await tx.$executeRaw`
        UPDATE by_products SET sold_kg = COALESCE(sold_kg, 0) + ${add}
        WHERE id = ${id}::uuid AND shop_id = ${shop.id}::uuid AND COALESCE(quantity_kg, 0) - COALESCE(sold_kg, 0) >= ${add}`;
      if (moved === 0) throw new ApiError(409, 'That is more than what is left of this by-product.', 'EXCEEDS_REMAINING');
      if (product && stockQty) {
        const took = await tx.$executeRaw`
          UPDATE products SET current_stock = current_stock - ${stockQty}
          WHERE id = ${product.id}::uuid AND shop_id = ${shop.id}::uuid AND COALESCE(current_stock, 0) >= ${stockQty}`;
        if (took === 0) throw new ApiError(409, 'Not enough stock of the linked product.', 'INSUFFICIENT_STOCK');
        await tx.stockMovement.create({ data: { shopId: shop.id, productId: product.id, type: 'byproduct_sale', quantity: -stockQty, referenceId: id } });
      }
    });
  }
  if (body.ratePerKg !== undefined) {
    patch.ratePerKg = body.ratePerKg === '' || body.ratePerKg === null ? null : Number(body.ratePerKg);
    if (patch.ratePerKg !== null && (!isFinite(patch.ratePerKg) || patch.ratePerKg < 0)) throw new ApiError(400, 'Rate must be zero or a positive number', 'INVALID_RATE');
  }
  if (body.notes !== undefined) patch.notes = (body.notes || '').toString().trim().slice(0, 250) || null;

  const updated = Object.keys(patch).length
    ? await (prisma as any).byProduct.update({ where: { id }, data: patch, include: INCLUDE })
    : await (prisma as any).byProduct.findFirst({ where: { id, shopId: shop.id }, include: INCLUDE });
  return json(updated);
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const existing = await (prisma as any).byProduct.findFirst({ where: { id, shopId: shop.id } });
  if (!existing) throw new ApiError(404, 'By-product entry not found');
  if (existing.batchId) {
    const fromProduction = await prisma.productionOutput.findFirst({
      where: { shopId: shop.id, batchId: existing.batchId, outputType: 'by_product', OR: [{ name: { equals: existing.name, mode: 'insensitive' } }, ...(existing.productId ? [{ productId: existing.productId }] : [])] },
      select: { id: true },
    });
    if (fromProduction) throw new ApiError(409, 'This by-product was produced by a finalized batch and cannot be deleted.', 'PRODUCTION_RECORD');
  }
  if ((existing.soldKg ?? 0) > 0) throw new ApiError(409, 'Part of this by-product is already sold or used.', 'ALREADY_USED');
  const credited = existing.productId ? await prisma.stockMovement.findFirst({ where: { shopId: shop.id, type: 'byproduct_manual', referenceId: id } }) : null;
  await prisma.$transaction(async (tx) => {
    if (credited) {
      const took = await tx.$executeRaw`UPDATE products SET current_stock = current_stock - ${credited.quantity} WHERE id = ${existing.productId}::uuid AND shop_id = ${shop.id}::uuid AND COALESCE(current_stock, 0) >= ${credited.quantity}`;
      if (took === 0) throw new ApiError(409, 'That stock has already been used, so the entry cannot be removed.', 'INSUFFICIENT_STOCK');
      await tx.stockMovement.deleteMany({ where: { id: credited.id } });
    }
    await (tx as any).byProduct.delete({ where: { id } });
  });
  return json({ success: true });
});
