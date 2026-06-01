import { Router } from 'express';
import prisma from '../db.js';
import { authenticateUser, getCurrentUser } from '../middleware/auth.js';

const router = Router();

router.post('/send-stock-alert', authenticateUser, getCurrentUser, async (req, res) => {
  try {
    const { retailerId } = req.body;
    if (!retailerId) return res.status(400).json({ detail: 'retailerId required' });

    const shop = await prisma.shop.findFirst({ where: { ownerId: req.user.uuid } });
    if (!shop || shop.subscriptionPlan !== 'wholesale') {
      return res.status(403).json({ detail: 'Wholesale plan required' });
    }

    const relationship = await prisma.dukandarRelationship.findFirst({
      where: { wholesalerId: req.user.uuid, retailerId, status: 'active' },
    });
    if (!relationship) return res.status(404).json({ detail: 'Dukandar not found' });

    const retailerShop = await prisma.shop.findFirst({ where: { ownerId: retailerId } });
    if (!retailerShop) return res.status(404).json({ detail: 'Retailer shop not found' });

    const allProducts = await prisma.product.findMany({
      where: { shopId: retailerShop.id },
      select: { id: true, name: true, currentStock: true, minStock: true, baseUnit: true },
    });

    const lowStockProducts = allProducts.filter(p => p.currentStock <= p.minStock);

    if (lowStockProducts.length === 0) {
      return res.status(400).json({ detail: 'No low stock products found for this dukandar' });
    }

    const productNames = lowStockProducts.map(p => p.name).join(', ');
    const message = `Your products are low in stock: ${productNames}. Can I take your order?`;

    const alert = await prisma.dukandarStockAlert.create({
      data: {
        relationshipId: relationship.id,
        wholesalerId: req.user.uuid,
        retailerId,
        message,
        products: JSON.stringify(lowStockProducts),
        status: 'pending',
      },
    });

    await prisma.userNotification.create({
      data: {
        userId: retailerId,
        title: 'Stock Alert from Wholesaler',
        message,
        notificationType: 'dukandar_stock_alert',
        link: `/dukandar-alerts/${alert.id}`,
      },
    });

    res.json({ detail: 'Stock alert sent', alertId: alert.id });
  } catch (err) {
    console.error('Send stock alert error:', err);
    res.status(500).json({ detail: 'Error sending stock alert' });
  }
});

router.get('/my-alerts', authenticateUser, getCurrentUser, async (req, res) => {
  try {
    const alerts = await prisma.dukandarStockAlert.findMany({
      where: { retailerId: req.user.uuid },
      orderBy: { createdAt: 'desc' },
    });

    const enriched = await Promise.all(alerts.map(async (a) => {
      const wholesaler = await prisma.user.findUnique({ where: { uuid: a.wholesalerId } });
      const wsShop = await prisma.shop.findFirst({ where: { ownerId: a.wholesalerId } });
      return {
        id: a.id,
        wholesalerName: wholesaler?.fullName || wholesaler?.name || '',
        wholesalerShop: wsShop?.name || '',
        message: a.message,
        products: JSON.parse(a.products || '[]'),
        status: a.status,
        createdAt: a.createdAt,
        respondedAt: a.respondedAt,
      };
    }));

    res.json(enriched);
  } catch (err) {
    console.error('Fetch alerts error:', err);
    res.status(500).json({ detail: 'Error fetching alerts' });
  }
});

router.get('/sent-alerts', authenticateUser, getCurrentUser, async (req, res) => {
  try {
    const alerts = await prisma.dukandarStockAlert.findMany({
      where: { wholesalerId: req.user.uuid },
      orderBy: { createdAt: 'desc' },
    });

    const enriched = await Promise.all(alerts.map(async (a) => {
      const retailer = await prisma.user.findUnique({ where: { uuid: a.retailerId } });
      const rtShop = await prisma.shop.findFirst({ where: { ownerId: a.retailerId } });
      return {
        id: a.id,
        retailerName: retailer?.fullName || retailer?.name || '',
        retailerShop: rtShop?.name || '',
        message: a.message,
        products: JSON.parse(a.products || '[]'),
        status: a.status,
        createdAt: a.createdAt,
        respondedAt: a.respondedAt,
      };
    }));

    res.json(enriched);
  } catch (err) {
    console.error('Fetch sent alerts error:', err);
    res.status(500).json({ detail: 'Error fetching sent alerts' });
  }
});

router.post('/respond-alert', authenticateUser, getCurrentUser, async (req, res) => {
  try {
    const { alertId, response } = req.body;
    if (!alertId || !response) return res.status(400).json({ detail: 'alertId and response required' });
    if (!['accepted', 'rejected', 'quotation'].includes(response)) {
      return res.status(400).json({ detail: 'Invalid response. Must be accepted, rejected, or quotation' });
    }

    const alert = await prisma.dukandarStockAlert.findUnique({ where: { id: alertId } });
    if (!alert) return res.status(404).json({ detail: 'Alert not found' });
    if (alert.retailerId !== req.user.uuid) return res.status(403).json({ detail: 'Unauthorized' });
    if (alert.status !== 'pending') return res.status(400).json({ detail: 'Alert already responded' });

    await prisma.dukandarStockAlert.update({
      where: { id: alertId },
      data: { status: response, respondedAt: new Date() },
    });

    await prisma.userNotification.create({
      data: {
        userId: alert.wholesalerId,
        title: 'Stock Alert Response',
        message: `Your dukandar has ${response === 'accepted' ? 'accepted' : response === 'quotation' ? 'requested a quotation for' : 'declined'} the stock restock offer.`,
        notificationType: 'dukandar_stock_alert',
        link: `/dukandar-alerts`,
      },
    });

    res.json({ detail: 'Response recorded', status: response });
  } catch (err) {
    console.error('Respond alert error:', err);
    res.status(500).json({ detail: 'Error responding to alert' });
  }
});

router.get('/quotation/:alertId', authenticateUser, getCurrentUser, async (req, res) => {
  try {
    const alert = await prisma.dukandarStockAlert.findUnique({ where: { id: req.params.alertId } });
    if (!alert) return res.status(404).json({ detail: 'Alert not found' });

    const requesterId = req.user.uuid;
    if (alert.retailerId !== requesterId && alert.wholesalerId !== requesterId) {
      return res.status(403).json({ detail: 'Unauthorized' });
    }

    const products = JSON.parse(alert.products || '[]');
    const wholesaler = await prisma.user.findUnique({ where: { uuid: alert.wholesalerId } });
    const wsShop = await prisma.shop.findFirst({ where: { ownerId: alert.wholesalerId } });
    const retailer = await prisma.user.findUnique({ where: { uuid: alert.retailerId } });
    const rtShop = await prisma.shop.findFirst({ where: { ownerId: alert.retailerId } });

    const fullProducts = await Promise.all(
      products.map(async (p) => {
        const full = await prisma.product.findUnique({ where: { id: p.id } });
        return {
          ...p,
          sellingPrice: full?.sellingPrice || 0,
          wholesaleCost: full?.wholesaleCost || 0,
        };
      })
    );

    res.json({
      quotationId: alert.id,
      fromShop: wsShop?.name || wholesaler?.storeName || 'Wholesaler',
      toShop: rtShop?.name || retailer?.storeName || 'Retailer',
      products: fullProducts,
      createdAt: alert.createdAt,
    });
  } catch (err) {
    console.error('Quotation error:', err);
    res.status(500).json({ detail: 'Error generating quotation' });
  }
});

export default router;
