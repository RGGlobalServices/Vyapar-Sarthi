import { NextResponse } from 'next/server';
import { config } from '@/lib/server/config';
import prisma from '@/lib/server/prisma';
import { getPayuConfig, responseHash } from '@/lib/server/payu';
import { readForm } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    if (payuData.hash !== expectedHash) {
      console.error('Hash mismatch in PayU success callback');
      return NextResponse.redirect(`${config.appUrl}/en/payment?error=hash_mismatch`, 303);
    }

    if (payuData.status !== 'success') {
      return NextResponse.redirect(
        `${config.appUrl}/en/payment?plan=${payuData.udf1 || 'shop'}&error=payment_${payuData.status}`,
        303,
      );
    }

    const user = await prisma.user.findUnique({ where: { email: payuData.email } });
    if (user) {
      const plan = payuData.udf1 || 'shop';
      const planAmount = parseFloat(payuData.amount) || config.planAmounts[plan] || 0;

      // One billing cycle (30 days) from the payment date.
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + config.billingCycleDays);

      const shop = await prisma.shop.findFirst({ where: { ownerId: user.uuid! } });
      if (shop) {
        await prisma.shop.update({
          where: { id: shop.id },
          data: {
            subscriptionPlan: plan,
            subscriptionStatus: 'active',
            subscriptionExpiry: expiry,
            nextBillingDate: expiry,
            billingAmount: planAmount,
            lastTxnId: payuData.txnid,
            // Record the first paid charge once, for the money-back window.
            firstChargeDate: shop.firstChargeDate ?? new Date(),
            subscriptionCancelledAt: null,
            cancellationReason: null,
          },
        });

        await prisma.paymentTransaction.create({
          data: {
            shopId: shop.id,
            userId: user.uuid,
            txnid: payuData.txnid,
            mihpayid: payuData.mihpayid || null,
            plan,
            amount: planAmount,
            type: 'subscription',
            status: 'success',
            mode: payuData.mode || null,
            payuResponse: JSON.stringify(payuData).slice(0, 5000),
          },
        });
      }
    }

    const successPlan = payuData.udf1 || 'shop';
    const redirectUrl = `${config.appUrl}/en?payment_success=1&plan=${successPlan}`;
    const res = NextResponse.redirect(redirectUrl, 303);
    // Set plan cookie so middleware allows app access immediately
    res.cookies.set('ks_plan', successPlan, { path: '/', maxAge: 60 * 60 * 24 * 7 });
    return res;
  } catch (err) {
    console.error('PayU success error:', err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${config.appUrl}/en/payment?error=server_error`, 303);
  }
}
