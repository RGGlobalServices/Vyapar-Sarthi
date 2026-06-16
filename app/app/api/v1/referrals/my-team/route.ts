import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const referrals = await prisma.referral.findMany({
    where: { referrerId: user.uuid! },
    orderBy: { createdAt: 'desc' },
  });

  const enriched = [];
  for (const ref of referrals) {
    let referredUser = null;
    if (ref.referredId) {
      referredUser = await prisma.user.findUnique({
        where: { uuid: ref.referredId },
        select: { id: true, name: true, email: true, createdAt: true },
      });
    }
    enriched.push({ ...ref, referred: referredUser });
  }

  return json({ team: enriched });
});
