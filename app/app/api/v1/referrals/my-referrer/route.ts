import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const referral = await prisma.referral.findFirst({ where: { referredId: user.uuid! } });

  if (!referral) return json(null);

  const referrerUser = await prisma.user.findUnique({
    where: { uuid: referral.referrerId! },
    select: { id: true, name: true, email: true },
  });

  if (!referrerUser) return json(null);

  return json({
    id: referrerUser.id,
    name: referrerUser.name,
    email: referrerUser.email,
    referredAt: referral.createdAt,
  });
});
