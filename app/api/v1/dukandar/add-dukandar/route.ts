import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const { retailerEmail } = await readBody(req);
  if (!retailerEmail) throw new ApiError(400, 'Retailer email is required');

  // Run shop + retailer lookups in parallel
  const [shop, retailer] = await Promise.all([
    prisma.shop.findFirst({ where: { ownerId: user.uuid! } }),
    prisma.user.findUnique({ where: { email: retailerEmail } }),
  ]);

  if (!shop || shop.subscriptionPlan !== 'wholesale') {
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
