import { Router } from 'express';
import crypto from 'crypto';
import prisma from '../db.js';
import { authenticateUser, getCurrentUser, getCurrentShop } from '../middleware/auth.js';

const router = Router();

router.use(authenticateUser, getCurrentUser, getCurrentShop);

router.post('/', async (req, res) => {
  try {
    const shopId = req.shop.id;
    const customerId = req.body.customer_id || null;
    const items = req.body.items;
    const totalAmount = req.body.total_amount;
    const totalProfit = req.body.total_profit;
    const paymentType = req.body.payment_type;

    if (!items || !items.length) {
      return res.status(400).json({ detail: 'No items in bill' });
    }

    const invoice_number = `INV-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

    const sale = await prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          shopId,
          customerId,
          totalAmount,
          totalProfit,
          paymentType,
          invoice_number,
          items: {
            create: items.map((item) => ({
              productId: item.product_id || item.productId,
              unit: item.unit,
              quantity: item.quantity,
              pricePerUnit: item.price_per_unit || item.pricePerUnit,
              marginPerUnit: item.margin_per_unit || item.marginPerUnit,
            })),
          },
        },
        include: { items: true },
      });
      for (const item of items) {
        const pid = item.product_id || item.productId;
        if (!pid) continue;
        await tx.product.update({
          where: { id: pid },
          data: { currentStock: { decrement: item.quantity } },
        });
      }
      if (paymentType === 'Udhar' && customerId) {
        await tx.customer.update({
          where: { id: customerId },
          data: { totalDue: { increment: totalAmount } },
        });
      }
      return created;
    });
    res.status(201).json(sale);
  } catch (err) {
    console.error('Billing error:', err);
    res.status(500).json({ detail: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const shopId = req.shop.id;
    const sales = await prisma.sale.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
      include: { customer: { select: { name: true } } },
    });
    res.json(sales.map((s) => ({
      id: s.id,
      invoice_number: s.invoice_number,
      total_amount: s.totalAmount,
      payment_type: s.paymentType,
      customer_name: s.customer?.name || null,
      created_at: s.createdAt,
    })));
  } catch (err) {
    console.error('List bills error:', err);
    res.status(500).json({ detail: err.message });
  }
});

router.get('/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const shopId = req.shop.id;

    const cleanId = identifier.replace(/^INV[-_]?/i, '').replace(/[^a-zA-Z0-9]/g, '');
    const invVariants = [`INV-${cleanId}`, `INV_${cleanId}`, `INV${cleanId}`, cleanId];

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
    const isHexSegment = /^[0-9a-f]{8,}$/i.test(cleanId);

    let sale = await prisma.sale.findFirst({
      where: {
        OR: [
          ...(isUUID ? [{ id: identifier }] : []),
          ...invVariants.map((inv) => ({ invoice_number: inv })),
        ],
        shopId,
      },
      include: {
        items: {
          include: { product: { select: { name: true } } },
        },
        customer: { select: { name: true } },
      },
    });

    if (!sale && isHexSegment) {
      const raw = await prisma.$queryRawUnsafe(
        'SELECT id FROM sales WHERE id::text LIKE $1 AND shop_id = $2::uuid LIMIT 1',
        `${cleanId.toLowerCase()}%`,
        shopId
      );
      if (raw.length) {
        sale = await prisma.sale.findFirst({
          where: { id: raw[0].id },
          include: {
            items: { include: { product: { select: { name: true } } } },
            customer: { select: { name: true } },
          },
        });
      }
    }

    if (!sale) {
      return res.status(404).json({ detail: 'Invoice not found' });
    }

    res.json({
      id: sale.id,
      invoice_number: sale.invoice_number,
      total_amount: sale.totalAmount,
      payment_type: sale.paymentType,
      customer_name: sale.customer?.name || null,
      created_at: sale.createdAt,
      items: sale.items.map((item) => ({
        id: item.id,
        product_id: item.productId,
        name: item.product?.name || 'Unknown',
        price_per_unit: item.pricePerUnit,
        quantity: item.quantity,
        total: (item.pricePerUnit || 0) * (item.quantity || 0),
      })),
    });
  } catch (err) {
    console.error('Get bill error:', err);
    res.status(500).json({ detail: err.message });
  }
});

router.post('/returns', async (req, res) => {
  try {
    const { bill_id, items } = req.body;

    if (!bill_id || !items || !items.length) {
      return res.status(400).json({ detail: 'bill_id and items are required' });
    }

    const sale = await prisma.sale.findUnique({
      where: { id: bill_id },
      include: { items: true },
    });

    if (!sale) {
      return res.status(404).json({ detail: 'Bill not found' });
    }

    for (const ret of items) {
      const saleItem = sale.items.find((si) => si.id === ret.item_id);
      if (!saleItem) continue;

      await prisma.product.update({
        where: { id: saleItem.productId },
        data: { currentStock: { increment: ret.quantity } },
      });
    }

    res.json({ detail: 'Return processed successfully' });
  } catch (err) {
    console.error('Return error:', err);
    res.status(500).json({ detail: err.message });
  }
});

export default router;
