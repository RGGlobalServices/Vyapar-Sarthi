import { Router } from 'express';
import prisma from '../db.js';
import { authenticateUser, getCurrentUser } from '../middleware/auth.js';

const router = Router();

router.post('/credit/add', authenticateUser, getCurrentUser, async (req, res) => {
  try {
    const { retailerId, amount, description, items, dueDate } = req.body;
    if (!retailerId || !amount) return res.status(400).json({ detail: 'retailerId and amount required' });

    const relationship = await prisma.dukandarRelationship.findFirst({
      where: { wholesalerId: req.user.uuid, retailerId, status: 'active' },
    });
    if (!relationship) return res.status(404).json({ detail: 'Dukandar relationship not found' });

    const credit = await prisma.dukandarCredit.create({
      data: {
        relationshipId: relationship.id,
        wholesalerId: req.user.uuid,
        retailerId,
        amount: parseFloat(amount),
        description: description || '',
        items: items ? JSON.stringify(items) : '[]',
        dueDate: dueDate ? new Date(dueDate) : null,
      },
    });

    await prisma.userNotification.create({
      data: {
        userId: retailerId,
        title: 'New Credit Added',
        message: `Wholesaler added a credit of ₹${parseFloat(amount).toLocaleString('en-IN')} to your account.`,
        notificationType: 'dukandar_credit',
        link: '/dukandar-credit',
      },
    });

    res.json({ detail: 'Credit added', creditId: credit.id });
  } catch (err) {
    console.error('Add credit error:', err);
    res.status(500).json({ detail: 'Error adding credit' });
  }
});

router.get('/credit/list', authenticateUser, getCurrentUser, async (req, res) => {
  try {
    const { retailerId } = req.query;
    const where = { wholesalerId: req.user.uuid };
    if (retailerId) where.retailerId = retailerId;

    const credits = await prisma.dukandarCredit.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const enriched = await Promise.all(credits.map(async (c) => {
      const retailer = await prisma.user.findUnique({ where: { uuid: c.retailerId } });
      const rtShop = await prisma.shop.findFirst({ where: { ownerId: c.retailerId } });
      return {
        id: c.id,
        retailerName: retailer?.fullName || retailer?.name || '',
        retailerShop: rtShop?.name || '',
        retailerId: c.retailerId,
        amount: c.amount,
        description: c.description,
        items: JSON.parse(c.items || '[]'),
        status: c.status,
        dueDate: c.dueDate,
        createdAt: c.createdAt,
        paidAt: c.paidAt,
      };
    }));

    res.json(enriched);
  } catch (err) {
    console.error('List credit error:', err);
    res.status(500).json({ detail: 'Error listing credits' });
  }
});

router.get('/credit/my-dues', authenticateUser, getCurrentUser, async (req, res) => {
  try {
    const credits = await prisma.dukandarCredit.findMany({
      where: { retailerId: req.user.uuid },
      orderBy: { createdAt: 'desc' },
    });

    const enriched = await Promise.all(credits.map(async (c) => {
      const wholesaler = await prisma.user.findUnique({ where: { uuid: c.wholesalerId } });
      const wsShop = await prisma.shop.findFirst({ where: { ownerId: c.wholesalerId } });
      return {
        id: c.id,
        wholesalerName: wholesaler?.fullName || wholesaler?.name || '',
        wholesalerShop: wsShop?.name || '',
        amount: c.amount,
        description: c.description,
        items: JSON.parse(c.items || '[]'),
        status: c.status,
        dueDate: c.dueDate,
        createdAt: c.createdAt,
      };
    }));

    res.json(enriched);
  } catch (err) {
    console.error('My dues error:', err);
    res.status(500).json({ detail: 'Error fetching dues' });
  }
});

router.patch('/credit/pay/:id', authenticateUser, getCurrentUser, async (req, res) => {
  try {
    const credit = await prisma.dukandarCredit.findUnique({ where: { id: req.params.id } });
    if (!credit) return res.status(404).json({ detail: 'Credit not found' });
    if (credit.wholesalerId !== req.user.uuid) return res.status(403).json({ detail: 'Unauthorized' });

    await prisma.dukandarCredit.update({
      where: { id: req.params.id },
      data: { status: 'paid', paidAt: new Date() },
    });

    res.json({ detail: 'Credit marked as paid' });
  } catch (err) {
    console.error('Pay credit error:', err);
    res.status(500).json({ detail: 'Error updating credit' });
  }
});

router.get('/credit/summary', authenticateUser, getCurrentUser, async (req, res) => {
  try {
    const credits = await prisma.dukandarCredit.findMany({
      where: { wholesalerId: req.user.uuid },
    });

    const summary = {};
    for (const c of credits) {
      if (!summary[c.retailerId]) {
        const retailer = await prisma.user.findUnique({ where: { uuid: c.retailerId } });
        const rtShop = await prisma.shop.findFirst({ where: { ownerId: c.retailerId } });
        summary[c.retailerId] = {
          total: 0, pending: 0, paid: 0,
          name: retailer?.fullName || retailer?.name || '',
          shop: rtShop?.name || '',
        };
      }
      summary[c.retailerId].total += c.amount;
      if (c.status === 'pending') summary[c.retailerId].pending += c.amount;
      else if (c.status === 'paid') summary[c.retailerId].paid += c.amount;
    }

    res.json(summary);
  } catch (err) {
    console.error('Credit summary error:', err);
    res.status(500).json({ detail: 'Error fetching summary' });
  }
});

export default router;
