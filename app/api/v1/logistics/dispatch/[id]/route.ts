import { debitGodown, creditGodown, syncsGodownStock } from '@/lib/server/godownStock';
import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/logistics/dispatch/[id]
 * Edit a dispatch entry (party, vehicle, driver, product, qty, type, date, notes, lot).
 * Stock adjustments: if product/qty changed and this dispatch took stock, reverse old and apply new.
 *
 * DELETE /api/v1/logistics/dispatch/[id]
 * Delete a dispatch entry. Reverses stock if the dispatch originally took it.
 */

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);

  const entry = await (prisma as any).dispatchEntry.findFirst({
    where: { id, shopId: shop.id },
  });
  if (!entry) throw new ApiError(404, 'Dispatch entry not found');

  const VALID_TYPES = ['sale', 'sample', 'transfer', 'job_work', 'other'];
  const dispatchType = body.dispatchType !== undefined
    ? (VALID_TYPES.includes(body.dispatchType) ? body.dispatchType : entry.dispatchType)
    : entry.dispatchType;

  const productId = body.productId !== undefined ? (body.productId || null) : entry.productId;
  const newQty = body.quantity !== undefined
    ? (body.quantity != null && body.quantity !== '' ? Number(body.quantity) : null)
    : entry.quantity;

  if (productId && productId !== entry.productId) {
    const prod = await prisma.product.findFirst({ where: { id: productId, shopId: shop.id } });
    if (!prod) throw new ApiError(400, 'Product not found for this shop');
  }

  const billed = entry.productId
    ? await prisma.stockMovement.count({ where: { shopId: shop.id, productId: entry.productId, type: 'dispatch_billed', referenceId: entry.id } })
    : 0;
  const tookStock = !entry.challanId && !entry.saleId && billed === 0;

  const updated = await prisma.$transaction(async (tx) => {
    // Reverse old stock if product/qty taken
    if (tookStock && entry.productId && entry.quantity && entry.quantity > 0) {
      await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) + ${entry.quantity} WHERE id = ${entry.productId}::uuid AND shop_id = ${shop.id}::uuid`;
      if (syncsGodownStock(shop)) await creditGodown(tx, shop.id, entry.productId, entry.quantity);
    }

    const noOfBags = body.noOfBags !== undefined
      ? (body.noOfBags != null && body.noOfBags !== '' ? Math.round(Number(body.noOfBags)) : null)
      : entry.noOfBags;

    const result = await (tx as any).dispatchEntry.update({
      where: { id },
      data: {
        partyId: body.partyId !== undefined ? (body.partyId || null) : entry.partyId,
        vehicleNumber: body.vehicleNumber !== undefined ? ((body.vehicleNumber || '').trim() || null) : entry.vehicleNumber,
        driverName: body.driverName !== undefined ? ((body.driverName || '').trim() || null) : entry.driverName,
        productId,
        quantity: newQty,
        unit: body.unit !== undefined ? ((body.unit || '').trim() || null) : entry.unit,
        noOfBags,
        lotNumber: body.lotNumber !== undefined ? ((body.lotNumber || '').trim() || null) : entry.lotNumber,
        dispatchType,
        notes: body.notes !== undefined ? ((body.notes || '').trim() || null) : entry.notes,
        dispatchedAt: body.dispatchedAt ? new Date(body.dispatchedAt) : entry.dispatchedAt,
        saleId: body.saleId !== undefined ? (body.saleId || null) : entry.saleId,
      },
      include: {
        party: { select: { id: true, name: true } },
        product: { select: { id: true, name: true, baseUnit: true } },
      },
    });

    // Apply new stock debit if this dispatch takes stock
    if (tookStock && productId && newQty && newQty > 0) {
      await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) - ${newQty} WHERE id = ${productId}::uuid AND shop_id = ${shop.id}::uuid`;
      if (syncsGodownStock(shop)) await debitGodown(tx, shop.id, productId, newQty);
    }

    return result;
  }, { timeout: 30000, maxWait: 10000 });

  return json(updated);
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);

  const entry = await (prisma as any).dispatchEntry.findFirst({
    where: { id, shopId: shop.id },
  });
  if (!entry) throw new ApiError(404, 'Dispatch entry not found');

  const billed = entry.productId
    ? await prisma.stockMovement.count({ where: { shopId: shop.id, productId: entry.productId, type: 'dispatch_billed', referenceId: entry.id } })
    : 0;
  const tookStock = !entry.challanId && !entry.saleId && billed === 0 && entry.status !== 'returned';

  await prisma.$transaction(async (tx) => {
    // Credit stock back if it was debited on dispatch and not yet returned
    if (tookStock && entry.productId && entry.quantity && entry.quantity > 0) {
      await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) + ${entry.quantity} WHERE id = ${entry.productId}::uuid AND shop_id = ${shop.id}::uuid`;
      if (syncsGodownStock(shop)) await creditGodown(tx, shop.id, entry.productId, entry.quantity);
    }
    await (tx as any).dispatchEntry.delete({ where: { id } });
  }, { timeout: 30000, maxWait: 10000 });

  return json({ deleted: true });
});
