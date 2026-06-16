import { config } from '@/lib/server/config';
import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  let referralCode = await prisma.referralCode.findUnique({ where: { userId: user.uuid! } });

  if (!referralCode) {
    const namePart = (user.name || user.email || 'user')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 5)
      .toUpperCase();
    const randomPart = Math.random().toString(36).slice(2, 7).toUpperCase();
    const code = `${namePart}${randomPart}`;

    referralCode = await prisma.referralCode.create({
      data: { userId: user.uuid, code, totalReferrals: 0, successfulReferrals: 0 },
    });
  }

  const referralLink = `${config.landingUrl}/signup?ref=${referralCode.code}`;

  return json({
    code: referralCode.code,
    totalReferrals: referralCode.totalReferrals,
    successfulReferrals: referralCode.successfulReferrals,
    referralLink,
  });
});
