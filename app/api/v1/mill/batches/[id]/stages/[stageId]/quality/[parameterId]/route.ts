import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = handle(async (req, ctx: any) => {
  const params = await ctx.params;
  const { shop, user } = await requireShop(req);
  const { id, stageId, parameterId } = await params;
  const body = await readBody<any>(req);

  const qualityParam = await prisma.batchStageQualityParameter.findFirst({
    where: {
      id: parameterId,
      stageSnapshot: {
        id: stageId,
        snapshot: { productionBatchId: id, batch: { shopId: shop.id } }
      }
    },
    include: {
      stageSnapshot: true
    }
  });

  if (!qualityParam) throw new ApiError(404, 'Quality parameter not found', 'QUALITY_NOT_FOUND');
  if (qualityParam.stageSnapshot.status !== 'IN_PROGRESS') {
    throw new ApiError(400, 'Stage must be IN_PROGRESS to record quality', 'INVALID_STATUS');
  }

  const { actualValue, remarks } = body;
  
  let result = 'PASS';
  
  if (actualValue !== undefined && actualValue !== null && actualValue !== '') {
    if (qualityParam.dataType === 'NUMBER') {
      const val = parseFloat(actualValue);
      if (isNaN(val)) throw new ApiError(400, 'Value must be a number', 'INVALID_VALUE');
      const min = qualityParam.minValue !== null ? parseFloat(qualityParam.minValue.toString()) : -Infinity;
      const max = qualityParam.maxValue !== null ? parseFloat(qualityParam.maxValue.toString()) : Infinity;
      
      if (val < min || val > max) {
        result = qualityParam.failureAction; // WARNING, HOLD, REJECT
      }
    } else if (qualityParam.dataType === 'BOOLEAN') {
      if (actualValue !== 'true' && actualValue !== 'false' && typeof actualValue !== 'boolean') {
        throw new ApiError(400, 'Value must be a boolean', 'INVALID_VALUE');
      }
      const boolVal = actualValue === 'true' || actualValue === true;
      const targetVal = qualityParam.targetValue === 'true';
      if (qualityParam.targetValue !== null && boolVal !== targetVal) {
        result = qualityParam.failureAction;
      }
    } else if (qualityParam.dataType === 'ENUM') {
      if (qualityParam.targetValue && actualValue !== qualityParam.targetValue) {
        result = qualityParam.failureAction;
      }
    } else if (qualityParam.dataType === 'TEXT') {
      if (qualityParam.targetValue && actualValue !== qualityParam.targetValue) {
        result = qualityParam.failureAction;
      }
    }
  } else if (qualityParam.isRequired) {
    result = 'NOT_CHECKED';
  }

  const updated = await prisma.batchStageQualityParameter.update({
    where: { id: parameterId },
    data: {
      actualValue: actualValue !== undefined ? String(actualValue) : qualityParam.actualValue,
      result: actualValue !== undefined ? result : qualityParam.result,
      remarks: remarks !== undefined ? remarks : qualityParam.remarks,
      checkedBy: user.id,
      checkedAt: new Date()
    }
  });

  // If result is HOLD and parameter is critical, we might update stage status to HOLD
  if ((result === 'HOLD' || result === 'REJECT') && qualityParam.isCritical) {
    await prisma.batchStageSnapshot.update({
      where: { id: stageId },
      data: { status: 'HOLD' }
    });
  }

  return json(updated);
});
