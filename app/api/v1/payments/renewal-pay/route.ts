import { config } from '@/lib/server/config';
import prisma from '@/lib/server/prisma';
import { isTestMode, getPayuConfig, requestHash } from '@/lib/server/payu';
import { verifyRenewalToken } from '@/lib/server/renewalLinks';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/payments/renewal-pay?token=<signed>
// Public endpoint — accessed from WhatsApp/email renewal links.
// Validates the HMAC token, builds a PayU payment form, and auto-submits it.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || '';

  let payload: { shopId: string; plan: string; amount: number };
  try {
    payload = verifyRenewalToken(token);
  } catch {
    return new NextResponse(errorPage('This renewal link has expired or is invalid. Please open the app to renew your subscription.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const { shopId, plan, amount } = payload;

  // Verify the shop still needs renewal (not already active).
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });

  if (!shop) {
    return new NextResponse(errorPage('Shop not found.'), {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  if (
    shop.subscriptionStatus === 'active' &&
    shop.subscriptionExpiry &&
    new Date(shop.subscriptionExpiry) > new Date()
  ) {
    return NextResponse.redirect(`${config.appUrl}/en?already_active=1`);
  }

  const owner = shop.ownerId
    ? await prisma.user.findFirst({ where: { uuid: shop.ownerId } })
    : null;
  const firstname = owner?.name || 'Customer';
  const email = owner?.email || '';
  const phone = owner?.mobile || '';

  const txnid = `TXN_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const productinfo = config.planLabels[plan] || `${plan} Plan`;
  const udf1 = plan;

  if (isTestMode()) {
    return NextResponse.redirect(`${config.appUrl}/payment?plan=${plan}&test_renew=1`);
  }

  const { key, salt } = getPayuConfig();
  const hash = requestHash(key, txnid, amount.toString(), productinfo, firstname, email, salt, udf1);

  const fields: Record<string, string> = {
    key,
    txnid,
    amount: amount.toString(),
    productinfo,
    firstname,
    email,
    phone,
    surl: `${config.appUrl}/api/v1/payments/payu-success`,
    furl: `${config.appUrl}/api/v1/payments/payu-failure`,
    hash,
    udf1,
  };

  const inputs = Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${escapeHtml(v)}">`)
    .join('\n    ');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Redirecting to Payment — Vyapar Sarthi</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .box { text-align: center; padding: 32px; }
    .spinner { width: 48px; height: 48px; border: 4px solid #1e293b;
               border-top-color: #10b981; border-radius: 50%;
               animation: spin 0.8s linear infinite; margin: 0 auto 24px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    p { color: #94a3b8; font-size: 15px; }
  </style>
</head>
<body>
  <div class="box">
    <div class="spinner"></div>
    <p>Redirecting to payment gateway…</p>
  </div>
  <form id="pf" method="POST" action="${config.payuUrl}">
    ${inputs}
  </form>
  <script>document.getElementById('pf').submit();</script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Link Expired — Vyapar Sarthi</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .box { text-align: center; padding: 32px; max-width: 380px; }
    h2 { color: #f87171; margin-bottom: 12px; }
    p { color: #94a3b8; font-size: 15px; margin-bottom: 24px; }
    a { display: inline-block; padding: 12px 28px; background: #10b981;
        color: #fff; border-radius: 10px; text-decoration: none; font-weight: bold; }
  </style>
</head>
<body>
  <div class="box">
    <h2>Link Expired</h2>
    <p>${escapeHtml(message)}</p>
    <a href="${config.appUrl}/payment">Renew Now</a>
  </div>
</body>
</html>`;
}
