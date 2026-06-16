import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req, { enforceSubscription: false });
  const logs = await prisma.stockLog.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { products: { select: { name: true } } },
  });
  return json(logs);
});
