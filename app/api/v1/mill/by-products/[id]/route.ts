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

import { getByProductLotByIdService, getByProductTraceabilityService } from '@/lib/server/byProductService';

const INCLUDE = {
  product: { select: { id: true, name: true, baseUnit: true } },
  batch: { select: { id: true, batchNumber: true } },
};

export const GET = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const url = new URL(req.url);

  const includeTraceability = url.searchParams.get('traceability') === 'true';

  try {
    if (includeTraceability) {
      const traceability = await getByProductTraceabilityService(shop.id, id);
      return json(traceability);
    }
    const lot = await getByProductLotByIdService(shop.id, id);
    return json(lot);
  } catch (err: any) {
    const legacy = await (prisma as any).byProduct.findFirst({ where: { id, shopId: shop.id }, include: INCLUDE });
    if (legacy) return json(legacy);
    throw err;
  }
});

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const existing = await (prisma as any).byProduct.findFirst({ where: { id, shopId: shop.id } });
  if (!existing) throw new ApiError(404, 'By-product entry not found');

  const body = await readBody<any>(req);
  const patch: any = {};

  // Link this by-product to a real Product so it shows up in Products/Stock and can be sold through Billing — either an existing
  // product (must already be this shop's), or a brand-new one created here. Only for a row that isn't linked yet; the remaining
  // (unsold) quantity is credited to the product's stock once, the same way a by-product created WITH a product already is.
  if (body.linkProduct !== undefined) {
    if (existing.productId) throw new ApiError(409, 'This by-product is already linked to a product.', 'ALREADY_LINKED');
    const remainingQuantity = round3((existing.quantityKg ?? 0) - (existing.soldKg ?? 0));
    if (remainingQuantity <= 0) throw new ApiError(400, 'Nothing left of this by-product to add to stock.', 'NOTHING_REMAINING');
    let productId: string = body.linkProduct.productId || '';
    let product: { id: string; name: string | null; baseUnit: string | null } | null = null;
    if (productId) {
      product = await prisma.product.findFirst({ where: { id: productId, shopId: shop.id }, select: { id: true, name: true, baseUnit: true } });
      if (!product) throw new ApiError(404, 'Product not found for this shop');
    } else {
      const name = String(body.linkProduct.name ?? '').trim().slice(0, 100) || existing.name;
      product = await prisma.product.create({
        data: { shopId: shop.id, name, category: 'By-Products', millCategory: 'by_product', baseUnit: 'kg', currentStock: 0, sellingPrice: 0 } as any,
        select: { id: true, name: true, baseUnit: true },
      });
      productId = product.id;
    }
    const stockQty = kgToProductUnit(remainingQuantity, product.baseUnit, product.name ?? '');
    const linked = await prisma.$transaction(async (tx) => {
      const moved = await (tx as any).byProduct.updateMany({ where: { id, shopId: shop.id, productId: null }, data: { productId } });
      if (moved.count === 0) throw new ApiError(409, 'This by-product is already linked to a product.', 'ALREADY_LINKED');
      await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) + ${stockQty} WHERE id = ${productId}::uuid AND shop_id = ${shop.id}::uuid`;
      await tx.stockMovement.create({ data: { shopId: shop.id, productId, type: 'byproduct_manual', quantity: stockQty, referenceId: id } });
      return (tx as any).byProduct.findFirst({ where: { id }, include: INCLUDE });
    }, { timeout: 15000, maxWait: 10000 });
    return json(linked);
  }

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
  if (body.ratePerUnit !== undefined) {
    patch.ratePerUnit = body.ratePerUnit === '' || body.ratePerUnit === null ? null : Number(body.ratePerUnit);
    if (patch.ratePerUnit !== null && (!isFinite(patch.ratePerUnit) || patch.ratePerUnit < 0)) throw new ApiError(400, 'Rate must be zero or a positive number', 'INVALID_RATE');
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
