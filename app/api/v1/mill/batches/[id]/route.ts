import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET  /api/v1/mill/batches/[id] — full detail (rawLot + stages + byProducts)
 * PATCH /api/v1/mill/batches/[id] — batch-level edits: currentStage, output/
 *                                    broken/bran/husk kg, close batch.
 *                                    On status='closed', recoveryPct is
 *                                    auto-computed from outputKg / inputKg and
 *                                    closedAt is stamped.
 */

async function assertOwned(req: Request, id: string) {
  const { shop } = await requireShop(req);
  const batch = await (prisma as any).productionBatch.findFirst({
    where: { id, shopId: shop.id },
  });
  if (!batch) throw new ApiError(404, 'Production batch not found');
  return { shop, batch };
}

export const GET = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const batch = await (prisma as any).productionBatch.findFirst({
    where: { id, shopId: shop.id },
    include: {
      rawLot: {
        include: {
          product: { select: { name: true, baseUnit: true } },
          supplier: { select: { name: true, mobile: true } },
        },
      },
      stages: { orderBy: { sequence: 'asc' } },
      byProducts: true,
    },
  });
  if (!batch) throw new ApiError(404, 'Production batch not found');
  return json(batch);
});

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { batch } = await assertOwned(req, id);
  const body = await readBody<any>(req);

  const patch: any = {};
  const numKeys = ['inputKg', 'outputKg', 'wastageKg', 'brokenKg', 'branKg', 'huskKg'] as const;
  for (const k of numKeys) {
    if (body[k] !== undefined) patch[k] = body[k] === null || body[k] === '' ? null : Number(body[k]);
  }
  if (body.currentStage !== undefined) patch.currentStage = String(body.currentStage);
  if (body.notes !== undefined) patch.notes = String(body.notes).trim() || null;
  if (body.status !== undefined) patch.status = String(body.status);

  // Closing a batch is the moment recovery is measured — output ÷ input ×
  // 100. Guard against divide-by-zero; a batch closed with no input is a
  // data-entry error, not a math problem, so leave recoveryPct null and let
  // the UI show a warning instead of "Infinity%".
  const closing = patch.status === 'closed' && batch.status !== 'closed';
  if (closing) {
    const finalOutput = Number(patch.outputKg ?? batch.outputKg ?? 0) || 0;
    const finalInput = Number(patch.inputKg ?? batch.inputKg ?? 0) || 0;
    patch.recoveryPct = finalInput > 0
      ? Math.round((finalOutput / finalInput) * 10000) / 100
      : null;
    patch.closedAt = new Date();
    patch.currentStage = 'packing';
  }

  const updated = await (prisma as any).productionBatch.update({
    where: { id },
    data: patch,
    include: {
      rawLot: {
        include: {
          product: { select: { name: true, baseUnit: true } },
          supplier: { select: { name: true, mobile: true } },
        },
      },
      stages: { orderBy: { sequence: 'asc' } },
      byProducts: true,
    },
  });
  return json(updated);
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { batch } = await assertOwned(req, id);
  // Return the consumed weight to the source lot so the raw-material ledger
  // stays consistent — otherwise deleting a mid-run batch would silently
  // "eat" inventory. Skipped for closed batches on the assumption that the
  // consumption is already reflected in downstream inventory.
  if (batch.rawLotId && batch.status !== 'closed' && batch.inputKg) {
    await (prisma as any).rawMaterialLot.update({
      where: { id: batch.rawLotId },
      data: { remainingKg: { increment: Number(batch.inputKg) || 0 } },
    });
  }
  await (prisma as any).productionBatch.delete({ where: { id } });
  return json({ success: true });
});
