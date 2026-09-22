import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { lotSource } from '@/lib/server/millProduction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET  /api/v1/mill/batches/[id] — full detail (rawLot + stages + byProducts)
 * PATCH /api/v1/mill/batches/[id] — batch-level edits (stage, notes, planned output, input weight) while the run is open.
 *                                    Closing is NOT done here — use POST /finalize, which consumes the raw material and books
 *                                    the outputs atomically. A finalized batch is read-only.
 */

async function assertOwned(req: Request, id: string) {
  const { shop } = await requireShop(req);
  const batch = await (prisma as any).productionBatch.findFirst({
    where: { id, shopId: shop.id },
    include: { byProducts: { select: { id: true } } },
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
          product: { select: { id: true, name: true, baseUnit: true } },
          supplier: { select: { name: true, mobile: true } },
          weighbridgeEntries: { select: { slipNumber: true } },
        },
      },
      stages: { orderBy: { sequence: 'asc' } },
      byProducts: true,
      outputs: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!batch) throw new ApiError(404, 'Production batch not found');
  if (batch.rawLot) {
    const { weighbridgeEntries, ...lot } = batch.rawLot;
    return json({ ...batch, rawLot: { ...lot, ...lotSource(batch.rawLot) } });
  }
  return json(batch);
});

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop, batch } = await assertOwned(req, id);
  const body = await readBody<any>(req);

  if (body.status !== undefined && String(body.status) === 'closed') {
    throw new ApiError(400, 'Finalize the batch from the production screen (POST /finalize) — closing it directly would skip the raw material consumption and the mass balance.', 'USE_FINALIZE');
  }
  if (batch.status === 'closed') {
    throw new ApiError(409, 'This batch is finalized — its stock effects can no longer be edited.', 'BATCH_FINALIZED');
  }
  // Recorded results are written by /finalize only; they cannot be typed in here.
  for (const k of ['outputKg', 'wastageKg', 'brokenKg', 'branKg', 'huskKg', 'recoveryPct']) {
    if (body[k] !== undefined) throw new ApiError(400, `${k} is set when the batch is finalized, not edited here.`, 'USE_FINALIZE');
  }

  const patch: any = {};
  const numKeys = ['inputKg', 'plannedOutputKg'] as const;
  for (const k of numKeys) {
    if (body[k] !== undefined) patch[k] = body[k] === null || body[k] === '' ? null : Number(body[k]);
  }
  if (body.currentStage !== undefined) patch.currentStage = String(body.currentStage);
  if (body.notes !== undefined) patch.notes = body.notes == null ? null : String(body.notes).trim() || null;
  if (body.status !== undefined) patch.status = String(body.status);
  if (body.outputProductId !== undefined) {
    if (body.outputProductId) {
      const product = await prisma.product.findFirst({ where: { id: body.outputProductId, shopId: shop.id } });
      if (!product) throw new ApiError(400, 'Output product not found for this shop');
    }
    patch.outputProductId = body.outputProductId || null;
  }

  if (patch.inputKg !== undefined && (patch.inputKg === null || !isFinite(patch.inputKg) || patch.inputKg <= 0)) {
    throw new ApiError(400, 'inputKg must be a positive number');
  }
  if (patch.inputKg !== undefined && batch.rawLotId) {
    const lot = await (prisma as any).rawMaterialLot.findFirst({ where: { id: batch.rawLotId, shopId: shop.id }, select: { remainingKg: true } });
    if (lot && (lot.remainingKg ?? 0) < patch.inputKg) {
      throw new ApiError(400, `Only ${lot.remainingKg ?? 0} kg is left in the raw material lot.`, 'INSUFFICIENT_RAW_STOCK');
    }
  }

  const ops: any[] = [
    (prisma as any).productionBatch.update({
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
        outputs: { orderBy: { createdAt: 'asc' } },
      },
    }),
  ];

  const [updated] = await prisma.$transaction(ops);
  return json(updated);
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop, batch } = await assertOwned(req, id);
  // A finalized run has already moved stock (raw material out, outputs in, and possibly sold on). There is no reversal
  // workflow yet, so deleting it would silently leave the stock wrong.
  if (batch.status === 'closed') {
    throw new ApiError(409, 'A finalized batch cannot be deleted — its stock effects are permanent.', 'BATCH_FINALIZED');
  }
  // Batches started under the finalize workflow have consumed nothing yet, so there is nothing to give back. Older batches took
  // their kilos out of the lot when they were created (no `production_start` marker) — return those.
  const marker = await prisma.stockMovement.findFirst({ where: { shopId: shop.id, type: 'production_start', referenceId: id }, select: { id: true } });
  await prisma.$transaction(async (tx) => {
    if (!marker && batch.rawLotId && batch.inputKg) {
      await (tx as any).rawMaterialLot.update({ where: { id: batch.rawLotId }, data: { remainingKg: { increment: Number(batch.inputKg) || 0 } } });
    }
    await tx.stockMovement.deleteMany({ where: { shopId: shop.id, type: 'production_start', referenceId: id } });
    await (tx as any).productionBatch.delete({ where: { id } });
  });
  return json({ success: true });
});
