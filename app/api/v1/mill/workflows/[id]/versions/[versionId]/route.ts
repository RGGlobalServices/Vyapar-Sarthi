import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req, ctx: any) => {
  const { id, versionId } = await ctx.params;
  const { shop } = await requireShop(req);

  const version = await prisma.workflowVersion.findFirst({
    where: { 
      id: versionId,
      workflowId: id,
      workflow: { shopId: shop.id }
    },
    include: {
      stages: {
        orderBy: { sequence: 'asc' },
        include: {
          processStage: true,
          machine: true
        }
      }
    }
  });

  if (!version) {
    return json({ error: 'Version not found.' }, 404);
  }

  return json(version);
});

export const PATCH = handle(async (req, ctx: any) => {
  const { id, versionId } = await ctx.params;
  const { shop } = await requireShop(req);
  const body = await readBody(req);
  
  const { status } = body;

  if (!['draft', 'active', 'archived'].includes(status)) {
    return json({ error: 'Invalid status.' }, 400);
  }

  const version = await prisma.workflowVersion.findFirst({
    where: { 
      id: versionId,
      workflowId: id,
      workflow: { shopId: shop.id }
    },
    include: {
      productionBatches: {
        take: 1
      }
    }
  });

  if (!version) {
    return json({ error: 'Version not found.' }, 404);
  }

  // If status is active, deactivate other active versions
  if (status === 'active') {
    await prisma.workflowVersion.updateMany({
      where: { workflowId: id, status: 'active', id: { not: versionId } },
      data: { status: 'archived' }
    });
  }

  const updated = await prisma.workflowVersion.update({
    where: { id: versionId },
    data: { status }
  });

  return json(updated);
});
