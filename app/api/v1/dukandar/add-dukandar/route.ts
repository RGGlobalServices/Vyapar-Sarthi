import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { isWholesaleTierPackage } from '@/lib/config/packageConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  // Active shop (x-shop-id) — was shop.findFirst({ownerId}), i.e. always the
  // owner's FIRST shop regardless of which one they were working in.
  const { user, shop } = await requireShop(req, { enforceSubscription: false });
  const { retailerEmail } = await readBody(req);
  if (!retailerEmail) throw new ApiError(400, 'Retailer email is required');

  const retailer = await prisma.user.findUnique({ where: { email: retailerEmail } });

  if (!isWholesaleTierPackage(shop.subscriptionPlan)) {
    throw new ApiError(403, 'Business plan required to add dukandar');
  }
  if (!retailer) throw new ApiError(404, 'Retailer not found');
  if (retailer.uuid === user.uuid) throw new ApiError(400, 'Cannot add yourself as dukandar');

  const existing = await prisma.dukandarRelationship.findFirst({
    where: { wholesalerId: user.uuid, retailerId: retailer.uuid! },
  });
  if (existing) throw new ApiError(409, 'Dukandar relationship already exists');

  await prisma.dukandarRelationship.create({
    data: { wholesalerId: user.uuid, retailerId: retailer.uuid!, status: 'active' },
  });

  return json({ detail: 'Dukandar added successfully' });
});
