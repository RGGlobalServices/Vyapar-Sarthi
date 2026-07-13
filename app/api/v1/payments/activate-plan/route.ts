import { NextResponse } from 'next/server';
import { config } from '@/lib/server/config';
import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { packageTypeForPlan } from '@/lib/planGates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const { plan, trial_end } = await readBody(req);

  if (plan && !(plan in config.planAmounts)) throw new ApiError(400, 'Invalid plan');

  const expiry = trial_end ? new Date(trial_end) : new Date();
  if (!trial_end) expiry.setDate(expiry.getDate() + config.trialDays);

  const activatedPlan = plan || shop.subscriptionPlan || 'shop';

  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      subscriptionPlan: activatedPlan,
      packageType: packageTypeForPlan(activatedPlan),
      subscriptionStatus: 'active',
      subscriptionExpiry: expiry,
    },
  });

  // Set plan cookie so middleware allows app access
  const res = NextResponse.json({ detail: 'Plan activated successfully' });
  res.cookies.set('ks_plan', activatedPlan, { path: '/', maxAge: 60 * 60 * 24 * 7 });
  return res;
});
