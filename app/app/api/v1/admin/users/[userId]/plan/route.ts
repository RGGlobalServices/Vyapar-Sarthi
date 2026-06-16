import prisma from '@/lib/server/prisma';
import { requireAdmin } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ userId: string }> };

export const PATCH = handle<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const userId = parseInt((await params).userId);
  const { plan, status, expiryDays, trialAction, days, date } = await readBody(req);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, 'User not found');

  const shop = await prisma.shop.findFirst({ where: { ownerId: user.uuid! } });
  if (!shop) throw new ApiError(404, 'Shop not found for this user');

  const updateData: Record<string, unknown> = {};
  if (plan) updateData.subscriptionPlan = plan;
  if (status) updateData.subscriptionStatus = status;
  if (expiryDays !== undefined) {
    updateData.subscriptionExpiry = new Date(Date.now() + expiryDays * 86400000);
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
      const currentEnds = shop.subscriptionTrialEnds ? new Date(shop.subscriptionTrialEnds) : new Date();
      const currentExpiry = shop.subscriptionExpiry ? new Date(shop.subscriptionExpiry) : new Date();
      
      updateData.subscriptionTrialEnds = new Date(currentEnds.getTime() + pausedMs);
      updateData.subscriptionExpiry = new Date(currentExpiry.getTime() + pausedMs);
      updateData.trialPaused = false;
      updateData.trialPauseStart = null;
    }
  } else if (trialAction === 'increase') {
    if (days) {
      const currentEnds = shop.subscriptionTrialEnds ? new Date(shop.subscriptionTrialEnds) : new Date();
      const currentExpiry = shop.subscriptionExpiry ? new Date(shop.subscriptionExpiry) : new Date();
      updateData.subscriptionTrialEnds = new Date(currentEnds.getTime() + days * 86400000);
      updateData.subscriptionExpiry = new Date(currentExpiry.getTime() + days * 86400000);
    } else if (date) {
      updateData.subscriptionTrialEnds = new Date(date);
      updateData.subscriptionExpiry = new Date(date);
    }
  } else if (trialAction === 'reduce') {
    if (days) {
      const currentEnds = shop.subscriptionTrialEnds ? new Date(shop.subscriptionTrialEnds) : new Date();
      const currentExpiry = shop.subscriptionExpiry ? new Date(shop.subscriptionExpiry) : new Date();
      updateData.subscriptionTrialEnds = new Date(currentEnds.getTime() - days * 86400000);
      updateData.subscriptionExpiry = new Date(currentExpiry.getTime() - days * 86400000);
    } else if (date) {
      updateData.subscriptionTrialEnds = new Date(date);
      updateData.subscriptionExpiry = new Date(date);
    }
  }

  await prisma.shop.update({ where: { id: shop.id }, data: updateData });
  return json({ detail: 'Subscription updated successfully' });
});
