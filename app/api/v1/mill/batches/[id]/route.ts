import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { toKg, lotSource, canonicalReceivedDate, computeLotQuantities, round3 } from '@/lib/server/millProduction';
import { packsOfOutputs } from '@/lib/server/packing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET  /api/v1/mill/batches/[id] — full detail (rawLot + stages + byProducts)
 * PATCH /api/v1/mill/batches/[id] — batch-level edits (stage, notes, planned output, input weight) while the run is open.
 *                                    Closing is NOT done here — use POST /finalize, which consumes the raw material and books
 *                                    the outputs atomically. A finalized batch is read-only.
 * DELETE /api/v1/mill/batches/[id] — atomic cancellation / deletion releasing lot allocation transactionally.
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
          batches: { select: { id: true, batchNumber: true, inputKg: true, status: true } },
        },
      },
      stages: { orderBy: { sequence: 'asc' } },
      byProducts: true,
      outputs: { orderBy: { createdAt: 'asc' } },
      inputLots: {
        orderBy: { sequence: 'asc' },
        include: {
          rawMaterialLot: {
            include: {
              product: { select: { id: true, name: true, sku: true, baseUnit: true } },
            },
          },
        },
      },
      wipLots: {
        orderBy: { createdAt: 'desc' },
        include: {
          product: { select: { id: true, name: true, sku: true } },
          sourceBatchStage: { select: { id: true, stageName: true } },
          godown: { select: { id: true, name: true } },
        },
      },
      finishedGoodsLots: {
        orderBy: { createdAt: 'desc' },
        include: {
          product: { select: { id: true, name: true, sku: true, baseUnit: true } },
          sourceBatchStage: { select: { id: true, stageName: true } },
          godown: { select: { id: true, name: true } },
        },
      },
      byProductLots: {
        orderBy: { createdAt: 'desc' },
        include: {
          product: { select: { id: true, name: true, sku: true, baseUnit: true } },
          sourceBatchStage: { select: { id: true, stageName: true } },
          godown: { select: { id: true, name: true } },
        },
      },
      rejectionLots: {
        orderBy: { createdAt: 'desc' },
        include: {
          product: { select: { id: true, name: true, sku: true, baseUnit: true } },
          sourceBatchStage: { select: { id: true, stageName: true } },
          godown: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!batch) throw new ApiError(404, 'Production batch not found');

  // Attach pack lines to outputs (used by badaudyog pack size display)
  const outputIds = (batch.outputs || []).map((o: any) => o.id);
  const packMap = outputIds.length ? await packsOfOutputs(prisma, outputIds) : new Map();
  const outputsWithPacks = (batch.outputs || []).map((o: any) => ({
    ...o,
    packLines: (packMap.get(o.id) || []).map((l: any) => ({ packKg: l.packKg, packs: l.packs, packType: l.packType })),
  }));

  if (batch.rawLot) {
    const { weighbridgeEntries, batches, ...lot } = batch.rawLot;
    const src = lotSource(batch.rawLot);
    const recDate = canonicalReceivedDate(batch.rawLot);
    const qty = computeLotQuantities(batch.rawLot);
    return json({
      ...batch,
      outputs: outputsWithPacks,
      rawLot: {
        ...lot,
        ...src,
        receivedDate: recDate.toISOString(),
        receivedKg: qty.quantity,
        allocatedKg: qty.allocatedKg,
        consumedKg: qty.consumedKg,
        availableKg: qty.availableKg,
        operationalStatus: qty.operationalStatus,
      },
    });
  }
  return json({ ...batch, outputs: outputsWithPacks });
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

  // Prevent changing the source raw material lot directly on an allocated batch
  if (body.rawLotId !== undefined && body.rawLotId !== batch.rawLotId) {
    throw new ApiError(400, 'Cannot change source lot of an allocated batch directly. Cancel or delete this batch and create a new allocation.', 'LOT_CHANGE_NOT_ALLOWED');
  }

  // Recorded results are written by /finalize only; they cannot be typed in here.
  for (const k of ['outputKg', 'wastageKg', 'brokenKg', 'branKg', 'huskKg', 'recoveryPct']) {
    if (body[k] !== undefined) throw new ApiError(400, `${k} is set when the batch is finalized, not edited here.`, 'USE_FINALIZE');
  }

  const patch: any = {};
  if (body.inputQuantity !== undefined && body.inputKg === undefined) {
    const rawQty = Number(body.inputQuantity);
    if (!isFinite(rawQty) || rawQty <= 0) throw new ApiError(400, 'inputQuantity must be a positive number', 'INVALID_QUANTITY');
    patch.inputKg = toKg(rawQty, body.unit ?? 'kg');
  }
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

  const ops: any[] = [];

  // Transactional reallocation guard: re-validate available capacity
  if (patch.inputKg !== undefined && batch.rawLotId) {
    const lot = await (prisma as any).rawMaterialLot.findFirst({
      where: { id: batch.rawLotId, shopId: shop.id },
      select: { id: true, quantity: true, remainingQuantity: true },
    });
    if (!lot) throw new ApiError(404, 'Raw material lot not found');

    const unconsumedKg = round3(Number(lot.remainingQuantity ?? lot.quantity ?? 0));

    // Active allocations on this lot by OTHER batches
    const otherBatches = await (prisma as any).productionBatch.findMany({
      where: {
        rawLotId: batch.rawLotId,
        shopId: shop.id,
        status: { in: ['open', 'in_progress'] },
        id: { not: id },
      },
      select: { inputKg: true },
    });
    const otherAllocatedKg = round3(otherBatches.reduce((s: number, b: any) => s + (Number(b.inputKg) || 0), 0));
    const maxAllowedForThisBatch = round3(Math.max(0, unconsumedKg - otherAllocatedKg));

    if (patch.inputKg > maxAllowedForThisBatch) {
      throw new ApiError(
        400,
        `Only ${round3(maxAllowedForThisBatch)} kg available for this batch in that lot (${otherAllocatedKg} kg is allocated to other active batches) — cannot allocate ${patch.inputKg} kg.`,
        'INSUFFICIENT_RAW_STOCK'
      );
    }

    // Keep stage 1 input in sync if it mirrors batch input
    ops.push(
      (prisma as any).batchStage.updateMany({
        where: { batchId: id, sequence: 1 },
        data: { inputKg: patch.inputKg },
      })
    );
  }

  ops.push(
    (prisma as any).productionBatch.update({
      where: { id },
      data: patch,
      include: {
        rawLot: {
          include: {
            product: { select: { name: true, baseUnit: true } },
            supplier: { select: { name: true, mobile: true } },
            batches: { select: { id: true, batchNumber: true, inputKg: true, status: true } },
          },
        },
        stages: { orderBy: { sequence: 'asc' } },
        byProducts: true,
        outputs: { orderBy: { createdAt: 'asc' } },
      },
    })
  );

  const results = await prisma.$transaction(ops);
  let updated = results[results.length - 1];

  if (updated.rawLot) {
    const qty = computeLotQuantities(updated.rawLot);
    updated.rawLot = {
      ...updated.rawLot,
      receivedDate: canonicalReceivedDate(updated.rawLot).toISOString(),
      receivedKg: qty.quantity,
      allocatedKg: qty.allocatedKg,
      consumedKg: qty.consumedKg,
      availableKg: qty.availableKg,
      operationalStatus: qty.operationalStatus,
    };
  }

  return json(updated);
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop, batch } = await assertOwned(req, id);

  if (batch.status === 'closed') {
    throw new ApiError(409, 'A finalized batch cannot be deleted — its stock effects are permanent.', 'BATCH_FINALIZED');
  }

  const marker = await prisma.stockMovement.findFirst({
    where: { shopId: shop.id, type: 'production_start', referenceId: id },
    select: { id: true },
  });

  const ops: any[] = [];
  if (!marker && batch.rawLotId && batch.inputKg) {
    ops.push(
      (prisma as any).rawMaterialLot.update({
        where: { id: batch.rawLotId },
        data: { remainingQuantity: { increment: Number(batch.inputKg) || 0 } },
      })
    );
  }

  // A reprocessing batch took its material out of a rejection lot when it was started: cancelling it puts that material back
  // (and the lot's status goes back to Available / Partially reprocessed), so nothing is lost.
  if (batch.batchType === 'REPROCESSING' && batch.rejectionLotId && Number(batch.inputKg) > 0) {
    ops.push(prisma.$executeRaw`
      UPDATE rejection_lots
         SET available_quantity = LEAST(quantity, available_quantity + ${Number(batch.inputKg)}),
             status = CASE WHEN status IN ('DISPOSED', 'BLOCKED') THEN status
                           WHEN available_quantity + ${Number(batch.inputKg)} >= quantity - 0.0001 THEN 'AVAILABLE'
                           ELSE 'PARTIALLY_REPROCESSED' END
       WHERE id = ${batch.rejectionLotId}::uuid AND shop_id = ${shop.id}::uuid`);
  }

  ops.push(
    prisma.stockMovement.deleteMany({ where: { shopId: shop.id, referenceId: id } }),
    (prisma as any).batchStage.deleteMany({ where: { batchId: id } }),
    (prisma as any).productionBatch.delete({ where: { id } }),
  );

  await prisma.$transaction(ops);
  return json({ success: true });
});
