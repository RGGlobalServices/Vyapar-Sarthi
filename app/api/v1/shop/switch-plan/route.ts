import { NextResponse } from 'next/server';
import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { packageTypeForPlan } from '@/lib/planGates';
import { MONTHLY_BASE_PRICES, type BillingCycle } from '@/lib/subscriptionPricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Switch the plan WITHOUT charging — only allowed while a free trial is still
// running. Keeps the remaining trial days/time; just changes which plan the
// user is trialing. Once the trial has ended, plan changes must go through PayU.
export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const { plan, cycle: cycleRaw } = await readBody(req);
  const cycle: BillingCycle = cycleRaw === 'yearly' ? 'yearly' : cycleRaw === '5_years' ? '5_years' : 'monthly';

  if (!plan || !(plan in MONTHLY_BASE_PRICES)) throw new ApiError(400, 'Invalid plan');

  const trialEnd = shop.subscriptionTrialEnds ?? shop.subscriptionExpiry;
  const trialActive =
    shop.subscriptionStatus === 'trial' && trialEnd && new Date(trialEnd) > new Date();

  if (!trialActive) {
    // Trial finished (or never started) — caller must pay via PayU.
    throw new ApiError(409, 'Trial has ended — payment required to change plan');
  }

  const updated = await prisma.shop.update({
    where: { id: shop.id },
    // Keep trial dates & status untouched — only remember the plan/cycle choice
    // so the eventual real charge (after trial ends) uses the right amount.
    data: { subscriptionPlan: plan, packageType: packageTypeForPlan(plan), billingCycle: cycle },
  });

  const body = {
    switched: true,
    plan: updated.subscriptionPlan,
    status: updated.subscriptionStatus,
    trialEnds: updated.subscriptionTrialEnds ?? updated.subscriptionExpiry,
  };

  // Set plan cookie so middleware allows app access after redirect from landing page
  const res = NextResponse.json(body);
  res.cookies.set('ks_plan', plan, { path: '/', maxAge: 60 * 60 * 24 * 7 });
  return res;
});
