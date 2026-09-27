import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);

  const products = await prisma.product.findMany({
    where: { shopId: shop.id },
    select: {
      id: true,
      name: true,
      sku: true,
      baseUnit: true,
      currentStock: true,
      sellingPrice: true,
      mrp: true,
      category: true,
    },
    orderBy: { name: 'asc' },
  });

  return json(products);
});
