import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req, ctx: any) => {
  const { shop } = await requireShop(req);
  const { id, versionId, stageId } = await ctx.params;

  const rules = await prisma.stageQualityConfig.findMany({
    where: {
      workflowStageId: stageId,
      workflowStage: {
        workflowVersionId: versionId,
        workflowVersion: { workflowId: id, workflow: { shopId: shop.id } }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  return json(rules);
});

export const POST = handle(async (req, ctx: any) => {
  const { shop } = await requireShop(req);
  const { id, versionId, stageId } = await ctx.params;
  const body = await readBody(req);

  const { 
    parameterName, parameterCode, dataType, unit, 
    minValue, maxValue, targetValue, 
    isRequired, isCritical, failureAction, instructions 
  } = body;

  const version = await prisma.workflowVersion.findFirst({
    where: { id: versionId, workflowId: id, workflow: { shopId: shop.id } }
  });
  if (!version) throw new ApiError(404, 'Workflow version not found');
  if (version.status !== 'draft') throw new ApiError(400, 'Cannot modify quality rules of a non-draft workflow version.');

  const rule = await prisma.stageQualityConfig.create({
    data: {
      workflowStageId: stageId,
      parameterName,
      parameterCode: parameterCode || null,
      dataType,
      unit: unit || null,
      minValue: minValue !== undefined && minValue !== null ? Number(minValue) : null,
      maxValue: maxValue !== undefined && maxValue !== null ? Number(maxValue) : null,
      targetValue: targetValue || null,
      isRequired: isRequired ?? true,
      isCritical: isCritical ?? false,
      failureAction: failureAction || 'WARNING',
      instructions: instructions || null
    }
  });

  return json(rule, 201);
});
