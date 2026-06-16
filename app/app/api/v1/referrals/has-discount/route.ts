import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const referral = await prisma.referral.findFirst({
    where: { referredId: user.uuid!, discountApplied: true },
  });
  return json({ hasDiscount: !!referral });
});
