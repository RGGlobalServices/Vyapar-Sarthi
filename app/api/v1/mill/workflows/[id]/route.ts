import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req, ctx: any) => {
  const { id } = await ctx.params;
  const { shop } = await requireShop(req);

  const workflow = await prisma.workflow.findFirst({
    where: { id, shopId: shop.id },
    include: {
      product: {
        select: { id: true, name: true }
      },
      versions: {
        orderBy: { versionNumber: 'desc' }
      }
    }
  });

  if (!workflow) {
    return json({ error: 'Workflow not found.' }, 404);
  }

  return json(workflow);
});

export const PATCH = handle(async (req, ctx: any) => {
  const { id } = await ctx.params;
  const { shop } = await requireShop(req);
  const body = await readBody(req);
  
  const { name, description, isActive } = body;

  try {
    const updated = await prisma.workflow.update({
      where: { id, shopId: shop.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return json(updated);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return json({ error: 'Workflow not found.' }, 404);
    }
    throw error;
  }
});
