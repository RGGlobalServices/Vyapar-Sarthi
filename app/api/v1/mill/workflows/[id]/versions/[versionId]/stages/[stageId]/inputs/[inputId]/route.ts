import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = handle(async (req, ctx: any) => {
  const { shop } = await requireShop(req);
  const { id, versionId, stageId, inputId } = await ctx.params;
  const body = await readBody(req);

  const version = await prisma.workflowVersion.findFirst({
    where: { id: versionId, workflowId: id, workflow: { shopId: shop.id } }
  });
  if (!version) throw new ApiError(404, 'Workflow version not found');
  if (version.status !== 'draft') throw new ApiError(400, 'Cannot modify inputs of a non-draft workflow version.');

  // verify the input exists and belongs to this stage
  const existing = await prisma.stageInputConfig.findUnique({ where: { id: inputId } });
  if (!existing || existing.workflowStageId !== stageId) throw new ApiError(404, 'Input not found');

  if (body.productId && body.productId !== existing.productId) {
    const product = await prisma.product.findFirst({ where: { id: body.productId, shopId: shop.id } });
    if (!product) throw new ApiError(404, 'Product not found or access denied');
  }

  const updated = await prisma.stageInputConfig.update({
    where: { id: inputId },
    data: {
      ...(body.productId !== undefined && { productId: body.productId }),
      ...(body.inputType !== undefined && { inputType: body.inputType }),
      ...(body.quantityRuleType !== undefined && { quantityRuleType: body.quantityRuleType }),
      ...(body.quantityValue !== undefined && { quantityValue: body.quantityValue ? Number(body.quantityValue) : null }),
      ...(body.unit !== undefined && { unit: body.unit }),
      ...(body.isRequired !== undefined && { isRequired: body.isRequired }),
      ...(body.sequence !== undefined && { sequence: body.sequence }),
      ...(body.notes !== undefined && { notes: body.notes })
    },
    include: { product: true }
  });

  return json(updated);
});

export const DELETE = handle(async (req, ctx: any) => {
  const { shop } = await requireShop(req);
  const { id, versionId, stageId, inputId } = await ctx.params;

  const version = await prisma.workflowVersion.findFirst({
    where: { id: versionId, workflowId: id, workflow: { shopId: shop.id } }
  });
  if (!version) throw new ApiError(404, 'Workflow version not found');
  if (version.status !== 'draft') throw new ApiError(400, 'Cannot modify inputs of a non-draft workflow version.');

  try {
    await prisma.stageInputConfig.delete({
      where: { id: inputId, workflowStageId: stageId }
    });
    return json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2025') throw new ApiError(404, 'Input not found');
    throw error;
  }
});
