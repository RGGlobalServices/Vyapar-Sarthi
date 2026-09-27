import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req, ctx: any) => {
  const { id, versionId } = await ctx.params;
  const { shop } = await requireShop(req);
  const body = await readBody(req);
  
  const { processStageId, machineId, sequence, isRequired, instructions } = body;

  if (!processStageId || sequence === undefined) {
    return json({ error: 'Process stage and sequence are required.' }, 400);
  }

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
    const newStage = await prisma.workflowStage.create({
      data: {
        workflowVersionId: versionId,
        processStageId,
        machineId: machineId || null,
        sequence,
        isRequired: isRequired !== undefined ? isRequired : true,
        instructions: instructions || null,
      },
      include: {
        processStage: true,
        machine: true
      }
    });

    return json(newStage, 201);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return json({ error: 'A stage with this sequence already exists in the version.' }, 409);
    }
    throw error;
  }
});
