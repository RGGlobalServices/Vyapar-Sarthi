import prisma from '@/lib/server/prisma';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { requireShop } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const categories = await prisma.expenseCategory.findMany({
    where: { shopId: shop.id },
    orderBy: { name: 'asc' }
  });
  return json(categories);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const data = await readBody<{ name: string }>(req);
  
  if (!data.name) throw new ApiError(400, 'Name is required');

  const category = await prisma.expenseCategory.create({
    data: {
      shopId: shop.id,
      name: data.name,
      type: 'custom'
    }
  });

  return json(category, 201);
});
