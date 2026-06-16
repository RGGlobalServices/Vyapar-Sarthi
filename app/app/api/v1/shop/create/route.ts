import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { uniqueShopCode } from '@/lib/server/shopCode';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /shop/create — create an additional shop for this user
export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const { name, address, mobile, businessType } = await readBody(req);
  if (!name?.trim()) throw new ApiError(400, 'Shop name is required');

  // Copy subscription plan from primary shop
  const primaryShop = await prisma.shop.findFirst({ where: { ownerId: user.uuid! } });
  const subscriptionPlan = primaryShop?.subscriptionPlan || 'starter';

  const shopCode = await uniqueShopCode(name.trim());

  const shop = await prisma.shop.create({
    data: {
      ownerId: user.uuid,
      name: name.trim(),
      address: address?.trim() || null,
      mobile: mobile?.trim() || null,
      businessType: businessType || primaryShop?.businessType || 'kirana',
      subscriptionPlan,
      subscriptionStatus: primaryShop?.subscriptionStatus || 'active',
      setupComplete: false,
    },
  });

  // Assign shopCode via raw SQL (safe before prisma generate runs)
  try {
    await prisma.$executeRaw`UPDATE shops SET shop_code = ${shopCode} WHERE id = ${shop.id}::uuid`;
    shop.shopCode = shopCode;
  } catch {
    /* column not yet migrated — code assigned after SQL migration */
  }

  return json(shop);
});
