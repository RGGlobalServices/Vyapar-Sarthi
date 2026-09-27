import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const url = new URL(req.url);
  const active = url.searchParams.get('active');
  const category = url.searchParams.get('category');
  const search = url.searchParams.get('search');

  const where: any = { shopId: shop.id };
  
  if (active !== null) {
    where.isActive = active === 'true';
  }
  
  if (category) {
    where.category = category;
  }
  
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
    ];
  }

  const stages = await prisma.processStage.findMany({
    where,
    orderBy: { name: 'asc' },
  });

  return json(stages);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody(req);
  const { code, name, description, category, isActive } = body;

  if (!code || !name) {
    return json({ error: 'Code and name are required.' }, 400);
  }

  try {
    const newStage = await prisma.processStage.create({
      data: {
        shopId: shop.id,
        code,
        name,
        description: description || null,
        category: category || null,
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    return json(newStage, 201);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return json({ error: 'A process stage with this code already exists.' }, 409);
    }
    throw error;
  }
});
