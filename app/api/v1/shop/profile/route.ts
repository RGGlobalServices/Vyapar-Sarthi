import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { packageTypeForPlan } from '@/lib/planGates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);

  // Self-heal missing shop fields from owner User if available
  if (shop.ownerId && (!shop.mobile || !shop.businessType)) {
    const owner = await prisma.user.findFirst({ where: { uuid: shop.ownerId } });
    if (owner) {
      const updates: Record<string, unknown> = {};
      if (!shop.mobile && owner.mobile) updates.mobile = owner.mobile;
      if (!shop.businessType && owner.businessType) updates.businessType = owner.businessType;
      if (Object.keys(updates).length > 0) {
        await prisma.shop.update({
          where: { id: shop.id },
          data: updates,
        });
        Object.assign(shop, updates);
      }
    }
  }

  // Self-heal: packageType must always match subscriptionPlan.
  const expectedPackageType = packageTypeForPlan(shop.subscriptionPlan || 'shop');
  if (shop.packageType !== expectedPackageType) {
    const corrected = await prisma.shop.update({
      where: { id: shop.id },
      data: { packageType: expectedPackageType },
    });
    return json(corrected);
  }

  return json(shop);
});

export const PATCH = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody(req);

  if (body.business_type && !body.businessType) {
    body.businessType = body.business_type;
  }
  if (body.shop_name && !body.name) {
    body.name = body.shop_name;
  }
  if (body.shopName && !body.name) {
    body.name = body.shopName;
  }

  const allowedFields = ['name', 'address', 'mobile', 'businessType', 'packageType', 'logoUrl', 'setupComplete', 'gst', 'pan'];
  const data: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) data[field] = body[field];
  }

  if (Object.keys(data).length === 0) throw new ApiError(400, 'No valid fields provided');

  // 1. Update Shop
  const updatedShop = await prisma.shop.update({ where: { id: shop.id }, data });

  // 2. Synchronize changes to owner User record to keep User and Shop in sync
  const userUpdates: Record<string, unknown> = {};
  if (data.name !== undefined) userUpdates.storeName = data.name;
  if (data.mobile !== undefined) userUpdates.mobile = data.mobile;
  if (data.businessType !== undefined) userUpdates.businessType = data.businessType;

  if (Object.keys(userUpdates).length > 0 && shop.ownerId) {
    await prisma.user.updateMany({
      where: { uuid: shop.ownerId },
      data: userUpdates,
    });
  }

  return json(updatedShop);
});

export const POST = handle(async (req) => {
  // Dummy endpoint to prevent 405 Method Not Allowed when frontend switchShop calls api.post('/shop/profile')
  // The actual shop switching is stateless and handled via the x-shop-id header on subsequent requests.
  return json({ success: true });
});
