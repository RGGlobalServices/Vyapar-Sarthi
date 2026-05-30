import { Router } from 'express';
import prisma from '../db.js';
import { authenticateUser, getCurrentUser, getCurrentShop } from '../middleware/auth.js';

const router = Router();

router.use(authenticateUser, getCurrentUser, getCurrentShop);

router.get('/', async (req, res) => {
  try {
    const products = await prisma.product.findMany({ where: { shopId: req.shop.id } });
    res.json(products);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const product = await prisma.product.create({
      data: {
        shopId: req.shop.id,
        name: req.body.name,
        category: req.body.category,
        currentStock: req.body.current_stock,
        minStock: req.body.min_stock,
        mrp: req.body.mrp,
        sellingPrice: req.body.selling_price,
        wholesaleCost: req.body.wholesale_cost,
        baseUnit: req.body.base_unit,
        barcode: req.body.barcode,
        is_loose: req.body.is_loose,
        expiryDate: req.body.expiry_date,
        batch_number: req.body.batch_number,
        drug_schedule: req.body.drug_schedule,
        model_number: req.body.model_number,
        warranty_months: req.body.warranty_months,
        gender: req.body.gender,
        shade: req.body.shade,
        size_variants: req.body.size_variants,
      },
    });
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

router.put('/:productId', async (req, res) => {
  try {
    const productId = req.params.productId;
    const product = await prisma.product.findFirst({ where: { id: productId, shopId: req.shop.id } });
    if (!product) return res.status(404).json({ detail: 'Product not found' });
    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        name: req.body.name,
        category: req.body.category,
        currentStock: req.body.current_stock,
        minStock: req.body.min_stock,
        mrp: req.body.mrp,
        sellingPrice: req.body.selling_price,
        wholesaleCost: req.body.wholesale_cost,
        baseUnit: req.body.base_unit,
        barcode: req.body.barcode,
        is_loose: req.body.is_loose,
        expiryDate: req.body.expiry_date,
        batch_number: req.body.batch_number,
        drug_schedule: req.body.drug_schedule,
        model_number: req.body.model_number,
        warranty_months: req.body.warranty_months,
        gender: req.body.gender,
        shade: req.body.shade,
        size_variants: req.body.size_variants,
      },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

router.delete('/:productId', async (req, res) => {
  try {
    const productId = req.params.productId;
    const product = await prisma.product.findFirst({ where: { id: productId, shopId: req.shop.id } });
    if (!product) return res.status(404).json({ detail: 'Product not found' });
    await prisma.product.delete({ where: { id: productId } });
    res.json({ detail: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

router.post('/:productId/adjust', async (req, res) => {
  try {
    const productId = req.params.productId;
    const { quantity, type, note } = req.body;
    const product = await prisma.product.findFirst({ where: { id: productId, shopId: req.shop.id } });
    if (!product) return res.status(404).json({ detail: 'Product not found' });
    const change = type === 'out' ? -Math.abs(quantity) : Math.abs(quantity);
    const [updated] = await prisma.$transaction([
      prisma.product.update({
        where: { id: productId },
        data: { currentStock: { increment: change } },
      }),
      prisma.stockLog.create({
        data: {
          shopId: req.shop.id,
          productId,
          type,
          quantity: Math.abs(change),
          note: note || null,
        },
      }),
    ]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

router.get('/logs/all', async (req, res) => {
  try {
    const logs = await prisma.stockLog.findMany({
      where: { shopId: req.shop.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { products: { select: { name: true } } },
    });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

export default router;
