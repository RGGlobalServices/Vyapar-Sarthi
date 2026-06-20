import prisma from './prisma';
import { config } from './config';
import { generateRenewalToken } from './renewalLinks';
import { sendWhatsApp } from './whatsapp';
import { sendRenewalEmail } from './email';

export type ProcessResult = {
  remindersSent: number;
  expired: number;
  details: Array<{ shopId: string; action: string }>;
};

const PLAN_LABEL: Record<string, string> = {
  shop: 'Dukaan', vyapar: 'Vyapar', wholesale: 'Udyog', starter: 'Starter',
};

// Days-before-expiry at which we nudge the user to renew.
const REMINDER_DAYS = [3, 1, 0];

function daysUntil(date: Date): number {
  const ms = new Date(date).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

// Manual-renewal subscription processor (no auto-debit). For each shop it:
//  • sends an in-app renewal reminder when expiry is near (3 / 1 / 0 days)
//  • marks the subscription `expired` once expiry has passed
export async function processDueSubscriptions(): Promise<ProcessResult> {
  const result: ProcessResult = { remindersSent: 0, expired: 0, details: [] };
  const now = new Date();

  // Upcoming renewals (still in trial or active) within the reminder horizon.
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + Math.max(...REMINDER_DAYS) + 1);

  const upcoming = await prisma.shop.findMany({
    where: {
      subscriptionStatus: { in: ['trial', 'active'] },
      subscriptionExpiry: { lte: horizon },
    },
  });

  for (const shop of upcoming) {
    if (!shop.subscriptionExpiry || !shop.ownerId) continue;
    const remaining = daysUntil(shop.subscriptionExpiry);

    // Already past due → expire it.
    if (remaining < 0) {
      await prisma.shop.update({
        where: { id: shop.id },
        data: { subscriptionStatus: 'expired' },
      });
      result.expired += 1;
      result.details.push({ shopId: shop.id, action: 'expired' });
      // Notify once that access is now limited.
      await maybeNotify(shop.ownerId, 'expired',
        'Subscription expired',
        'Your plan has ended. Renew now to restore full access — your data is safe.',
      );
      continue;
    }

    // Within a reminder window → send a renewal nudge (deduped per ~day).
    if (REMINDER_DAYS.includes(remaining)) {
      const isTrial = shop.subscriptionStatus === 'trial';
      const planName = PLAN_LABEL[shop.subscriptionPlan || 'shop'] || 'your plan';
      const when = remaining === 0 ? 'today' : `in ${remaining} day${remaining === 1 ? '' : 's'}`;
      const sent = await maybeNotify(
        shop.ownerId,
        'renewal',
        isTrial ? `Free trial ends ${when}` : `Subscription renews ${when}`,
        isTrial
          ? `Your free trial ends ${when}. Subscribe to ${planName} to keep using all features.`
          : `Your ${planName} plan expires ${when}. Renew to avoid interruption.`,
      );
      if (sent) {
        result.remindersSent += 1;
        result.details.push({ shopId: shop.id, action: `reminder_${remaining}d` });

        // Send outbound WhatsApp + email with a one-click renewal link.
        await sendRenewalOutbound(shop.ownerId, shop.id, shop.subscriptionPlan || 'shop', planName, remaining).catch(
          (err) => console.error('[BILLING] Outbound renewal send error:', err),
        );
      }
    }
  }

  return result;
}

// Fetch the shop owner's contact details then fire WhatsApp + email renewal links.
// Errors are caught by the caller — never let them block the main cron loop.
async function sendRenewalOutbound(
  ownerId: string,
  shopId: string,
  plan: string,
  planName: string,
  daysLeft: number,
) {
  const owner = await prisma.user.findFirst({ where: { uuid: ownerId } });
  if (!owner) return;

  const amount = config.planAmounts[plan] ?? config.planAmounts['shop'];
  const token = generateRenewalToken(shopId, plan, amount);
  const renewalUrl = `${config.appUrl}/api/v1/payments/renewal-pay?token=${token}`;
  const name = owner.name || 'there';
  const when = daysLeft === 0 ? 'aaj' : `${daysLeft} din mein`;

  if (owner.mobile) {
    const body =
      `Namasthe ${name}! 🙏\n\n` +
      `Aapki *Vyapar Sarthi* subscription *${when}* expire ho rahi hai.\n\n` +
      `Ek click mein renew karein aur apna data safe rakhein:\n${renewalUrl}\n\n` +
      `_Link 72 ghante valid hai._`;
    await sendWhatsApp({ to: owner.mobile, body });
  }

  if (owner.email) {
    await sendRenewalEmail({ to: owner.email, name, planName, daysLeft, renewalUrl });
  }
}

// Create an in-app notification unless an identical-type one was already sent in
// the last 20 hours (keeps a daily cron idempotent).
async function maybeNotify(
  userId: string,
  type: 'renewal' | 'expired',
  title: string,
  message: string,
): Promise<boolean> {
  const since = new Date(Date.now() - 20 * 60 * 60 * 1000);
  const existing = await prisma.userNotification.findFirst({
    where: {
      userId,
      notificationType: `subscription_${type}`,
      createdAt: { gte: since },
    },
  });
  if (existing) return false;

  await prisma.userNotification.create({
    data: {
      userId,
      title,
      message,
      notificationType: `subscription_${type}`,
      isRead: false,
      link: '/billing',
    },
  });
  return true;
}
