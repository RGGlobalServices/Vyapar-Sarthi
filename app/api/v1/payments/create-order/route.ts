import { config } from '@/lib/server/config';
import prisma from '@/lib/server/prisma';
import { isTestMode, getPayuConfig, requestHash } from '@/lib/server/payu';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { MONTHLY_BASE_PRICES, getTotalAmount, getPlanLabel, type BillingCycle } from '@/lib/subscriptionPricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// One-time PayU payment for a subscription (manual renewal model — PayU
// auto-debit/SI is not available on this account). Charges the full plan
// amount (base + GST) for the chosen cycle; payu-success then activates the
// plan for one billing cycle (30 days for monthly, 1 year for yearly).
export const POST = handle(async (req) => {
  const { plan, firstname, email, phone, cycle: cycleRaw } = await readBody(req);
  const cycle: BillingCycle = cycleRaw === 'yearly' ? 'yearly' : cycleRaw === '5_years' ? '5_years' : 'monthly';

  if (!plan || !(plan in MONTHLY_BASE_PRICES)) throw new ApiError(400, 'Invalid plan');

  const user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    const shop = await prisma.shop.findFirst({ where: { ownerId: user.uuid! } });
    if (
      shop &&
      shop.subscriptionStatus === 'active' &&
      shop.subscriptionExpiry &&
      new Date(shop.subscriptionExpiry) > new Date()
    ) {
      throw new ApiError(400, 'You already have an active subscription');
    }
  }

  const txnid = `TXN_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const amount = getTotalAmount(plan, cycle);
  const productinfo = getPlanLabel(plan, cycle);
  const name = firstname || user?.name || 'Customer';
  const userEmail = email || user?.email || 'customer@example.com';
  const userPhone = phone || user?.mobile || '';

  if (isTestMode()) {
    return json({
      test_mode: true,
      key: config.payuKey,
      txnid,
      amount,
      productinfo,
      firstname: name,
      email: userEmail,
      phone: userPhone,
      plan,
      cycle,
    });
  }

  const { key, salt } = getPayuConfig();
  const udf1 = plan;
  const udf2 = user?.uuid || '';
  const udf3 = cycle;

  const hash = requestHash(key, txnid, amount.toString(), productinfo, name, userEmail, salt, udf1, udf2, udf3);

  return json({
    key,
    txnid,
    amount: amount.toString(),
    productinfo,
    firstname: name,
    email: userEmail,
    phone: userPhone,
    surl: `${config.appUrl}/api/v1/payments/payu-success`,
    furl: `${config.appUrl}/api/v1/payments/payu-failure`,
    hash,
    plan,
    cycle,
    udf1,
    udf2,
    udf3,
    paymentUrl: config.payuUrl,
  });
});
