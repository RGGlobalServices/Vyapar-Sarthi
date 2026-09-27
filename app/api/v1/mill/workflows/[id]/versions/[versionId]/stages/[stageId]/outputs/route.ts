import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req, ctx: any) => {
  const { shop } = await requireShop(req);
  const { id, versionId, stageId } = await ctx.params;

  const outputs = await prisma.stageOutputConfig.findMany({
    where: {
      workflowStageId: stageId,
      workflowStage: {
        workflowVersionId: versionId,
        workflowVersion: { workflowId: id, workflow: { shopId: shop.id } }
      }
    },
    include: { product: true },
    orderBy: { sequence: 'asc' }
  });

  return json(outputs);
});

export const POST = handle(async (req, ctx: any) => {
  const { shop } = await requireShop(req);
  const { id, versionId, stageId } = await ctx.params;
  const body = await readBody(req);

  const { 
    productId, outputType, quantityRuleType, quantityValue, unit, 
    expectedQuantity, minimumQuantity, maximumQuantity, tolerancePercent, 
    isRequired, sequence, notes 
  } = body;

  const version = await prisma.workflowVersion.findFirst({
    where: { id: versionId, workflowId: id, workflow: { shopId: shop.id } }
  });
  if (!version) throw new ApiError(404, 'Workflow version not found');
  if (version.status !== 'draft') throw new ApiError(400, 'Cannot modify outputs of a non-draft workflow version.');

  // Validate product belongs to shop
  const product = await prisma.product.findFirst({ where: { id: productId, shopId: shop.id } });
  if (!product) throw new ApiError(404, 'Product not found or access denied');

  const output = await prisma.stageOutputConfig.create({
    data: {
      workflowStageId: stageId,
      productId,
      outputType,
      quantityRuleType,
      quantityValue: quantityValue !== undefined && quantityValue !== null ? Number(quantityValue) : null,
      unit,
      expectedQuantity: expectedQuantity !== undefined && expectedQuantity !== null ? Number(expectedQuantity) : null,
      minimumQuantity: minimumQuantity !== undefined && minimumQuantity !== null ? Number(minimumQuantity) : null,
      maximumQuantity: maximumQuantity !== undefined && maximumQuantity !== null ? Number(maximumQuantity) : null,
      tolerancePercent: tolerancePercent !== undefined && tolerancePercent !== null ? Number(tolerancePercent) : null,
      isRequired: isRequired ?? true,
      sequence: sequence ?? 1,
      notes: notes || null
    },
    include: { product: true }
  });

  return json(output, 201);
});
