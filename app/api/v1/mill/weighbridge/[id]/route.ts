import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { assertOwned as assertRefsOwned } from '@/lib/server/ownership';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET   /api/v1/mill/weighbridge/[id] — full detail
 * PATCH /api/v1/mill/weighbridge/[id] — record the SECOND weighment
 *         (tareWeightKg) → auto-computes netWeightKg and flips status to
 *         'completed'; also accepts plain field edits before that point.
 * DELETE /api/v1/mill/weighbridge/[id] — only while not yet converted to a
 *         Raw Material Lot (converting is a one-way step, same as closing a
 *         production batch).
 */

async function assertOwned(req: Request, id: string) {
  const { shop } = await requireShop(req);
  const entry = await (prisma as any).weighbridgeEntry.findFirst({ where: { id, shopId: shop.id } });
  if (!entry) throw new ApiError(404, 'Weighbridge entry not found');
  return { shop, entry };
}

export const GET = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const entry = await (prisma as any).weighbridgeEntry.findFirst({
    where: { id, shopId: shop.id },
    include: {
      gateEntry: { select: { id: true, entryNumber: true, driverName: true, driverMobile: true, status: true } },
      product: { select: { id: true, name: true, baseUnit: true } },
      supplier: { select: { id: true, name: true, mobile: true } },
      rawLot: { select: { id: true, lotNumber: true } },
    },
  });
  if (!entry) throw new ApiError(404, 'Weighbridge entry not found');
  return json(entry);
});

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop, entry } = await assertOwned(req, id);
  const body = await readBody<any>(req);
  // Linked ids are client-supplied — they must belong to this shop, or another
  // shop's names/mobiles come back through the response join.
  await assertRefsOwned(shop.id, { productId: body.productId, supplierId: body.supplierId });

  if (entry.status === 'converted') {
    throw new ApiError(400, 'This slip is already converted to a Raw Material Lot and can no longer be edited');
  }

  const patch: any = {};
  if (body.materialDescription !== undefined) patch.materialDescription = body.materialDescription == null ? null : String(body.materialDescription).trim() || null;
  if (body.productId !== undefined) patch.productId = body.productId || null;
  if (body.supplierId !== undefined) patch.supplierId = body.supplierId || null;
  if (body.moisturePct !== undefined) {
    patch.moisturePct = body.moisturePct === null || body.moisturePct === ''
      ? null : Math.max(0, Math.min(100, Number(body.moisturePct) || 0));
  }
  if (body.ratePerUnit !== undefined) patch.ratePerUnit = body.ratePerUnit === null || body.ratePerUnit === '' ? null : Number(body.ratePerUnit);
  if (body.notes !== undefined) patch.notes = body.notes == null ? null : String(body.notes).trim() || null;

  // Second weighment — tare weight — computes net and closes the two-weigh
  // workflow. Net is always the absolute difference so it doesn't matter
  // whether the operator weighs gross-then-tare or tare-then-gross.
  if (body.tareWeightKg !== undefined && body.tareWeightKg !== null && body.tareWeightKg !== '') {
    const tareWeightKg = Number(body.tareWeightKg);
    if (!isFinite(tareWeightKg) || tareWeightKg < 0) throw new ApiError(400, 'Tare weight must be a non-negative number');
    patch.tareWeightKg = tareWeightKg;
    patch.netWeightKg = Math.round(Math.abs((entry.grossWeightKg || 0) - tareWeightKg) * 100) / 100;
    patch.secondWeighedAt = new Date();
    patch.status = 'completed';
  }

  const updated = await (prisma as any).weighbridgeEntry.update({
    where: { id },
    data: patch,
    include: {
      gateEntry: { select: { id: true, entryNumber: true } },
      product: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
    },
  });
  return json(updated);
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { entry } = await assertOwned(req, id);
  if (entry.status === 'converted') {
    throw new ApiError(409, 'Cannot delete a slip already converted to a Raw Material Lot');
  }
  await (prisma as any).weighbridgeEntry.delete({ where: { id } });
  return json({ success: true });
});
