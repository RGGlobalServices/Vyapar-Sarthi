import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { assertOwned as assertRefsOwned } from '@/lib/server/ownership';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

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
      batches: { select: { id: true, batchNumber: true, inputKg: true, status: true, currentStage: true } },
    },
  });
  if (!lot) throw new ApiError(404, 'Raw material lot not found');
  return json(lot);
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
  if (body.weightKg !== undefined)     patch.weightKg    = Number(body.weightKg) || 0;
  if (body.ratePerKg !== undefined)    patch.ratePerKg   = Number(body.ratePerKg) || null;
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
  const consumed = Math.max(0, (Number(lot.weightKg) || 0) - (Number(lot.remainingKg ?? lot.weightKg) || 0));
  if (patch.weightKg !== undefined) {
    if (!(patch.weightKg > 0)) throw new ApiError(400, 'weightKg must be a positive number', 'INVALID_WEIGHT');
    if (patch.weightKg < consumed) throw new ApiError(409, `${consumed} kg of this lot is already consumed — the weight cannot be lower than that.`, 'BELOW_CONSUMED');
    patch.remainingKg = Math.round((patch.weightKg - consumed) * 1000) / 1000;
  }
  if (body.remainingKg !== undefined) {
    const w = patch.weightKg ?? (Number(lot.weightKg) || 0);
    const r = Number(body.remainingKg);
    if (!isFinite(r) || r < 0 || r > w) throw new ApiError(400, 'Remaining must be between 0 and the lot weight.', 'INVALID_REMAINING');
    patch.remainingKg = r;
  }
  if (patch.ratePerKg !== undefined && (!isFinite(patch.ratePerKg) || patch.ratePerKg < 0)) throw new ApiError(400, 'Invalid rate', 'INVALID_RATE');

  if (patch.weightKg != null || patch.ratePerKg != null) {
    const nextWeight = patch.weightKg ?? undefined;
    const nextRate = patch.ratePerKg ?? undefined;
    if (nextWeight != null && nextRate != null) {
      patch.totalAmount = Math.round(nextWeight * nextRate * 100) / 100;
    }
  }

  const updated = await (prisma as any).rawMaterialLot.update({ where: { id, shopId: shop.id }, data: patch });
  return json(updated);
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  await assertOwned(req, id);
  // FK on ProductionBatch.rawLotId is NO ACTION — Prisma will refuse if any
  // batch still points to this lot. Return a friendly 409 instead of leaking
  // the raw P2003 text (same UX we shipped for supplier deletes earlier).
  try {
    await (prisma as any).rawMaterialLot.delete({ where: { id } });
  } catch (err: any) {
    if (err?.code === 'P2003') {
      throw new ApiError(409, 'Cannot delete: one or more production batches were made from this lot. Close or reassign those batches first.');
    }
    throw err;
  }
  return json({ success: true });
});
