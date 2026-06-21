import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { ensureShopCode } from '@/lib/server/shopCode';
import { handle, json } from '@/lib/server/http';

import { getBestSubscription } from '@/lib/server/auth';

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

  const bestShop = getBestSubscription(shops);
  if (bestShop) {
    for (const shop of shops) {
      shop.subscriptionPlan = bestShop.subscriptionPlan;
      shop.subscriptionStatus = bestShop.subscriptionStatus;
      shop.subscriptionExpiry = bestShop.subscriptionExpiry;
      shop.subscriptionTrialEnds = bestShop.subscriptionTrialEnds;
      shop.trialPaused = bestShop.trialPaused;
      shop.trialPauseStart = bestShop.trialPauseStart;
    }
  }

  return json(shops);
});
