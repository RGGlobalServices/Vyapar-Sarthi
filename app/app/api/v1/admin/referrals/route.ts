import prisma from '@/lib/server/prisma';
import { requireAdmin } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  await requireAdmin(req);
  const referrals = await prisma.referral.findMany({ orderBy: { createdAt: 'desc' } });

  const uuids = [
    ...new Set(referrals.flatMap((r) => [r.referrerId, r.referredId].filter(Boolean) as string[])),
  ];
  const users = uuids.length ? await prisma.user.findMany({ where: { uuid: { in: uuids } } }) : [];
  const userMap: Record<string, (typeof users)[number]> = {};
  users.forEach((u) => {
    if (u.uuid) userMap[u.uuid] = u;
  });

  return json(
    referrals.map((r) => ({
      id: r.id,
      referralCode: r.referralCode,
      status: r.status,
      discountApplied: r.discountApplied,
      referrerRewarded: r.referrerRewarded,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
      referrer: r.referrerId && userMap[r.referrerId]
        ? {
            id: userMap[r.referrerId].id,
            name: userMap[r.referrerId].fullName || userMap[r.referrerId].name || '',
            email: userMap[r.referrerId].email,
          }
        : null,
      referred: r.referredId && userMap[r.referredId]
        ? {
            id: userMap[r.referredId].id,
            name: userMap[r.referredId].fullName || userMap[r.referredId].name || '',
            email: userMap[r.referredId].email,
          }
        : { email: r.referredEmail },
    })),
  );
});
