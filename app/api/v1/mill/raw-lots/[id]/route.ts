import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
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
  await assertOwned(req, id);
  const body = await readBody<any>(req);

  // Blank-cell-never-overwrites convention — any field the caller doesn't
  // send is left alone. Numeric fields are re-derived when a related value
  // (weight / rate) changes so totalAmount stays consistent without the
  // caller having to compute it.
  const patch: any = {};
  if (body.lotNumber !== undefined)    patch.lotNumber   = String(body.lotNumber).trim() || null;
  if (body.farmerName !== undefined)   patch.farmerName  = String(body.farmerName).trim() || null;
  if (body.productId !== undefined)    patch.productId   = body.productId || null;
  if (body.supplierId !== undefined)   patch.supplierId  = body.supplierId || null;
  if (body.purchaseDate !== undefined) patch.purchaseDate = new Date(body.purchaseDate);
  if (body.weightKg !== undefined)     patch.weightKg    = Number(body.weightKg) || 0;
  if (body.ratePerKg !== undefined)    patch.ratePerKg   = Number(body.ratePerKg) || null;
  if (body.moisturePct !== undefined)  patch.moisturePct = body.moisturePct === null || body.moisturePct === ''
    ? null : Math.max(0, Math.min(100, Number(body.moisturePct) || 0));
  if (body.remainingKg !== undefined)  patch.remainingKg = Number(body.remainingKg) || 0;
  if (body.notes !== undefined)        patch.notes       = String(body.notes).trim() || null;

  if (patch.weightKg != null || patch.ratePerKg != null) {
    const nextWeight = patch.weightKg ?? undefined;
    const nextRate = patch.ratePerKg ?? undefined;
    if (nextWeight != null && nextRate != null) {
      patch.totalAmount = Math.round(nextWeight * nextRate * 100) / 100;
    }
  }

  const updated = await (prisma as any).rawMaterialLot.update({ where: { id }, data: patch });
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
