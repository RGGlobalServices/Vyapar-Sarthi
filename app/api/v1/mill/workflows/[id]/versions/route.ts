import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req, ctx: any) => {
  const { id } = await ctx.params;
  const { shop } = await requireShop(req);

  const versions = await prisma.workflowVersion.findMany({
    where: { workflowId: id, workflow: { shopId: shop.id } },
    include: {
      stages: {
        orderBy: { sequence: 'asc' },
        include: {
          processStage: true,
          machine: true
        }
      }
    },
    orderBy: { versionNumber: 'desc' }
  });

  return json(versions);
});

export const POST = handle(async (req, ctx: any) => {
  const { id } = await ctx.params;
  const { shop } = await requireShop(req);

  const workflow = await prisma.workflow.findFirst({
    where: { id, shopId: shop.id },
  });

  if (!workflow) {
    return json({ error: 'Workflow not found.' }, 404);
  }

  // Get next version number
  const latestVersion = await prisma.workflowVersion.findFirst({
    where: { workflowId: id },
    orderBy: { versionNumber: 'desc' }
  });

  const nextVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

  const newVersion = await prisma.workflowVersion.create({
    data: {
      workflowId: id,
      versionNumber: nextVersionNumber,
      status: 'draft',
    },
    include: {
      stages: true
    }
  });

  return json(newVersion, 201);
});
