import { Router } from 'express';
import { authenticateUser, getCurrentUser } from '../middleware/auth.js';
import prisma from '../db.js';
import { config } from '../config.js';

const router = Router();

router.use(authenticateUser, getCurrentUser);

router.get('/my-code', async (req, res) => {
  try {
    const user = req.user;
    let referralCode = await prisma.referralCode.findUnique({ where: { userId: user.uuid } });

    if (!referralCode) {
      const namePart = (user.name || user.email || 'user').replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase();
      const randomPart = Math.random().toString(36).slice(2, 7).toUpperCase();
      const code = `${namePart}${randomPart}`;

      referralCode = await prisma.referralCode.create({
        data: { userId: user.uuid, code, totalReferrals: 0, successfulReferrals: 0 },
      });
    }

    const referralLink = `${config.landingUrl}/signup?ref=${referralCode.code}`;

    return res.json({
      code: referralCode.code,
      totalReferrals: referralCode.totalReferrals,
      successfulReferrals: referralCode.successfulReferrals,
      referralLink,
    });
  } catch (err) {
    console.error('Get my code error:', err);
    return res.status(500).json({ detail: 'Internal server error' });
  }
});

router.post('/apply', async (req, res) => {
  try {
    const user = req.user;
    const { referralCode } = req.body;

    if (!referralCode) {
      return res.status(400).json({ detail: 'Referral code is required' });
    }

    const existingReferral = await prisma.referral.findFirst({
      where: { referredId: user.uuid },
    });

    if (existingReferral) {
      return res.status(400).json({ detail: 'You have already applied a referral code' });
    }

    const referrerCode = await prisma.referralCode.findUnique({
      where: { code: referralCode },
      include: { user: true },
    });

    if (!referrerCode) {
      return res.status(404).json({ detail: 'Invalid referral code' });
    }

    if (referrerCode.userId === user.uuid) {
      return res.status(400).json({ detail: 'You cannot use your own referral code' });
    }

    const referral = await prisma.referral.create({
      data: {
        referrerId: referrerCode.userId,
        referredId: user.uuid,
        referredEmail: user.email,
        referralCode,
        status: 'completed',
        discountApplied: true,
      },
    });

    await prisma.referralCode.update({
      where: { id: referrerCode.id },
      data: {
        totalReferrals: { increment: 1 },
        successfulReferrals: { increment: 1 },
      },
    });

    const referrerShop = await prisma.shop.findFirst({
      where: { ownerId: referrerCode.userId },
    });

    if (referrerShop && referrerShop.subscriptionStatus === 'active') {
      const newExpiry = referrerShop.subscriptionExpiry ? new Date(referrerShop.subscriptionExpiry) : new Date();
      newExpiry.setDate(newExpiry.getDate() + 30);

      await prisma.shop.update({
        where: { id: referrerShop.id },
        data: { subscriptionExpiry: newExpiry },
      });

      await prisma.referral.update({
        where: { id: referral.id },
        data: { referrerRewarded: true },
      });
    }

    return res.json({ detail: 'Referral code applied successfully' });
  } catch (err) {
    console.error('Apply referral error:', err);
    return res.status(500).json({ detail: 'Internal server error' });
  }
});

router.get('/my-team', async (req, res) => {
  try {
    const user = req.user;
    const referrals = await prisma.referral.findMany({
      where: { referrerId: user.uuid },
      orderBy: { createdAt: 'desc' },
    });

    const enriched = [];
    for (const ref of referrals) {
      let referredUser = null;
      if (ref.referredId) {
        referredUser = await prisma.user.findUnique({
          where: { uuid: ref.referredId },
          select: { id: true, name: true, email: true, createdAt: true },
        });
      }
      enriched.push({ ...ref, referred: referredUser });
    }

    return res.json({ team: enriched });
  } catch (err) {
    console.error('Get my team error:', err);
    return res.status(500).json({ detail: 'Internal server error' });
  }
});

router.get('/my-referrer', async (req, res) => {
  try {
    const user = req.user;
    const referral = await prisma.referral.findFirst({
      where: { referredId: user.uuid },
    });

    if (!referral) {
      return res.json(null);
    }

    const referrerUser = await prisma.user.findUnique({
      where: { uuid: referral.referrerId },
      select: { id: true, name: true, email: true },
    });

    if (!referrerUser) {
      return res.json(null);
    }

    return res.json({
      id: referrerUser.id,
      name: referrerUser.name,
      email: referrerUser.email,
      referredAt: referral.createdAt,
    });
  } catch (err) {
    console.error('Get my referrer error:', err);
    return res.status(500).json({ detail: 'Internal server error' });
  }
});

router.get('/referrer-info', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ detail: 'Referral code is required' });
    }

    const referrerCode = await prisma.referralCode.findUnique({
      where: { code },
      include: {
        user: {
          select: { id: true, name: true, email: true, storeName: true },
        },
      },
    });

    if (!referrerCode) {
      return res.status(404).json({ detail: 'Invalid referral code' });
    }

    return res.json({
      referrerName: referrerCode.user.name || referrerCode.user.email,
      storeName: referrerCode.user.storeName || '',
      code: referrerCode.code,
    });
  } catch (err) {
    console.error('Get referrer info error:', err);
    return res.status(500).json({ detail: 'Internal server error' });
  }
});

router.get('/has-discount', async (req, res) => {
  try {
    const user = req.user;
    const referral = await prisma.referral.findFirst({
      where: { referredId: user.uuid, discountApplied: true },
    });

    return res.json({ hasDiscount: !!referral });
  } catch (err) {
    console.error('Has discount error:', err);
    return res.status(500).json({ detail: 'Internal server error' });
  }
});

export default router;
