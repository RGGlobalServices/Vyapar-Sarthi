import prisma from '@/lib/server/prisma';
import { requireAdmin } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  await requireAdmin(req);
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });

  const uuids = users.map((u) => u.uuid).filter(Boolean) as string[];
  const [shops, referralCodes] = await Promise.all([
    prisma.shop.findMany({
      where: { ownerId: { in: uuids } },
      select: {
        id: true,
        name: true,
        ownerId: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        subscriptionExpiry: true,
        createdAt: true,
      },
    }),
    prisma.referralCode.findMany({
      where: { userId: { in: uuids } },
      select: { userId: true, code: true, totalReferrals: true },
    }),
  ]);

  const shopMap: Record<string, (typeof shops)[number]> = {};
  shops.forEach((s) => {
    if (s.ownerId) shopMap[s.ownerId] = s;
  });

  const rcMap: Record<string, (typeof referralCodes)[number]> = {};
  referralCodes.forEach((rc) => {
    if (rc.userId) rcMap[rc.userId] = rc;
  });

  return json(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.fullName || u.name || '',
      storeName: u.storeName || '',
      mobile: u.mobile || '',
      isActive: !!u.isActive,
      createdAt: u.createdAt,
      shop: (u.uuid && shopMap[u.uuid]) || null,
      referralCode: (u.uuid && rcMap[u.uuid]?.code) || null,
      referralCount: (u.uuid && rcMap[u.uuid]?.totalReferrals) || 0,
    })),
  );
});
