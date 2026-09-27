import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = handle(async (req, ctx: any) => {
  const params = await ctx.params;
  const { shop } = await requireShop(req);
  const { id, stageId, outputId } = await params;
  const body = await readBody<any>(req);

  const stageOutput = await prisma.batchStageOutput.findFirst({
    where: {
      id: outputId,
      stageSnapshot: {
        id: stageId,
        snapshot: { productionBatchId: id, batch: { shopId: shop.id } }
      }
    },
    include: {
      stageSnapshot: true
    }
  });

  if (!stageOutput) throw new ApiError(404, 'Output not found', 'OUTPUT_NOT_FOUND');
  if (stageOutput.stageSnapshot.status !== 'IN_PROGRESS') {
    throw new ApiError(400, 'Stage must be IN_PROGRESS to record outputs', 'INVALID_STATUS');
  }

  const { actualQuantity, actualUnit, notes } = body;

  const updated = await prisma.batchStageOutput.update({
    where: { id: outputId },
    data: {
      actualQuantity: actualQuantity !== undefined ? actualQuantity : stageOutput.actualQuantity,
      actualUnit: actualUnit !== undefined ? actualUnit : stageOutput.actualUnit,
      notes: notes !== undefined ? notes : stageOutput.notes,
    }
  });

  return json(updated);
});
