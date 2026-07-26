import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { ensureShopCode } from '@/lib/server/shopCode';
import { handle, json } from '@/lib/server/http';
import { getPlanLimits, canUseMultiShop } from '@/lib/planGates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /shop/my-shops — list all shops owned by this user, plus whether they
// are allowed to add another (admin override, or the plan's shop cap).
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

  const primaryPlan = shops[0]?.subscriptionPlan || 'shop';
  const planLimits = getPlanLimits(primaryPlan);
  const maxShops = user.maxShops ?? planLimits.maxShops;
  const canAdd = user.canAddShop !== false && shops.length < maxShops;

  return json({
    shops,
    shopLimit: {
      canAdd,
      max: Number.isFinite(maxShops) ? maxShops : null,
      current: shops.length,
      multiShop: canUseMultiShop(primaryPlan),
    },
  });
});
