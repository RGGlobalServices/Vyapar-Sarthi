import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, query, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  await requireUser(req);
  const { code } = query(req);
  if (!code) throw new ApiError(400, 'Referral code is required');

  const referrerCode = await prisma.referralCode.findUnique({ where: { code } });
  if (!referrerCode) throw new ApiError(404, 'Invalid referral code');

  // ReferralCode has no Prisma relation to User — fetch the owner by uuid.
  const owner = await prisma.user.findUnique({
    where: { uuid: referrerCode.userId },
    select: { id: true, name: true, email: true, storeName: true },
  });
  if (!owner) throw new ApiError(404, 'Invalid referral code');

  return json({
    referrerName: owner.name || owner.email,
    storeName: owner.storeName || '',
    code: referrerCode.code,
  });
});
