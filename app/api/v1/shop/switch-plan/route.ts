import { NextResponse } from 'next/server';
import { config } from '@/lib/server/config';
import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { packageTypeForPlan } from '@/lib/planGates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Switch the plan WITHOUT charging — only allowed while a free trial is still
// running. Keeps the remaining trial days/time; just changes which plan the
// user is trialing. Once the trial has ended, plan changes must go through PayU.
export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const { plan } = await readBody(req);

  if (!plan || !(plan in config.planAmounts)) throw new ApiError(400, 'Invalid plan');

  const trialEnd = shop.subscriptionTrialEnds ?? shop.subscriptionExpiry;
  const trialActive =
    shop.subscriptionStatus === 'trial' && trialEnd && new Date(trialEnd) > new Date();

  if (!trialActive) {
    // Trial finished (or never started) — caller must pay via PayU.
    throw new ApiError(409, 'Trial has ended — payment required to change plan');
  }

  const updated = await prisma.shop.update({
    where: { id: shop.id },
    data: { subscriptionPlan: plan, packageType: packageTypeForPlan(plan) }, // keep trial dates & status untouched
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
