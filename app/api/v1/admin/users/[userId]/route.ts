import prisma from '@/lib/server/prisma';
import { requireAdmin } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ userId: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const userId = parseInt((await params).userId, 10);
  if (!Number.isFinite(userId)) throw new ApiError(400, 'Invalid user id');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, 'User not found');

  // Users with incomplete data (no uuid — e.g. legacy/test accounts) have no
  // shop or referrals. Skip the uuid-keyed lookups so we never pass null into a
  // non-nullable uuid filter, which would throw a Prisma validation error.
  const uuid = user.uuid;
  const [shop, referralCode, supportTicketCount, referralsGivenRaw, referralsReceivedRaw] = uuid
    ? await Promise.all([
        prisma.shop.findFirst({
          where: { ownerId: uuid },
          include: {
            products: { select: { id: true, name: true, currentStock: true, minStock: true } },
            customers: { select: { id: true, name: true, mobile: true, totalDue: true } },
          },
        }),
        prisma.referralCode.findFirst({ where: { userId: uuid } }),
        prisma.supportTicket.count({ where: { userId: uuid } }),
        prisma.referral.findMany({ where: { referrerId: uuid } }),
        prisma.referral.findMany({ where: { referredId: uuid } }),
      ])
    : [null, null, 0, [] as Awaited<ReturnType<typeof prisma.referral.findMany>>, [] as Awaited<ReturnType<typeof prisma.referral.findMany>>];

  // Map referred users for referralsGiven
  const referredUuids = referralsGivenRaw.map(r => r.referredId).filter(Boolean) as string[];
  const referredUsers = referredUuids.length > 0 
    ? await prisma.user.findMany({
        where: { uuid: { in: referredUuids } },
        select: { uuid: true, email: true, name: true, fullName: true },
      })
    : [];
  const referredUserMap = new Map(referredUsers.map(u => [u.uuid, u]));

  const referralsGiven = referralsGivenRaw.map(r => {
    const refUser = r.referredId ? referredUserMap.get(r.referredId) : null;
    return {
      id: r.id,
      status: r.status,
      referred: refUser ? {
        email: refUser.email,
        name: refUser.fullName || refUser.name || '',
      } : {
        email: r.referredEmail || '',
        name: 'Pending Register',
      }
    };
  });

  // Map referrer users for referralsReceived
  const referrerUuids = referralsReceivedRaw.map(r => r.referrerId).filter(Boolean) as string[];
  const referrerUsers = referrerUuids.length > 0 
    ? await prisma.user.findMany({
        where: { uuid: { in: referrerUuids } },
        select: { uuid: true, email: true, name: true, fullName: true },
      })
    : [];
  const referrerUserMap = new Map(referrerUsers.map(u => [u.uuid, u]));

  const referralsReceived = referralsReceivedRaw.map(r => {
    const refUser = referrerUserMap.get(r.referrerId);
    return {
      id: r.id,
      referrer: refUser ? {
        email: refUser.email,
        name: refUser.fullName || refUser.name || '',
      } : {
        email: '',
        name: 'Unknown User',
      }
    };
  });

  return json({
    id: user.id,
    email: user.email,
    name: user.fullName || user.name || '',
    storeName: user.storeName || '',
    mobile: user.mobile || '',
    businessType: user.businessType || '',
    isActive: !!user.isActive,
    createdAt: user.createdAt,
    shop: shop || null,
    referralCode: referralCode || null,
    referralsGiven,
    referralsReceived,
    ticketCount: supportTicketCount,
  });
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const admin = await requireAdmin(req);
  if (admin.role !== 'superadmin') throw new ApiError(403, 'Only superadmin can delete users');

  const userId = parseInt((await params).userId, 10);
  if (!Number.isFinite(userId)) throw new ApiError(400, 'Invalid user id');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, 'User not found');

  // No uuid → no related data; just remove the user record.
  if (!user.uuid) {
    await prisma.user.delete({ where: { id: userId } });
    return json({ detail: 'User deleted successfully' });
  }
  const uuid = user.uuid;

  await prisma.$transaction([
    prisma.saleItem.deleteMany({ where: { sale: { shop: { ownerId: uuid } } } }),
    prisma.stockLog.deleteMany({ where: { shop: { ownerId: uuid } } }),
    prisma.sale.deleteMany({ where: { shop: { ownerId: uuid } } }),
    prisma.product.deleteMany({ where: { shop: { ownerId: uuid } } }),
    prisma.customer.deleteMany({ where: { shop: { ownerId: uuid } } }),
    prisma.dukandarRelationship.deleteMany({
      where: { OR: [{ wholesalerId: uuid }, { retailerId: uuid }] },
    }),
    prisma.referral.deleteMany({ where: { OR: [{ referrerId: uuid }, { referredId: uuid }] } }),
    prisma.referralCode.deleteMany({ where: { userId: uuid } }),
    prisma.userNotification.deleteMany({ where: { userId: uuid } }),
    prisma.pushSubscription.deleteMany({ where: { userId: uuid } }),
    prisma.notificationSetting.deleteMany({ where: { userId: uuid } }),
    prisma.supportTicket.deleteMany({ where: { userId: uuid } }),
    prisma.shop.deleteMany({ where: { ownerId: uuid } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  return json({ detail: 'User and all related data deleted successfully' });
});
