import { config } from '@/lib/server/config';
import prisma from '@/lib/server/prisma';
import { isTestMode, getPayuConfig, requestHash } from '@/lib/server/payu';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// One-time PayU payment for a monthly subscription (manual renewal model — PayU
// auto-debit/SI is not available on this account). Charges the full plan amount;
// payu-success then activates the plan for one billing cycle (30 days).
export const POST = handle(async (req) => {
  const { plan, firstname, email, phone } = await readBody(req);

  if (!plan || !(plan in config.planAmounts)) throw new ApiError(400, 'Invalid plan');

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
  const amount = config.planAmounts[plan];
  const productinfo = config.planLabels[plan];
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
    });
  }

  const { key, salt } = getPayuConfig();
  const udf1 = plan;
  const udf2 = user?.uuid || '';

  const hash = requestHash(key, txnid, amount.toString(), productinfo, name, userEmail, salt, udf1, udf2);

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
    udf1,
    udf2,
    paymentUrl: config.payuUrl,
  });
});
