import { Router } from 'express';
import prisma from '../db.js';
import { authenticateUser, getCurrentUser } from '../middleware/auth.js';

const router = Router();
router.use(authenticateUser, getCurrentUser);

router.post('/subscribe', async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ detail: 'endpoint, keys.p256dh, and keys.auth are required' });
    }
    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh: keys.p256dh, auth: keys.auth },
      create: { userId: req.user.uuid, endpoint, p256dh: keys.p256dh, auth: keys.auth }
    });
    res.json(subscription);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

router.get('/settings', async (req, res) => {
  try {
    let settings = await prisma.notificationSetting.findUnique({
      where: { userId: req.user.uuid }
    });
    if (!settings) {
      settings = await prisma.notificationSetting.create({
        data: { userId: req.user.uuid }
      });
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

router.patch('/settings', async (req, res) => {
  try {
    const allowedFields = ['dailySummaryEnabled', 'lowStockAlertEnabled', 'alertTime'];
    const data = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        data[field] = req.body[field];
      }
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ detail: 'No valid fields provided' });
    }
    let settings = await prisma.notificationSetting.findUnique({
      where: { userId: req.user.uuid }
    });
    if (!settings) {
      settings = await prisma.notificationSetting.create({
        data: { userId: req.user.uuid, ...data }
      });
    } else {
      settings = await prisma.notificationSetting.update({
        where: { userId: req.user.uuid },
        data
      });
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

router.get('/in-app', async (req, res) => {
  try {
    const notifications = await prisma.userNotification.findMany({
      where: { userId: req.user.uuid },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    const unreadCount = notifications.filter(n => !n.isRead).length;
    res.json({ notifications, unreadCount });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

router.post('/in-app/:notificationId/read', async (req, res) => {
  try {
    const notificationId = req.params.notificationId;
    const notification = await prisma.userNotification.findFirst({
      where: { id: notificationId, userId: req.user.uuid }
    });
    if (!notification) {
      return res.status(404).json({ detail: 'Notification not found' });
    }
    await prisma.userNotification.update({
      where: { id: notificationId },
      data: { isRead: true }
    });
    res.json({ detail: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

router.post('/in-app/read-all', async (req, res) => {
  try {
    await prisma.userNotification.updateMany({
      where: { userId: req.user.uuid, isRead: false },
      data: { isRead: true }
    });
    res.json({ detail: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

export default router;
