import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { config } from '@/lib/server/config';
import prisma from '@/lib/server/prisma';
import { getPayuConfig, responseHash } from '@/lib/server/payu';
import { readForm } from '@/lib/server/http';
import { packageTypeForPlan, getPlanLimits } from '@/lib/planGates';
import { MONTHLY_BASE_PRICES, getBaseAmount, getGstAmount, getTotalAmount, type BillingCycle } from '@/lib/subscriptionPricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Money is compared in rupees with one paisa of slack for float formatting.
const AMOUNT_TOLERANCE = 0.01;

function hashesMatch(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  try {
    const payuData = await readForm(req);
    const { key, salt } = getPayuConfig();

    const expectedHash = responseHash(
      key,
      salt,
      payuData.status,
      payuData.txnid,
      payuData.amount,
      payuData.productinfo,
      payuData.firstname,
      payuData.email,
      payuData.udf1 || '',
      payuData.udf2 || '',
      payuData.udf3 || '',
      payuData.udf4 || '',
      payuData.udf5 || '',
    );

    // Nothing below runs unless PayU's signed response verifies. plan (udf1),
    // user (udf2) and cycle (udf3) are part of that signed string, so from here
    // on they are verified data, not client input.
    if (!hashesMatch(String(payuData.hash || ''), expectedHash)) {
      console.error('Hash mismatch in PayU success callback');
      return NextResponse.redirect(`${config.appUrl}/en/payment?error=hash_mismatch`, 303);
    }

    // Only echo a plan back into a redirect URL if it is a real one.
    const rawPlan = String(payuData.udf1 || 'shop');
    const plan = rawPlan in MONTHLY_BASE_PRICES ? rawPlan : null;

    if (payuData.status !== 'success') {
      return NextResponse.redirect(
        `${config.appUrl}/en/payment?plan=${plan || 'shop'}&error=payment_${encodeURIComponent(String(payuData.status || 'failed'))}`,
        303,
      );
    }

    if (!plan) {
      console.error('[PAYU] Verified callback carried an unknown plan; not activating. txnid=', payuData.txnid);
      return NextResponse.redirect(`${config.appUrl}/en/payment?error=invalid_plan`, 303);
    }

    const txnid = String(payuData.txnid || '');
    if (!txnid) {
      console.error('[PAYU] Verified callback had no txnid; not activating.');
      return NextResponse.redirect(`${config.appUrl}/en/payment?plan=${plan}&error=invalid_transaction`, 303);
    }

    const cycle: BillingCycle = payuData.udf3 === 'yearly' ? 'yearly' : payuData.udf3 === '5_years' ? '5_years' : 'monthly';

    // The price is computed here from the verified plan + cycle. The posted
    // amount is only what the customer actually paid — it must cover the price.
    const expectedAmount = getTotalAmount(plan, cycle);
    const paidAmount = parseFloat(payuData.amount);
    if (!isFinite(paidAmount) || paidAmount + AMOUNT_TOLERANCE < expectedAmount) {
      console.error(
        `[PAYU] Underpayment rejected: txnid=${txnid} plan=${plan} cycle=${cycle} paid=${payuData.amount} expected=${expectedAmount}`,
      );
      return NextResponse.redirect(`${config.appUrl}/en/payment?plan=${plan}&error=amount_mismatch`, 303);
    }

    let user = null;
    if (payuData.udf2) {
      user = await prisma.user.findUnique({ where: { uuid: payuData.udf2 } });
    }
    if (!user) {
      user = await prisma.user.findUnique({ where: { email: payuData.email } });
    }

    let alreadyProcessed = false;

    if (user) {
      const baseAmount = getBaseAmount(plan, cycle);
      const gstAmount = getGstAmount(baseAmount);

      // One billing cycle from the payment date: 30 days (monthly) or 1 year (yearly).
      const expiry = new Date();
      if (cycle === 'yearly') {
        expiry.setFullYear(expiry.getFullYear() + 1);
      } else if (cycle === '5_years') {
        expiry.setFullYear(expiry.getFullYear() + 5);
      } else {
        expiry.setDate(expiry.getDate() + config.billingCycleDays);
      }

      const shops = await prisma.shop.findMany({ where: { ownerId: user.uuid! } });
      if (shops.length > 0) {
        // Use the first shop for recording the payment transaction
        const mainShop = shops[0];

        alreadyProcessed = await prisma.$transaction(async (tx) => {
          // Serialise concurrent callbacks for the same txnid (PayU retries, or a
          // replayed POST) so the "already processed?" check below cannot race.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${txnid}))`;

          const existing = await tx.paymentTransaction.findFirst({ where: { txnid, status: 'success' } });
          if (existing) return true;

          await tx.shop.updateMany({
            where: { ownerId: user!.uuid! },
            data: {
              subscriptionPlan: plan,
              packageType: packageTypeForPlan(plan),
              subscriptionStatus: 'active',
              subscriptionExpiry: expiry,
              nextBillingDate: expiry,
              billingAmount: paidAmount,
              billingCycle: cycle,
              lastTxnId: txnid,
              firstChargeDate: mainShop.firstChargeDate ?? new Date(),
              subscriptionCancelledAt: null,
              cancellationReason: null,
            },
          });

          const limits = getPlanLimits(plan);
          await tx.user.update({
            where: { id: user!.id },
            data: { maxShops: limits.maxShops === Infinity ? null : limits.maxShops }
          });

          await tx.paymentTransaction.create({
            data: {
              shopId: mainShop.id,
              userId: user!.uuid,
              txnid,
              mihpayid: payuData.mihpayid || null,
              plan,
              amount: paidAmount,
              billingCycle: cycle,
              baseAmount,
              gstAmount,
              type: 'subscription',
              status: 'success',
              mode: payuData.mode || null,
              payuResponse: JSON.stringify(payuData).slice(0, 5000),
            },
          });
          return false;
        }, { timeout: 20000, maxWait: 10000 });
      } else {
        console.error(`[PAYU] Verified payment ${txnid} but user ${user.uuid} owns no shop; nothing activated.`);
      }
    } else {
      console.error(`[PAYU] Verified payment ${txnid} but no matching user was found; nothing activated.`);
    }

    const redirectUrl = `${config.appUrl}/en?payment_success=1&plan=${plan}${alreadyProcessed ? '&already_processed=1' : ''}`;
    const res = NextResponse.redirect(redirectUrl, 303);
    // Set plan cookie so middleware allows app access immediately
    res.cookies.set('ks_plan', plan, { path: '/', maxAge: 60 * 60 * 24 * 7 });
    return res;
  } catch (err) {
    console.error('PayU success error:', err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${config.appUrl}/en/payment?error=server_error`, 303);
  }
}
