import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const { accessCode } = await readBody(req);
  if (!accessCode) throw new ApiError(400, 'Access code is required');

  // Run shop + referral code lookups in parallel
  const [shop, refCode] = await Promise.all([
    prisma.shop.findFirst({ where: { ownerId: user.uuid! } }),
    prisma.referralCode.findUnique({ where: { code: accessCode } }),
  ]);

  if (!shop || shop.subscriptionPlan !== 'wholesale') {
    throw new ApiError(403, 'Business plan required to add dukandar');
  }
  if (!refCode) throw new ApiError(404, 'Invalid access code');

  const retailer = await prisma.user.findUnique({ where: { uuid: refCode.userId! } });
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
