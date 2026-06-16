import prisma from '@/lib/server/prisma';
import { config } from '@/lib/server/config';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody } from '@/lib/server/http';
import { isTestMode, initiateRefund } from '@/lib/server/payu';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const { reason } = await readBody(req);

  // ── 30-day money-back guarantee ──────────────────────────────────────────
  // If the most recent paid charge was within the money-back window, refund it.
  let refunded = false;
  let refundAmount = 0;
  if (shop.firstChargeDate) {
    const daysSinceFirstCharge =
      (Date.now() - new Date(shop.firstChargeDate).getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceFirstCharge <= config.moneyBackDays) {
      const lastPayment = await prisma.paymentTransaction.findFirst({
        where: { shopId: shop.id, type: 'subscription', status: 'success' },
        orderBy: { createdAt: 'desc' },
      });
      if (lastPayment && lastPayment.amount > 0) {
        if (lastPayment.mihpayid && !isTestMode()) {
          try {
            await initiateRefund(lastPayment.mihpayid, lastPayment.amount);
            refunded = true;
            refundAmount = lastPayment.amount;
          } catch (e) {
            console.error('Money-back refund failed (non-fatal):', e instanceof Error ? e.message : e);
          }
        } else if (isTestMode()) {
          refunded = true;
          refundAmount = lastPayment.amount;
        }
        if (refunded) {
          await prisma.paymentTransaction.create({
            data: {
              shopId: shop.id, userId: shop.ownerId, txnid: `RFND_${Date.now()}`,
              mihpayid: lastPayment.mihpayid, plan: shop.subscriptionPlan,
              amount: lastPayment.amount, type: 'refund', status: 'success',
            },
          });
        }
      }
    }
  }

  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      subscriptionStatus: 'cancelled',
      subscriptionCancelledAt: new Date(),
      cancellationReason: reason || null,
      nextBillingDate: null,
    },
  });

  return json({
    detail: refunded
      ? `Subscription cancelled. ₹${refundAmount} refunded under our ${config.moneyBackDays}-day money-back guarantee.`
      : 'Subscription cancelled successfully.',
    refunded,
    refundAmount,
  });
});
