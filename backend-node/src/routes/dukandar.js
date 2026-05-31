import { Router } from 'express';
import prisma from '../db.js';
import { authenticateUser, getCurrentUser } from '../middleware/auth.js';

const router = Router();

function generateNameBasedCode(nameBase) {
  const clean = nameBase.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5);
  const suffix = Math.floor(Math.random() * 900) + 100;
  return clean + suffix;
}

router.get('/my-access-code', authenticateUser, getCurrentUser, async (req, res) => {
  try {
    let refCode = await prisma.referralCode.findUnique({ where: { userId: req.user.uuid } });
    if (!refCode) {
      const base = req.user.storeName || req.user.fullName || req.user.name || req.user.email;
      const code = generateNameBasedCode(base);
      refCode = await prisma.referralCode.create({
        data: { userId: req.user.uuid, code },
      });
    }
    const shop = await prisma.shop.findFirst({ where: { ownerId: req.user.uuid } });
    res.json({
      accessCode: refCode.code,
      shopName: shop?.name || req.user.storeName || '',
      ownerName: req.user.fullName || req.user.name || '',
    });
  } catch (err) {
    res.status(500).json({ detail: 'Error fetching access code' });
  }
});

router.post('/add-dukandar', authenticateUser, getCurrentUser, async (req, res) => {
  try {
    const { retailerEmail } = req.body;
    if (!retailerEmail) return res.status(400).json({ detail: 'Retailer email is required' });

    const shop = await prisma.shop.findFirst({ where: { ownerId: req.user.uuid } });
    if (!shop || shop.subscriptionPlan !== 'wholesale') {
      return res.status(403).json({ detail: 'Business plan required to add dukandar' });
    }

    const retailer = await prisma.user.findUnique({ where: { email: retailerEmail } });
    if (!retailer) return res.status(404).json({ detail: 'Retailer not found' });
    if (retailer.uuid === req.user.uuid) return res.status(400).json({ detail: 'Cannot add yourself as dukandar' });

    const existing = await prisma.dukandarRelationship.findFirst({
      where: { wholesalerId: req.user.uuid, retailerId: retailer.uuid },
    });
    if (existing) return res.status(409).json({ detail: 'Dukandar relationship already exists' });

    await prisma.dukandarRelationship.create({
      data: { wholesalerId: req.user.uuid, retailerId: retailer.uuid },
    });

    res.json({ detail: 'Dukandar added successfully' });
  } catch (err) {
    res.status(500).json({ detail: 'Error adding dukandar' });
  }
});

router.post('/add-dukandar-by-code', authenticateUser, getCurrentUser, async (req, res) => {
  try {
    const { accessCode } = req.body;
    if (!accessCode) return res.status(400).json({ detail: 'Access code is required' });

    const shop = await prisma.shop.findFirst({ where: { ownerId: req.user.uuid } });
    if (!shop || shop.subscriptionPlan !== 'wholesale') {
      return res.status(403).json({ detail: 'Business plan required to add dukandar' });
    }

    const refCode = await prisma.referralCode.findUnique({ where: { code: accessCode } });
    if (!refCode) return res.status(404).json({ detail: 'Invalid access code' });

    const retailer = await prisma.user.findUnique({ where: { uuid: refCode.userId } });
    if (!retailer) return res.status(404).json({ detail: 'Retailer not found' });
    if (retailer.uuid === req.user.uuid) return res.status(400).json({ detail: 'Cannot add yourself as dukandar' });

    const existing = await prisma.dukandarRelationship.findFirst({
      where: { wholesalerId: req.user.uuid, retailerId: retailer.uuid },
    });
    if (existing) return res.status(409).json({ detail: 'Dukandar relationship already exists' });

    await prisma.dukandarRelationship.create({
      data: { wholesalerId: req.user.uuid, retailerId: retailer.uuid },
    });

    res.json({ detail: 'Dukandar added successfully' });
  } catch (err) {
    res.status(500).json({ detail: 'Error adding dukandar by code' });
  }
});

router.get('/my-dukandar', authenticateUser, getCurrentUser, async (req, res) => {
  try {
    const relationships = await prisma.dukandarRelationship.findMany({
      where: { wholesalerId: req.user.uuid, status: 'active' },
      include: {
        retailer: {
          select: {
            id: true,
            uuid: true,
            email: true,
            name: true,
            fullName: true,
            storeName: true,
            mobile: true,
            isActive: true,
          },
        },
      },
    });

    const dukandars = await Promise.all(
      relationships.map(async (rel) => {
        const shop = await prisma.shop.findFirst({ where: { ownerId: rel.retailer.uuid } });
        let stockAlerts = [];
        if (shop) {
          const allProducts = await prisma.product.findMany({
            where: { shopId: shop.id },
            select: { id: true, name: true, currentStock: true, minStock: true, baseUnit: true },
          });
          const lowStockProducts = allProducts.filter(p => p.currentStock <= p.minStock);
          stockAlerts = lowStockProducts.map((p) => ({
            productId: p.id,
            productName: p.name,
            currentStock: p.currentStock,
            minStock: p.minStock,
            unit: p.baseUnit,
          }));
        }
        return {
          id: rel.retailer.id,
          email: rel.retailer.email,
          name: rel.retailer.fullName || rel.retailer.name || '',
          shopName: shop?.name || rel.retailer.storeName || '',
          mobile: rel.retailer.mobile || '',
          isActive: !!rel.retailer.isActive,
          stockAlerts,
        };
      })
    );

    res.json(dukandars);
  } catch (err) {
    res.status(500).json({ detail: 'Error fetching dukandar list' });
  }
});

export default router;
