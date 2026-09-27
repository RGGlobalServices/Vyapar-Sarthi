import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = handle(async (req, ctx: any) => {
  const { id, versionId, stageId } = await ctx.params;
  const { shop } = await requireShop(req);
  const body = await readBody(req);
  
  const { processStageId, machineId, sequence, isRequired, instructions } = body;

  const version = await prisma.workflowVersion.findFirst({
    where: { 
      id: versionId,
      workflowId: id,
      workflow: { shopId: shop.id }
    }
  });

  if (!version) {
    return json({ error: 'Version not found.' }, 404);
  }
  
  if (version.status !== 'draft') {
    return json({ error: 'Cannot modify stages of a non-draft workflow version.' }, 400);
  }

  try {
    const updated = await prisma.workflowStage.update({
      where: { id: stageId, workflowVersionId: versionId },
      data: {
        ...(processStageId !== undefined && { processStageId }),
        ...(machineId !== undefined && { machineId }),
        ...(sequence !== undefined && { sequence }),
        ...(isRequired !== undefined && { isRequired }),
        ...(instructions !== undefined && { instructions }),
      },
      include: {
        processStage: true,
        machine: true
      }
    });

    return json(updated);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return json({ error: 'Stage not found.' }, 404);
    }
    if (error?.code === 'P2002') {
      return json({ error: 'A stage with this sequence already exists in the version.' }, 409);
    }
    throw error;
  }
});

export const DELETE = handle(async (req, ctx: any) => {
  const { id, versionId, stageId } = await ctx.params;
  const { shop } = await requireShop(req);

  const version = await prisma.workflowVersion.findFirst({
    where: { 
      id: versionId,
      workflowId: id,
      workflow: { shopId: shop.id }
    }
  });

  if (!version) {
    return json({ error: 'Version not found.' }, 404);
  }
  
  if (version.status !== 'draft') {
    return json({ error: 'Cannot modify stages of a non-draft workflow version.' }, 400);
  }

  try {
    await prisma.workflowStage.delete({
      where: { id: stageId, workflowVersionId: versionId },
    });

    return json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return json({ error: 'Stage not found.' }, 404);
    }
    throw error;
  }
});
