import { Router } from 'express';
import crypto from 'crypto';
import url from 'url';
import { config } from '../config.js';
import prisma from '../db.js';
import { authenticateUser, getCurrentUser, getCurrentShop } from '../middleware/auth.js';

const router = Router();

function _isTestMode() {
  return !config.payuKey || !config.payuSalt;
}

function _getPayuConfig() {
  if (!config.payuKey || !config.payuSalt) {
    const err = new Error('Payment gateway not configured');
    err.status = 503;
    throw err;
  }
  return { key: config.payuKey, salt: config.payuSalt };
}

function _requestHash(key, txnid, amount, productinfo, firstname, email, salt, udf1 = '', udf2 = '', udf3 = '', udf4 = '', udf5 = '', si = '') {
  const hashString = si
    ? `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${si}|${salt}`
    : `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${salt}`;
  return crypto.createHash('sha512').update(hashString).digest('hex');
}

function _responseHash(key, salt, status, txnid, amount, productinfo, firstname, email, udf1 = '', udf2 = '', udf3 = '', udf4 = '', udf5 = '') {
  const hashString = `${salt}|${status}||||||${udf5}|${udf4}|${udf3}|${udf2}|${udf1}|${email}|${firstname}|${productinfo}|${amount}|${txnid}|${key}`;
  return crypto.createHash('sha512').update(hashString).digest('hex');
}

function _refundHash(key, command, mihpayid, amount, salt) {
  const hashString = `${key}|${command}|${mihpayid}|${amount}|${salt}`;
  return crypto.createHash('sha512').update(hashString).digest('hex');
}

async function _initiateRefund(mihpayid, amount) {
  const { key, salt } = _getPayuConfig();
  const command = 'cancel_refund_transaction';
  const hash = _refundHash(key, command, mihpayid, amount, salt);

  const params = new url.URLSearchParams({
    key,
    command,
    hash,
    var1: mihpayid,
    var2: amount.toString(),
    var3: 'all',
    var4: '',
  });

  const response = await fetch(config.payuRefundUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  return response.json();
}

router.post('/create-order', async (req, res) => {
  try {
    const { plan, firstname, email, phone, trialDays } = req.body;

    if (!plan || !(plan in config.planAmounts)) {
      return res.status(400).json({ detail: 'Invalid plan' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const shop = await prisma.shop.findFirst({ where: { ownerId: user.uuid } });
      if (shop && shop.subscriptionStatus === 'active' && shop.subscriptionExpiry && new Date(shop.subscriptionExpiry) > new Date()) {
        return res.status(400).json({ detail: 'You already have an active subscription' });
      }
    }

    const txnid = `TXN_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const amount = config.planAmounts[plan];
    const productinfo = config.planLabels[plan];
    const name = firstname || user?.name || 'Customer';
    const userEmail = email || user?.email || 'customer@example.com';
    const userPhone = phone || user?.mobile || '';

    if (_isTestMode()) {
      return res.json({
        test_mode: true,
        key: config.payuKey,
        txnid,
        amount,
        productinfo,
        firstname: name,
        email: userEmail,
        phone: userPhone,
        plan,
        trialDays: trialDays || config.trialDays,
        trialInitAmount: config.trialInitAmount,
      });
    }

    const { key, salt } = _getPayuConfig();
    const udf1 = plan;
    const udf2 = (trialDays || config.trialDays).toString();

    const hash = _requestHash(key, txnid, amount.toString(), productinfo, name, userEmail, salt, udf1, udf2);

    return res.json({
      key,
      txnid,
      amount: amount.toString(),
      productinfo,
      firstname: name,
      email: userEmail,
      phone: userPhone,
      surl: `${config.backendUrl}/api/v1/payments/payu-success`,
      furl: `${config.backendUrl}/api/v1/payments/payu-failure`,
      hash,
      plan,
      trialDays: trialDays || config.trialDays,
      trialInitAmount: config.trialInitAmount,
      udf1,
      udf2,
      paymentUrl: config.payuUrl,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ detail: err.message });
    console.error('Create order error:', err);
    return res.status(500).json({ detail: 'Internal server error' });
  }
});

router.post('/payu-success', async (req, res) => {
  try {
    const payuData = req.body;
    const { key, salt } = _getPayuConfig();

    const expectedHash = _responseHash(
      key, salt,
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
      payuData.udf5 || ''
    );

    if (payuData.hash !== expectedHash) {
      console.error('Hash mismatch in PayU success callback');
      return res.redirect(`${config.landingUrl}/payment.html?error=hash_mismatch`);
    }

    if (payuData.status !== 'success') {
      return res.redirect(`${config.landingUrl}/payment.html?error=payment_${payuData.status}`);
    }

    const user = await prisma.user.findUnique({ where: { email: payuData.email } });
    if (user) {
      const plan = payuData.udf1 || 'shop';
      const trialDays = parseInt(payuData.udf2) || config.trialDays;
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + trialDays);

      await prisma.shop.updateMany({
        where: { ownerId: user.uuid },
        data: {
          subscriptionPlan: plan,
          subscriptionStatus: 'active',
          subscriptionExpiry: expiry,
        },
      });
    }

    return res.redirect(`${config.appUrl}/en/settings?payment_success=1`);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ detail: err.message });
    console.error('PayU success error:', err);
    return res.redirect(`${config.landingUrl}/payment.html?error=server_error`);
  }
});

router.post('/payu-failure', async (req, res) => {
  try {
    const payuData = req.body;
    const errorMsg = payuData.error_Message || payuData.unmappedstatus || 'payment_failed';
    return res.redirect(`${config.landingUrl}/payment.html?error=${encodeURIComponent(errorMsg)}`);
  } catch (err) {
    console.error('PayU failure error:', err);
    return res.redirect(`${config.landingUrl}/payment.html?error=unknown`);
  }
});

router.post('/refund', async (req, res) => {
  try {
    const { mihpayid, amount } = req.body;
    if (!mihpayid || !amount) {
      return res.status(400).json({ detail: 'mihpayid and amount are required' });
    }

    const result = await _initiateRefund(mihpayid, amount);
    return res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ detail: err.message });
    console.error('Refund error:', err);
    return res.status(500).json({ detail: 'Internal server error' });
  }
});

router.post('/activate-plan', authenticateUser, getCurrentUser, getCurrentShop, async (req, res) => {
  try {
    const { plan, txnid, trial_end } = req.body;
    const shop = req.shop;

    if (plan && !(plan in config.planAmounts)) {
      return res.status(400).json({ detail: 'Invalid plan' });
    }

    const expiry = trial_end ? new Date(trial_end) : new Date();
    if (!trial_end) {
      expiry.setDate(expiry.getDate() + config.trialDays);
    }

    await prisma.shop.update({
      where: { id: shop.id },
      data: {
        subscriptionPlan: plan || shop.subscriptionPlan,
        subscriptionStatus: 'active',
        subscriptionExpiry: expiry,
      },
    });

    return res.json({ detail: 'Plan activated successfully' });
  } catch (err) {
    console.error('Activate plan error:', err);
    return res.status(500).json({ detail: 'Internal server error' });
  }
});

router.post('/cancel-subscription', authenticateUser, getCurrentUser, getCurrentShop, async (req, res) => {
  try {
    const { reason } = req.body;
    const shop = req.shop;

    await prisma.shop.update({
      where: { id: shop.id },
      data: {
        subscriptionStatus: 'cancelled',
        subscriptionCancelledAt: new Date(),
        cancellationReason: reason || null,
      },
    });

    return res.json({ detail: 'Subscription cancelled successfully' });
  } catch (err) {
    console.error('Cancel subscription error:', err);
    return res.status(500).json({ detail: 'Internal server error' });
  }
});

export default router;
