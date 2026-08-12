import prisma from '@/lib/server/prisma';
import { requireShopScope } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shopIds, allShopAccess, ownedShops } = await requireShopScope(req, { enforceSubscription: false });
  const logs = await prisma.stockLog.findMany({
    where: { shopId: { in: shopIds } },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { products: { select: { name: true } } },
  });
  if (!allShopAccess) return json(logs);
  const shopNameById = new Map(ownedShops.map(s => [s.id, s.name]));
  return json(logs.map(l => ({ ...l, shopName: l.shopId ? shopNameById.get(l.shopId) : undefined })));
});
