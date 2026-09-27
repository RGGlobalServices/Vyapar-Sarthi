import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';
import { recordStageAuditEvent } from '@/lib/server/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req, ctx: any) => {
  const params = await ctx.params;
  const { shop, user } = await requireShop(req);
  const { id, stageId } = await params;

  // Find the snapshot stage
  const stage = await prisma.batchStageSnapshot.findFirst({
    where: {
      id: stageId,
      snapshot: { productionBatchId: id, batch: { shopId: shop.id } }
    },
    include: {
      snapshot: {
        include: {
          stages: { orderBy: { sequence: 'asc' } }
        }
      }
    }
  });

  if (!stage) throw new ApiError(404, 'Stage not found', 'STAGE_NOT_FOUND');
  if (stage.status !== 'PENDING') throw new ApiError(400, 'Stage is not PENDING', 'INVALID_STATUS');

  // Verify previous required stages are completed
  const allStages = stage.snapshot.stages;
  for (const s of allStages) {
    if (s.sequence < stage.sequence && s.isRequired && s.status !== 'COMPLETED') {
      throw new ApiError(400, `Required previous stage (${s.stageName}) is not completed`, 'PREVIOUS_STAGE_INCOMPLETE');
    }
  }

  // Update status
  const updated = await prisma.batchStageSnapshot.update({
    where: { id: stage.id },
    data: {
      status: 'IN_PROGRESS',
      startedAt: new Date(),
    }
  });

  // Also update batch status to IN_PROGRESS if open
  await prisma.productionBatch.updateMany({
    where: { id, shopId: shop.id, status: 'open' },
    data: { status: 'in_progress', currentStage: stage.stageName, startedAt: new Date() }
  });
  
  // Legacy sync if we want to keep BatchStage in sync
  const legacyStage = await prisma.batchStage.findFirst({
    where: { batchId: id, sequence: stage.sequence }
  });
  if (legacyStage && !legacyStage.startedAt) {
    await prisma.batchStage.update({
      where: { id: legacyStage.id },
      data: { startedAt: new Date() }
    });
  }

  await recordStageAuditEvent({
    shopId: shop.id,
    userId: user?.id,
    action: 'STAGE_STARTED',
    entityId: stage.id,
    details: { batchId: id, stageName: stage.stageName, sequence: stage.sequence },
  });

  return json(updated);
});
