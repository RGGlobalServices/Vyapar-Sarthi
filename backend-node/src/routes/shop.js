import { Router } from 'express';
import prisma from '../db.js';
import { authenticateUser, getCurrentUser, getCurrentShop } from '../middleware/auth.js';

const router = Router();
router.use(authenticateUser, getCurrentUser, getCurrentShop);

router.get('/profile', (req, res) => {
  res.json(req.shop);
});

router.patch('/profile', async (req, res) => {
  try {
    const allowedFields = ['name', 'address', 'mobile', 'businessType', 'logoUrl', 'setupComplete'];
    const data = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        data[field] = req.body[field];
      }
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ detail: 'No valid fields provided' });
    }
    const shop = await prisma.shop.update({
      where: { id: req.shop.id },
      data
    });
    res.json(shop);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

export default router;
