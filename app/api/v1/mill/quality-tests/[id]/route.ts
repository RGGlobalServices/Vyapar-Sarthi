import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/mill/quality-tests/[id] — record the shopkeeper's own
 * accept/reject decision, or edit notes/certificate. The computed `flag`
 * itself is not editable here — it's a snapshot from create time.
 * DELETE /api/v1/mill/quality-tests/[id]
 */

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const existing = await (prisma as any).qualityTest.findFirst({ where: { id, shopId: shop.id } });
  if (!existing) throw new ApiError(404, 'Quality test not found');

  const body = await readBody<any>(req);
  const patch: any = {};
  if (body.decision !== undefined) {
    if (!['pending', 'accepted', 'rejected'].includes(body.decision)) throw new ApiError(400, 'Invalid decision');
    patch.decision = body.decision;
  }
  if (body.notes !== undefined) patch.notes = (body.notes || '').toString().trim() || null;
  if (body.certificateUrl !== undefined) patch.certificateUrl = (body.certificateUrl || '').toString().trim() || null;

  const updated = await (prisma as any).qualityTest.update({
    where: { id },
    data: patch,
    include: {
      rawLot: { select: { id: true, lotNumber: true, farmerName: true } },
      batch: { select: { id: true, batchNumber: true } },
    },
  });
  return json(updated);
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const existing = await (prisma as any).qualityTest.findFirst({ where: { id, shopId: shop.id } });
  if (!existing) throw new ApiError(404, 'Quality test not found');
  await (prisma as any).qualityTest.delete({ where: { id } });
  return json({ success: true });
});
