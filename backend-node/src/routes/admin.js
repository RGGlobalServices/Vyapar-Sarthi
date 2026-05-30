import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../db.js';
import { config } from '../config.js';
import { authenticateAdmin, getAdminUser } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ detail: 'Email and password required' });

    const admin = await prisma.adminUser.findUnique({ where: { email } });
    if (!admin) return res.status(401).json({ detail: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, admin.hashedPassword);
    if (!valid) return res.status(401).json({ detail: 'Invalid credentials' });

    if (!admin.isActive) return res.status(403).json({ detail: 'Account is inactive' });

    const accessToken = jwt.sign({ sub: admin.id }, config.jwtSecret, {
      algorithm: 'HS256',
      expiresIn: config.jwtExpiresIn,
    });

    res.json({
      access_token: accessToken,
      token_type: 'bearer',
      admin: { id: admin.id, email: admin.email, name: admin.fullName, role: admin.role },
    });
  } catch (err) {
    res.status(500).json({ detail: 'Error during login' });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName, secretKey } = req.body;
    if (!email || !password || !fullName || !secretKey) {
      return res.status(400).json({ detail: 'All fields required (email, password, fullName, secretKey)' });
    }
    if (secretKey !== config.adminSecretKey) {
      return res.status(403).json({ detail: 'Invalid secret key' });
    }

    const existing = await prisma.adminUser.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ detail: 'Admin with this email already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = await prisma.adminUser.create({
      data: { email, hashedPassword, fullName, isActive: 1, role: 'superadmin' },
    });

    res.status(201).json({ id: admin.id, email: admin.email, fullName: admin.fullName, role: admin.role });
  } catch (err) {
    res.status(500).json({ detail: 'Error registering admin' });
  }
});

router.get('/me', authenticateAdmin, getAdminUser, async (req, res) => {
  res.json({ id: req.admin.id, email: req.admin.email, name: req.admin.fullName, role: req.admin.role, isActive: req.admin.isActive, createdAt: req.admin.createdAt });
});

router.get('/users', authenticateAdmin, getAdminUser, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const uuids = users.map((u) => u.uuid).filter(Boolean);
    const [shops, referralCodes] = await Promise.all([
      prisma.shop.findMany({
        where: { ownerId: { in: uuids } },
        select: { id: true, name: true, ownerId: true, subscriptionPlan: true, subscriptionStatus: true, subscriptionExpiry: true, createdAt: true },
      }),
      prisma.referralCode.findMany({
        where: { userId: { in: uuids } },
        select: { userId: true, code: true, totalReferrals: true },
      }),
    ]);

    const shopMap = {};
    shops.forEach((s) => { shopMap[s.ownerId] = s; });

    const rcMap = {};
    referralCodes.forEach((rc) => { rcMap[rc.userId] = rc; });

    res.json(
      users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.fullName || u.name || '',
        storeName: u.storeName || '',
        mobile: u.mobile || '',
        isActive: !!u.isActive,
        createdAt: u.createdAt,
        shop: shopMap[u.uuid] || null,
        referralCode: rcMap[u.uuid]?.code || null,
        referralCount: rcMap[u.uuid]?.totalReferrals || 0,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ detail: 'Error fetching users' });
  }
});

router.get('/users/:userId', authenticateAdmin, getAdminUser, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return res.status(404).json({ detail: 'User not found' });

    const [shop, referralCode, supportTicketCount] = await Promise.all([
      prisma.shop.findFirst({
        where: { ownerId: user.uuid },
        include: {
          products: { select: { id: true, name: true, currentStock: true, minStock: true } },
          customers: { select: { id: true, name: true, mobile: true, totalDue: true } },
        },
      }),
      prisma.referralCode.findFirst({ where: { userId: user.uuid } }),
      prisma.supportTicket.count({ where: { userId: user.uuid } }),
    ]);

    res.json({
      id: user.id,
      email: user.email,
      name: user.fullName || user.name || '',
      storeName: user.storeName || '',
      mobile: user.mobile || '',
      businessType: user.businessType || '',
      isActive: !!user.isActive,
      createdAt: user.createdAt,
      shop: shop || null,
      referralCode: referralCode || null,
      referralsGiven: [],
      referralsReceived: [],
      ticketCount: supportTicketCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ detail: 'Error fetching user' });
  }
});

router.patch('/users/:userId/status', authenticateAdmin, getAdminUser, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') return res.status(400).json({ detail: 'isActive boolean required' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ detail: 'User not found' });

    await prisma.user.update({ where: { id: userId }, data: { isActive: isActive ? 1 : 0 } });
    res.json({ detail: `User ${isActive ? 'activated' : 'blocked'} successfully` });
  } catch (err) {
    res.status(500).json({ detail: 'Error updating user status' });
  }
});

router.delete('/users/:userId', authenticateAdmin, getAdminUser, async (req, res) => {
  try {
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({ detail: 'Only superadmin can delete users' });
    }

    const userId = parseInt(req.params.userId);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ detail: 'User not found' });

    await prisma.$transaction([
      prisma.saleItem.deleteMany({ where: { sale: { shop: { ownerId: user.uuid } } } }),
      prisma.stockLog.deleteMany({ where: { shop: { ownerId: user.uuid } } }),
      prisma.sale.deleteMany({ where: { shop: { ownerId: user.uuid } } }),
      prisma.product.deleteMany({ where: { shop: { ownerId: user.uuid } } }),
      prisma.customer.deleteMany({ where: { shop: { ownerId: user.uuid } } }),
      prisma.dukandarRelationship.deleteMany({ where: { OR: [{ wholesalerId: user.uuid }, { retailerId: user.uuid }] } }),
      prisma.referral.deleteMany({ where: { OR: [{ referrerId: user.uuid }, { referredId: user.uuid }] } }),
      prisma.referralCode.deleteMany({ where: { userId: user.uuid } }),
      prisma.userNotification.deleteMany({ where: { userId: user.uuid } }),
      prisma.pushSubscription.deleteMany({ where: { userId: user.uuid } }),
      prisma.notificationSetting.deleteMany({ where: { userId: user.uuid } }),
      prisma.supportTicket.deleteMany({ where: { userId: user.uuid } }),
      prisma.shop.deleteMany({ where: { ownerId: user.uuid } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);

    res.json({ detail: 'User and all related data deleted successfully' });
  } catch (err) {
    res.status(500).json({ detail: 'Error deleting user' });
  }
});

router.patch('/users/:userId/plan', authenticateAdmin, getAdminUser, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { plan, status, expiryDays } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ detail: 'User not found' });

    const shop = await prisma.shop.findFirst({ where: { ownerId: user.uuid } });
    if (!shop) return res.status(404).json({ detail: 'Shop not found for this user' });

    const updateData = {};
    if (plan) updateData.subscriptionPlan = plan;
    if (status) updateData.subscriptionStatus = status;
    if (expiryDays !== undefined) {
      updateData.subscriptionExpiry = new Date(Date.now() + expiryDays * 86400000);
    }

    await prisma.shop.update({ where: { id: shop.id }, data: updateData });
    res.json({ detail: 'Subscription updated successfully' });
  } catch (err) {
    res.status(500).json({ detail: 'Error updating subscription' });
  }
});

router.get('/analytics', authenticateAdmin, getAdminUser, async (req, res) => {
  try {
    const { period } = req.query;

    const totalUsers = await prisma.user.count();
    const activeUsers = await prisma.user.count({ where: { isActive: 1 } });
    const totalShops = await prisma.shop.count();

    const planStats = await prisma.shop.groupBy({
      by: ['subscriptionPlan'],
      _count: { id: true },
    });

    const statusStats = await prisma.shop.groupBy({
      by: ['subscriptionStatus'],
      _count: { id: true },
    });

    const totalReferrals = await prisma.referral.count();
    const completedReferrals = await prisma.referral.count({ where: { status: 'completed' } });

    // Revenue: count of referrals that were rewarded (simple proxy)
    const totalRevenue = await prisma.referral.count({ where: { referrerRewarded: true } });

    let dateFilter = {};
    if (period === 'daily') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dateFilter = { gte: today };
    } else if (period === 'monthly') {
      const firstOfMonth = new Date();
      firstOfMonth.setDate(1);
      firstOfMonth.setHours(0, 0, 0, 0);
      dateFilter = { gte: firstOfMonth };
    } else if (period === 'yearly') {
      const firstOfYear = new Date(new Date().getFullYear(), 0, 1);
      dateFilter = { gte: firstOfYear };
    }

    const newUsers = Object.keys(dateFilter).length
      ? await prisma.user.count({ where: { createdAt: dateFilter } })
      : totalUsers;

    const newReferrals = Object.keys(dateFilter).length
      ? await prisma.referral.count({ where: { createdAt: dateFilter } })
      : totalReferrals;

    res.json({
      totalUsers,
      activeUsers,
      blockedUsers: totalUsers - activeUsers,
      totalShops,
      newUsers,
      planStats: planStats.reduce((acc, p) => ({ ...acc, [p.subscriptionPlan]: p._count.id }), {}),
      statusStats: statusStats.reduce((acc, s) => ({ ...acc, [s.subscriptionStatus]: s._count.id }), {}),
      totalReferrals,
      completedReferrals,
      newReferrals,
      totalRevenue,
    });
  } catch (err) {
    res.status(500).json({ detail: 'Error fetching analytics' });
  }
});

router.get('/referrals', authenticateAdmin, getAdminUser, async (req, res) => {
  try {
    const referrals = await prisma.referral.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const uuids = [...new Set(referrals.flatMap((r) => [r.referrerId, r.referredId].filter(Boolean)))];
    const users = uuids.length ? await prisma.user.findMany({ where: { uuid: { in: uuids } } }) : [];
    const userMap = {};
    users.forEach((u) => { userMap[u.uuid] = u; });

    res.json(
      referrals.map((r) => ({
        id: r.id,
        referralCode: r.referralCode,
        status: r.status,
        discountApplied: r.discountApplied,
        referrerRewarded: r.referrerRewarded,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
        referrer: userMap[r.referrerId]
          ? { id: userMap[r.referrerId].id, name: userMap[r.referrerId].fullName || userMap[r.referrerId].name || '', email: userMap[r.referrerId].email }
          : null,
        referred: userMap[r.referredId]
          ? { id: userMap[r.referredId].id, name: userMap[r.referredId].fullName || userMap[r.referredId].name || '', email: userMap[r.referredId].email }
          : { email: r.referredEmail },
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ detail: 'Error fetching referrals' });
  }
});

router.post('/broadcast-notification', authenticateAdmin, getAdminUser, async (req, res) => {
  try {
    const { title, message, type, target, targetPlan } = req.body;
    if (!title || !message) return res.status(400).json({ detail: 'Title and message required' });

    const adminNotification = await prisma.adminNotification.create({
      data: {
        adminId: req.admin.id,
        title,
        message,
        notificationType: type || 'broadcast',
        targetAudience: target || 'all',
        targetPlan: targetPlan || null,
      },
    });

    let users = [];
    if (targetPlan) {
      const shops = await prisma.shop.findMany({
        where: { subscriptionPlan: targetPlan },
        select: { ownerId: true },
      });
      const userIds = [...new Set(shops.map((s) => s.ownerId))];
      if (userIds.length > 0) {
        users = await prisma.user.findMany({ where: { uuid: { in: userIds } } });
      }
    } else if (target && target !== 'all') {
      return res.status(400).json({ detail: 'Invalid target' });
    } else {
      users = await prisma.user.findMany();
    }

    if (users.length > 0) {
      await prisma.userNotification.createMany({
        data: users.map((u) => ({
          userId: u.uuid,
          adminNotificationId: adminNotification.id,
          title,
          message,
          notificationType: type || 'broadcast',
        })),
      });
    }

    res.json({ detail: `Notification sent to ${users.length} users`, recipientCount: users.length });
  } catch (err) {
    res.status(500).json({ detail: 'Error broadcasting notification' });
  }
});

router.post('/users/:userId/subscription-action', authenticateAdmin, getAdminUser, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { action } = req.body;
    if (!['barrier', 'activate'].includes(action)) {
      return res.status(400).json({ detail: "Action must be 'barrier' or 'activate'" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ detail: 'User not found' });

    const shop = await prisma.shop.findFirst({ where: { ownerId: user.uuid } });
    if (!shop) return res.status(404).json({ detail: 'Shop not found for this user' });

    await prisma.shop.update({
      where: { id: shop.id },
      data: {
        subscriptionStatus: action === 'barrier' ? 'barrier' : 'active',
      },
    });

    res.json({ detail: `Subscription ${action === 'barrier' ? 'barrier set' : 'activated'} successfully` });
  } catch (err) {
    res.status(500).json({ detail: 'Error updating subscription action' });
  }
});

export default router;
