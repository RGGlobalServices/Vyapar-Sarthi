import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = handle(async (req, ctx: any) => {
  const { id } = await ctx.params;
  const { shop } = await requireShop(req);
  const body = await readBody(req);
  
  const { name, description, category, isActive } = body;

  try {
    const updated = await prisma.processStage.update({
      where: { id, shopId: shop.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(category !== undefined && { category }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return json(updated);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return json({ error: 'Process stage not found.' }, 404);
    }
    throw error;
  }
});
