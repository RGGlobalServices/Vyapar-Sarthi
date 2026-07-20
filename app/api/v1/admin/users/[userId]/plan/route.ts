import prisma from '@/lib/server/prisma';
import { requireAdmin } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { packageTypeForPlan, getPlanLimits } from '@/lib/planGates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ userId: string }> };

export const PATCH = handle<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const userId = parseInt((await params).userId);
  const { plan, status, expiryDays, trialAction, days, date } = await readBody(req);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, 'User not found');

  const shops = await prisma.shop.findMany({ where: { ownerId: user.uuid! } });
  if (shops.length === 0) throw new ApiError(404, 'No shops found for this user');

  // Compute the max expiry across all shops so extending adds to the best remaining time
  let maxExpiry = Date.now();
  let maxTrialEnds = Date.now();
  for (const s of shops) {
    if (s.subscriptionExpiry && s.subscriptionExpiry.getTime() > maxExpiry) {
      maxExpiry = s.subscriptionExpiry.getTime();
    }
    if (s.subscriptionTrialEnds && s.subscriptionTrialEnds.getTime() > maxTrialEnds) {
      maxTrialEnds = s.subscriptionTrialEnds.getTime();
    }
  }

  const shop = shops[0];
  const updateData: Record<string, unknown> = {};

  if (plan) {
    updateData.subscriptionPlan = plan;
    updateData.packageType = packageTypeForPlan(plan);
  }
  if (status) updateData.subscriptionStatus = status;
  
  if (expiryDays !== undefined) {
    updateData.subscriptionExpiry = new Date(maxExpiry + expiryDays * 86400000);
  }

  // Trial modifications
  if (trialAction === 'pause') {
    if (shop.subscriptionStatus === 'trial' && !shop.trialPaused) {
      updateData.trialPaused = true;
      updateData.trialPauseStart = new Date();
    }
  } else if (trialAction === 'resume') {
    if (shop.subscriptionStatus === 'trial' && shop.trialPaused && shop.trialPauseStart) {
      const pausedMs = Date.now() - new Date(shop.trialPauseStart).getTime();
      updateData.subscriptionTrialEnds = new Date(maxTrialEnds + pausedMs);
      updateData.subscriptionExpiry = new Date(maxExpiry + pausedMs);
      updateData.trialPaused = false;
      updateData.trialPauseStart = null;
    }
  } else if (trialAction === 'increase') {
    if (days) {
      updateData.subscriptionTrialEnds = new Date(maxTrialEnds + days * 86400000);
      updateData.subscriptionExpiry = new Date(maxExpiry + days * 86400000);
    } else if (date) {
      updateData.subscriptionTrialEnds = new Date(date);
      updateData.subscriptionExpiry = new Date(date);
    }
  } else if (trialAction === 'reduce') {
    if (days) {
      updateData.subscriptionTrialEnds = new Date(maxTrialEnds - days * 86400000);
      updateData.subscriptionExpiry = new Date(maxExpiry - days * 86400000);
    } else if (date) {
      updateData.subscriptionTrialEnds = new Date(date);
      updateData.subscriptionExpiry = new Date(date);
    }
  }

  await prisma.$transaction(async (tx) => {
    // 1. Apply to ALL shops
    await tx.shop.updateMany({
      where: { ownerId: user.uuid! },
      data: updateData
    });

    // 2. Update user's maxShops based on the new plan limits
    if (plan) {
      const limits = getPlanLimits(plan);
      await tx.user.update({
        where: { id: user.id },
        data: { maxShops: limits.maxShops === Infinity ? null : limits.maxShops }
      });
    }
  });

  return json({ detail: 'Subscription and package limits updated for all user accounts' });
});
