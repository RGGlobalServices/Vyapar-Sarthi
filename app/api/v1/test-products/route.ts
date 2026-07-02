import prisma from '@/lib/server/prisma';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const shop = await prisma.shop.findFirst();
  if (!shop) return json({ error: 'No shop' }, 404);
  const products = await prisma.product.findMany({ where: { shopId: shop.id } });
  return json(products);
});
