import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; stageId: string }> };

/**
 * GET /api/v1/mill/batches/[id]/stages/[stageId]/inputs
 * Get all inputs configured or recorded for a stage.
 */
export const GET = handle<Ctx>(async (req, { params }) => {
  const { shop } = await requireShop(req);
  const { id, stageId } = await params;

  // Try finding stage snapshot first
  let snapshotStage = await prisma.batchStageSnapshot.findFirst({
    where: {
      id: stageId,
      snapshot: { productionBatchId: id, batch: { shopId: shop.id } },
    },
    include: {
      inputs: {
        include: {
          product: { select: { id: true, name: true, sku: true, baseUnit: true } },
          sourceLot: { select: { id: true, lotNumber: true, remainingQuantity: true } },
          wipLot: { select: { id: true, lotNumber: true, availableQuantity: true } },
          rejectionLot: { select: { id: true, lotNumber: true, availableQuantity: true } },
        },
      },
    },
  });

  // If stageId is a BatchStage ID, resolve to matching snapshot stage
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
          inputs: {
            include: {
              product: { select: { id: true, name: true, sku: true, baseUnit: true } },
              sourceLot: { select: { id: true, lotNumber: true, remainingQuantity: true } },
              wipLot: { select: { id: true, lotNumber: true, availableQuantity: true } },
              rejectionLot: { select: { id: true, lotNumber: true, availableQuantity: true } },
            },
          },
        },
      });
    }
  }

  return json(snapshotStage?.inputs || []);
});

/**
 * POST /api/v1/mill/batches/[id]/stages/[stageId]/inputs
 * Add a new input lot assignment to a stage.
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

  const { productId, inputType = 'RAW_MATERIAL', sourceLotId, wipLotId, rejectionLotId, actualQuantity, actualUnit = 'kg', notes } = body;

  const newInput = await prisma.batchStageInput.create({
    data: {
      batchStageSnapshotId: snapshotStage.id,
      productId: productId || null,
      inputType: inputType || 'RAW_MATERIAL',
      quantityRuleType: 'FIXED',
      unit: (actualUnit || 'kg').toLowerCase(),
      actualQuantity: actualQuantity ? Number(actualQuantity) : null,
      actualUnit: (actualUnit || 'kg').toLowerCase(),
      sourceLotId: sourceLotId || null,
      wipLotId: wipLotId || null,
      rejectionLotId: rejectionLotId || null,
      notes: notes || null,
    },
    include: {
      product: { select: { id: true, name: true, sku: true, baseUnit: true } },
      sourceLot: { select: { id: true, lotNumber: true, remainingQuantity: true } },
      wipLot: { select: { id: true, lotNumber: true, availableQuantity: true } },
      rejectionLot: { select: { id: true, lotNumber: true, availableQuantity: true } },
    },
  });

  return json(newInput, 201);
});
