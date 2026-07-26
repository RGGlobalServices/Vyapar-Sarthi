import { NextResponse } from 'next/server';
import { config } from '@/lib/server/config';
import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { packageTypeForPlan, getPlanLimits } from '@/lib/planGates';
import { MONTHLY_BASE_PRICES, type BillingCycle } from '@/lib/subscriptionPricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const { shop, user } = await requireShop(req);
  const { plan, trial_end, cycle: cycleRaw } = await readBody(req);
  const cycle: BillingCycle = cycleRaw === 'yearly' ? 'yearly' : 'monthly';

  if (plan && !(plan in MONTHLY_BASE_PRICES)) throw new ApiError(400, 'Invalid plan');

  const expiry = trial_end ? new Date(trial_end) : new Date();
  if (!trial_end) expiry.setDate(expiry.getDate() + config.trialDays);

  const activatedPlan = plan || shop.subscriptionPlan || 'shop';

  await prisma.$transaction(async (tx) => {
    await tx.shop.updateMany({
      where: { ownerId: user.uuid! },
      data: {
        subscriptionPlan: activatedPlan,
        packageType: packageTypeForPlan(activatedPlan),
        subscriptionStatus: 'active',
        subscriptionExpiry: expiry,
        billingCycle: cycle,
      },
    });

    const limits = getPlanLimits(activatedPlan);
    await tx.user.update({
      where: { id: user.id },
      data: { maxShops: limits.maxShops === Infinity ? null : limits.maxShops }
    });
  });

  // Set plan cookie so middleware allows app access
  const res = NextResponse.json({ detail: 'Plan activated successfully for all shops' });
  res.cookies.set('ks_plan', activatedPlan, { path: '/', maxAge: 60 * 60 * 24 * 7 });
  return res;
});
