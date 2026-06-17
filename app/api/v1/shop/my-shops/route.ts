import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { ensureShopCode } from '@/lib/server/shopCode';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /shop/my-shops — list all shops owned by this user
export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const shops = await prisma.shop.findMany({
    where: { ownerId: user.uuid! },
    orderBy: { createdAt: 'asc' },
  });

  // Back-fill shop codes for shops that don't have one yet
  for (const shop of shops) {
    if (!shop.shopCode) {
      shop.shopCode = await ensureShopCode(shop.id, shop.name);
    }
  }

  return json(shops);
});
