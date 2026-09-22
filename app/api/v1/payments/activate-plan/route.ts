import { NextResponse } from 'next/server';
import { config } from '@/lib/server/config';
import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, readBody, ApiError } from '@/lib/server/http';
import { packageTypeForPlan, getPlanLimits } from '@/lib/planGates';
import { MONTHLY_BASE_PRICES, type BillingCycle } from '@/lib/subscriptionPricing';
import { isSubscriptionEnded } from '@/lib/subscriptionAccess';
import { testActivationAllowed, activationExpiry } from '@/lib/server/planActivationGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// TEST-ONLY. This route activates a paid plan with no payment, so it is
// unreachable in production (and in any environment that hasn't explicitly
// opted in with ALLOW_TEST_PLAN_ACTIVATION=true). Real activations happen only
// in payments/payu-success, after PayU's signed callback has been verified.
//
// Even when enabled: the expiry is computed here (never from the client), and
// a shop whose subscription has already ended cannot use it to upgrade itself
// — requireShop() rejects it, and the explicit check below is a second guard.
export const POST = handle(async (req) => {
  if (!testActivationAllowed()) throw new ApiError(404, 'Not found');

  const { shop, user } = await requireShop(req);
  if (isSubscriptionEnded(shop)) throw new ApiError(403, 'Subscription expired');

  // `trial_end` in the body is deliberately ignored.
  const { plan, cycle: cycleRaw } = await readBody(req);
  const cycle: BillingCycle = cycleRaw === 'yearly' ? 'yearly' : cycleRaw === '5_years' ? '5_years' : 'monthly';

  if (plan && !(plan in MONTHLY_BASE_PRICES)) throw new ApiError(400, 'Invalid plan');

  const expiry = activationExpiry(cycle, config.billingCycleDays);
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
  }, { timeout: 15000, maxWait: 10000 });

  const res = NextResponse.json({ detail: 'Plan activated successfully for all shops (test mode)' });
  res.cookies.set('ks_plan', activatedPlan, { path: '/', maxAge: 60 * 60 * 24 * 7 });
  return res;
});
