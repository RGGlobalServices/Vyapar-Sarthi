import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = handle(async (req, ctx: any) => {
  const { shop } = await requireShop(req);
  const { id, versionId, stageId, qualityId } = await ctx.params;
  const body = await readBody(req);

  const version = await prisma.workflowVersion.findFirst({
    where: { id: versionId, workflowId: id, workflow: { shopId: shop.id } }
  });
  if (!version) throw new ApiError(404, 'Workflow version not found');
  if (version.status !== 'draft') throw new ApiError(400, 'Cannot modify quality rules of a non-draft workflow version.');

  // verify the rule exists and belongs to this stage
  const existing = await prisma.stageQualityConfig.findUnique({ where: { id: qualityId } });
  if (!existing || existing.workflowStageId !== stageId) throw new ApiError(404, 'Quality rule not found');

  const updated = await prisma.stageQualityConfig.update({
    where: { id: qualityId },
    data: {
      ...(body.parameterName !== undefined && { parameterName: body.parameterName }),
      ...(body.parameterCode !== undefined && { parameterCode: body.parameterCode }),
      ...(body.dataType !== undefined && { dataType: body.dataType }),
      ...(body.unit !== undefined && { unit: body.unit }),
      ...(body.minValue !== undefined && { minValue: body.minValue !== null ? Number(body.minValue) : null }),
      ...(body.maxValue !== undefined && { maxValue: body.maxValue !== null ? Number(body.maxValue) : null }),
      ...(body.targetValue !== undefined && { targetValue: body.targetValue }),
      ...(body.isRequired !== undefined && { isRequired: body.isRequired }),
      ...(body.isCritical !== undefined && { isCritical: body.isCritical }),
      ...(body.failureAction !== undefined && { failureAction: body.failureAction }),
      ...(body.instructions !== undefined && { instructions: body.instructions })
    }
  });

  return json(updated);
});

export const DELETE = handle(async (req, ctx: any) => {
  const { shop } = await requireShop(req);
  const { id, versionId, stageId, qualityId } = await ctx.params;

  const version = await prisma.workflowVersion.findFirst({
    where: { id: versionId, workflowId: id, workflow: { shopId: shop.id } }
  });
  if (!version) throw new ApiError(404, 'Workflow version not found');
  if (version.status !== 'draft') throw new ApiError(400, 'Cannot modify quality rules of a non-draft workflow version.');

  try {
    await prisma.stageQualityConfig.delete({
      where: { id: qualityId, workflowStageId: stageId }
    });
    return json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2025') throw new ApiError(404, 'Quality rule not found');
    throw error;
  }
});
