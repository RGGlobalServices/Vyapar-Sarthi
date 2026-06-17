import prisma from '@/lib/server/prisma';
import { config } from '@/lib/server/config';
import { requireUser } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const { referralCode } = await readBody(req);

  if (!referralCode) throw new ApiError(400, 'Referral code is required');

  const existingReferral = await prisma.referral.findFirst({ where: { referredId: user.uuid! } });
  if (existingReferral) throw new ApiError(400, 'You have already applied a referral code');

  const referrerCode = await prisma.referralCode.findUnique({ where: { code: referralCode } });

  if (!referrerCode) throw new ApiError(404, 'Invalid referral code');
  if (referrerCode.userId === user.uuid) throw new ApiError(400, 'You cannot use your own referral code');

  const referral = await prisma.referral.create({
    data: {
      referrerId: referrerCode.userId,
      referredId: user.uuid,
      referredEmail: user.email,
      referralCode,
      status: 'completed',
      discountApplied: true,
    },
  });

  await prisma.referralCode.update({
    where: { userId: referrerCode.userId },
    data: { totalReferrals: { increment: 1 }, successfulReferrals: { increment: 1 } },
  });

  // Reward the referred user: extend their free trial from 7 → 14 days.
  // Anchored to shop creation so it's exactly 14 days of trial regardless of
  // when the code is applied (only while still in trial).
  const referredShop = await prisma.shop.findFirst({ where: { ownerId: user.uuid! } });
  if (referredShop && referredShop.subscriptionStatus === 'trial') {
    const base = referredShop.createdAt ? new Date(referredShop.createdAt) : new Date();
    const extendedEnds = new Date(base);
    extendedEnds.setDate(extendedEnds.getDate() + config.trialDaysReferral);
    // Never shorten an existing trial.
    const current = referredShop.subscriptionTrialEnds ? new Date(referredShop.subscriptionTrialEnds) : base;
    const newEnds = extendedEnds > current ? extendedEnds : current;
    await prisma.shop.update({
      where: { id: referredShop.id },
      data: { subscriptionTrialEnds: newEnds, subscriptionExpiry: newEnds },
    });
  }

  const referrerShop = await prisma.shop.findFirst({ where: { ownerId: referrerCode.userId } });

  if (referrerShop && referrerShop.subscriptionStatus === 'active') {
    const newExpiry = referrerShop.subscriptionExpiry
      ? new Date(referrerShop.subscriptionExpiry)
      : new Date();
    newExpiry.setDate(newExpiry.getDate() + 30);

    await prisma.shop.update({ where: { id: referrerShop.id }, data: { subscriptionExpiry: newExpiry } });
    await prisma.referral.update({ where: { id: referral.id }, data: { referrerRewarded: true } });
  }

  return json({ detail: 'Referral code applied successfully' });
});
