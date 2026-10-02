import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { assertOwned as assertRefsOwned } from '@/lib/server/ownership';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

import { lotSource, canonicalReceivedDate, computeLotQuantities } from '@/lib/server/millProduction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

async function assertOwned(req: Request, id: string) {
  const { shop } = await requireShop(req);
  const lot = await (prisma as any).rawMaterialLot.findFirst({ where: { id, shopId: shop.id } });
  if (!lot) throw new ApiError(404, 'Raw material lot not found');
  return { shop, lot };
}

export const GET = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const lot = await (prisma as any).rawMaterialLot.findFirst({
    where: { id, shopId: shop.id },
    include: {
      product: { select: { id: true, name: true, baseUnit: true } },
      supplier: { select: { id: true, name: true, mobile: true } },
      batches: {
        select: { id: true, batchNumber: true, inputKg: true, status: true, currentStage: true, startedAt: true, closedAt: true },
        orderBy: { startedAt: 'desc' },
      },
      weighbridgeEntries: { select: { slipNumber: true } },
    },
  });
  if (!lot) throw new ApiError(404, 'Raw material lot not found');

  const { weighbridgeEntries, ...rest } = lot;
  const src = lotSource(lot);
  const recDate = canonicalReceivedDate(lot);
  const qty = computeLotQuantities(lot);

  return json({
    ...rest,
    ...src,
    receivedDate: recDate.toISOString(),
    receivedKg: qty.quantity,
    allocatedKg: qty.allocatedKg,
    consumedKg: qty.consumedKg,
    availableKg: qty.availableKg,
    operationalStatus: qty.operationalStatus,
  });
});

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop, lot } = await assertOwned(req, id);
  const body = await readBody<any>(req);
  // Linked ids are client-supplied — they must belong to this shop, or another
  // shop's names/mobiles come back through the response join.
  await assertRefsOwned(shop.id, { productId: body.productId, supplierId: body.supplierId });

  // Blank-cell-never-overwrites convention — any field the caller doesn't
  // send is left alone. Numeric fields are re-derived when a related value
  // (weight / rate) changes so totalAmount stays consistent without the
  // caller having to compute it.
  const patch: any = {};
  if (body.lotNumber !== undefined)    patch.lotNumber   = body.lotNumber == null ? null : String(body.lotNumber).trim() || null;
  if (body.farmerName !== undefined)   patch.farmerName  = body.farmerName == null ? null : String(body.farmerName).trim() || null;
  if (body.productId !== undefined)    patch.productId   = body.productId || null;
  if (body.supplierId !== undefined)   patch.supplierId  = body.supplierId || null;
  if (body.purchaseDate !== undefined) patch.purchaseDate = new Date(body.purchaseDate);
  if (body.quantity !== undefined)     patch.quantity    = Number(body.quantity) || 0;
  if (body.ratePerUnit !== undefined)    patch.ratePerUnit   = Number(body.ratePerUnit) || null;
  if (body.moisturePct !== undefined) {
    if (body.moisturePct === null || body.moisturePct === '') patch.moisturePct = null;
    else {
      const m = Number(body.moisturePct);
      if (!isFinite(m) || m < 0 || m > 100) throw new ApiError(400, 'Moisture must be between 0 and 100 %', 'INVALID_MOISTURE');
      patch.moisturePct = m;
    }
  }
  if (body.notes !== undefined)        patch.notes       = body.notes == null ? null : String(body.notes).trim() || null;

  // Stock safety: what production has already taken out of the lot stays taken out. The weight cannot drop below it, and the
  // remaining quantity is derived from it — it can never go negative or exceed the weight.
  const consumed = Math.max(0, (Number(lot.quantity) || 0) - (Number(lot.remainingQuantity ?? lot.quantity) || 0));
  if (patch.quantity !== undefined) {
    if (!(patch.quantity > 0)) throw new ApiError(400, 'quantity must be a positive number', 'INVALID_WEIGHT');
    if (patch.quantity < consumed) throw new ApiError(409, `${consumed} kg of this lot is already consumed — the weight cannot be lower than that.`, 'BELOW_CONSUMED');
    patch.remainingQuantity = Math.round((patch.quantity - consumed) * 1000) / 1000;
  }
  if (body.remainingQuantity !== undefined) {
    const w = patch.quantity ?? (Number(lot.quantity) || 0);
    const r = Number(body.remainingQuantity);
    if (!isFinite(r) || r < 0 || r > w) throw new ApiError(400, 'Remaining must be between 0 and the lot weight.', 'INVALID_REMAINING');
    patch.remainingQuantity = r;
  }
  if (patch.ratePerUnit !== undefined && (!isFinite(patch.ratePerUnit) || patch.ratePerUnit < 0)) throw new ApiError(400, 'Invalid rate', 'INVALID_RATE');

  if (patch.quantity != null || patch.ratePerUnit != null) {
    const nextWeight = patch.quantity ?? undefined;
    const nextRate = patch.ratePerUnit ?? undefined;
    if (nextWeight != null && nextRate != null) {
      patch.totalAmount = Math.round(nextWeight * nextRate * 100) / 100;
    }
  }

  const updated = await (prisma as any).rawMaterialLot.update({ where: { id, shopId: shop.id }, data: patch });
  return json(updated);
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop, lot } = await assertOwned(req, id);
  // Material already used in production cannot be taken back out of the books.
  const qty = Number(lot.quantity) || 0;
  const remaining = lot.remainingQuantity == null ? qty : Number(lot.remainingQuantity);
  if (remaining < qty - 0.0005) {
    throw new ApiError(409, `${Math.round((qty - remaining) * 1000) / 1000} of this lot has already been used in production, so it cannot be deleted. Delete those production runs first.`, 'LOT_IN_USE');
  }
  // A lot added by hand put its quantity into stock (a 'raw_material_receipt' movement); deleting it takes that stock out again.
  // A lot imported from a purchase did not (the purchase counted the stock) — its stock stays with the purchase.
  const receipt = await prisma.stockMovement.findFirst({ where: { shopId: shop.id, type: 'raw_material_receipt', referenceId: id }, select: { id: true, productId: true, quantity: true } });
  // FK on ProductionBatch.rawLotId is NO ACTION — Prisma will refuse if any
  // batch still points to this lot. Return a friendly 409 instead of leaking
  // the raw P2003 text (same UX we shipped for supplier deletes earlier).
  try {
    await prisma.$transaction(async (tx: any) => {
      if (receipt?.productId && Number(receipt.quantity) > 0) {
        const took = await tx.$executeRaw`UPDATE products SET current_stock = current_stock - ${Number(receipt.quantity)} WHERE id = ${receipt.productId}::uuid AND shop_id = ${shop.id}::uuid AND COALESCE(current_stock, 0) >= ${Number(receipt.quantity)} - 0.0005`;
        if (took === 0) throw new ApiError(409, 'This lot\'s stock has already been sold or used elsewhere, so it cannot be deleted.', 'INSUFFICIENT_STOCK');
        if (lot.godownId) {
          await tx.$executeRaw`UPDATE godown_products SET quantity = quantity - ${Number(receipt.quantity)}, updated_at = now() WHERE godown_id = ${lot.godownId}::uuid AND product_id = ${receipt.productId}::uuid`;
        }
        await tx.stockMovement.create({ data: { shopId: shop.id, productId: receipt.productId, type: 'raw_material_reversal', quantity: -Number(receipt.quantity), referenceId: id } });
      }
      await tx.rawMaterialLot.delete({ where: { id } });
    }, { timeout: 30000, maxWait: 10000 });
  } catch (err: any) {
    if (err?.code === 'P2003') {
      throw new ApiError(409, 'Cannot delete: one or more production batches were made from this lot. Close or reassign those batches first.');
    }
    throw err;
  }
  return json({ success: true });
});
