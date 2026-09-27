import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; stageId: string }> };

/**
 * GET /api/v1/mill/batches/[id]/stages/[stageId]/outputs
 * Get all configured or recorded stage outputs.
 */
export const GET = handle<Ctx>(async (req, { params }) => {
  const { shop } = await requireShop(req);
  const { id, stageId } = await params;

  let snapshotStage = await prisma.batchStageSnapshot.findFirst({
    where: {
      id: stageId,
      snapshot: { productionBatchId: id, batch: { shopId: shop.id } },
    },
    include: {
      outputs: {
        include: {
          product: { select: { id: true, name: true, sku: true, baseUnit: true } },
        },
      },
    },
  });

  if (!snapshotStage) {
    const batchStage = await prisma.batchStage.findFirst({
      where: { id: stageId, batchId: id, batch: { shopId: shop.id } },
    });

    if (batchStage) {
      snapshotStage = await prisma.batchStageSnapshot.findFirst({
        where: {
          snapshot: { productionBatchId: id, batch: { shopId: shop.id } },
          sequence: batchStage.sequence,
        },
        include: {
          outputs: {
            include: {
              product: { select: { id: true, name: true, sku: true, baseUnit: true } },
            },
          },
        },
      });
    }
  }

  return json(snapshotStage?.outputs || []);
});

/**
 * POST /api/v1/mill/batches/[id]/stages/[stageId]/outputs
 * Add a new stage output record.
 */
export const POST = handle<Ctx>(async (req, { params }) => {
  const { shop } = await requireShop(req);
  const { id, stageId } = await params;
  const body = await readBody<any>(req);

  let snapshotStage = await prisma.batchStageSnapshot.findFirst({
    where: {
      id: stageId,
      snapshot: { productionBatchId: id, batch: { shopId: shop.id } },
    },
  });

  if (!snapshotStage) {
    const batchStage = await prisma.batchStage.findFirst({
      where: { id: stageId, batchId: id, batch: { shopId: shop.id } },
    });

    if (batchStage) {
      snapshotStage = await prisma.batchStageSnapshot.findFirst({
        where: {
          snapshot: { productionBatchId: id, batch: { shopId: shop.id } },
          sequence: batchStage.sequence,
        },
      });
    }
  }

  if (!snapshotStage) {
    throw new ApiError(404, 'Stage snapshot not found', 'STAGE_NOT_FOUND');
  }

  const { productId, outputType = 'FINISHED_GOOD', actualQuantity, actualUnit = 'kg', notes } = body;

  const newOutput = await prisma.batchStageOutput.create({
    data: {
      batchStageSnapshotId: snapshotStage.id,
      productId: productId || null,
      outputType: outputType || 'FINISHED_GOOD',
      quantityRuleType: 'MASS_BALANCE',
      unit: (actualUnit || 'kg').toLowerCase(),
      actualQuantity: actualQuantity ? Number(actualQuantity) : null,
      actualUnit: (actualUnit || 'kg').toLowerCase(),
      notes: notes || null,
    },
    include: {
      product: { select: { id: true, name: true, sku: true, baseUnit: true } },
    },
  });

  return json(newOutput, 201);
});
