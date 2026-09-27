import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; stageId: string }> };

/**
 * GET /api/v1/mill/batches/[id]/stages/[stageId]/quality
 * Get all quality parameters configured or recorded for a stage.
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
      qualityParameters: true,
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
          qualityParameters: true,
        },
      });
    }
  }

  return json(snapshotStage?.qualityParameters || []);
});

/**
 * POST /api/v1/mill/batches/[id]/stages/[stageId]/quality
 * Add a new quality parameter check to a stage.
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

  const { parameterName, dataType = 'NUMBER', targetValue, minValue, maxValue, unit, isRequired = false, isCritical = false } = body;

  const newQuality = await prisma.batchStageQualityParameter.create({
    data: {
      batchStageSnapshotId: snapshotStage.id,
      parameterName: parameterName || 'Quality Check',
      dataType: dataType || 'NUMBER',
      targetValue: targetValue ? String(targetValue) : null,
      minValue: minValue !== undefined && minValue !== '' ? Number(minValue) : null,
      maxValue: maxValue !== undefined && maxValue !== '' ? Number(maxValue) : null,
      unit: unit || null,
      isRequired: Boolean(isRequired),
      isCritical: Boolean(isCritical),
      result: 'PASS',
    },
  });

  return json(newQuality, 201);
});
