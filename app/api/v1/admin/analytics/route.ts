import prisma from '@/lib/server/prisma';
import { requireAdmin } from '@/lib/server/auth';
import { handle, json, query } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  await requireAdmin(req);
  const { period } = query(req);

  const totalUsers = await prisma.user.count();
  const activeUsers = await prisma.user.count({ where: { isActive: 1 } });
  const totalShops = await prisma.shop.count();

  const planStats = await prisma.shop.groupBy({ by: ['subscriptionPlan'], _count: { id: true } });
  const statusStats = await prisma.shop.groupBy({ by: ['subscriptionStatus'], _count: { id: true } });

  const totalReferrals = await prisma.referral.count();
  const completedReferrals = await prisma.referral.count({ where: { status: 'completed' } });

  // Real revenue from actual payments: successful charges minus refunds —
  // this used to be a count of rewarded referrals mislabeled as money.
  const [grossRevenue, refunds] = await Promise.all([
    prisma.paymentTransaction.aggregate({ where: { status: 'success' }, _sum: { amount: true } }),
    prisma.paymentTransaction.aggregate({ where: { type: 'refund' }, _sum: { amount: true } }),
  ]);
  const totalRevenue = (grossRevenue._sum.amount || 0) - (refunds._sum.amount || 0);

  let dateFilter: { gte?: Date } = {};
  if (period === 'daily') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dateFilter = { gte: today };
  } else if (period === 'monthly') {
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    firstOfMonth.setHours(0, 0, 0, 0);
    dateFilter = { gte: firstOfMonth };
  } else if (period === 'yearly') {
    const firstOfYear = new Date(new Date().getFullYear(), 0, 1);
    dateFilter = { gte: firstOfYear };
  }

  const newUsers = Object.keys(dateFilter).length
    ? await prisma.user.count({ where: { createdAt: dateFilter } })
    : totalUsers;

  const newReferrals = Object.keys(dateFilter).length
    ? await prisma.referral.count({ where: { createdAt: dateFilter } })
    : totalReferrals;

  return json({
    totalUsers,
    activeUsers,
    blockedUsers: totalUsers - activeUsers,
    totalShops,
    newUsers,
    planStats: planStats.reduce((acc, p) => ({ ...acc, [p.subscriptionPlan as string]: p._count.id }), {}),
    statusStats: statusStats.reduce((acc, s) => ({ ...acc, [s.subscriptionStatus as string]: s._count.id }), {}),
    totalReferrals,
    completedReferrals,
    newReferrals,
    totalRevenue,
  });
});
