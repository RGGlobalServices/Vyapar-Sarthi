import { Router } from 'express';
import prisma from '../db.js';
import { authenticateUser, getCurrentUser, getCurrentShop } from '../middleware/auth.js';

const router = Router();
router.use(authenticateUser, getCurrentUser, getCurrentShop);

function startOfDay(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(d) {
  const date = new Date(d);
  date.setHours(23, 59, 59, 999);
  return date;
}

function formatDate(d) {
  const date = new Date(d);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateRange(query) {
  const start = query.start_date ? startOfDay(new Date(query.start_date)) : startOfDay(new Date());
  const end = query.end_date ? endOfDay(new Date(query.end_date)) : endOfDay(new Date());
  return { startDate: start, endDate: end };
}

router.get('/summary', async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req.query);
    const [salesAgg, profitAgg, customers, products] = await Promise.all([
      prisma.sale.aggregate({
        where: { shopId: req.shop.id, createdAt: { gte: startDate, lte: endDate } },
        _sum: { totalAmount: true }
      }),
      prisma.sale.aggregate({
        where: { shopId: req.shop.id, createdAt: { gte: startDate, lte: endDate } },
        _sum: { totalProfit: true }
      }),
      prisma.customer.findMany({
        where: { shopId: req.shop.id },
        select: { totalDue: true }
      }),
      prisma.product.findMany({
        where: { shopId: req.shop.id },
        select: { currentStock: true, minStock: true }
      })
    ]);
    const totalUdhar = customers.reduce((sum, c) => sum + (c.totalDue || 0), 0);
    const lowStockCount = products.filter(p => p.currentStock <= p.minStock).length;
    res.json({
      today_sales: salesAgg._sum.totalAmount || 0,
      today_profit: profitAgg._sum.totalProfit || 0,
      total_udhar: totalUdhar,
      low_stock_count: lowStockCount
    });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

router.get('/sales-trend', async (req, res) => {
  try {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    const sales = await prisma.sale.findMany({
      where: { shopId: req.shop.id, createdAt: { gte: sevenDaysAgo } },
      select: { totalAmount: true, createdAt: true }
    });
    const grouped = {};
    for (const sale of sales) {
      const key = formatDate(sale.createdAt);
      grouped[key] = (grouped[key] || 0) + (sale.totalAmount || 0);
    }
    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = formatDate(d);
      trend.push({ date: key, total: grouped[key] || 0 });
    }
    res.json(trend);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

router.get('/top-products', async (req, res) => {
  try {
    const groupBy = req.query.group_by || 'revenue';
    const limit = parseInt(req.query.limit) || 10;
    const { startDate, endDate } = getDateRange(req.query);
    const saleItems = await prisma.saleItem.findMany({
      where: {
        sale: {
          shopId: req.shop.id,
          createdAt: { gte: startDate, lte: endDate }
        }
      },
      include: {
        sale: { select: { paymentType: true } },
        product: { select: { name: true, category: true } }
      }
    });
    let items = [];
    let total = 0;
    if (groupBy === 'revenue') {
      const map = {};
      for (const si of saleItems) {
        const rev = (si.pricePerUnit || 0) * (si.quantity || 0);
        if (!map[si.productId]) map[si.productId] = { name: si.product.name, value: 0 };
        map[si.productId].value += rev;
        total += rev;
      }
      items = Object.values(map).sort((a, b) => b.value - a.value).slice(0, limit);
    } else if (groupBy === 'quantity') {
      const map = {};
      for (const si of saleItems) {
        if (!map[si.productId]) map[si.productId] = { name: si.product.name, value: 0 };
        map[si.productId].value += si.quantity || 0;
        total += si.quantity || 0;
      }
      items = Object.values(map).sort((a, b) => b.value - a.value).slice(0, limit);
    } else if (groupBy === 'category') {
      const map = {};
      for (const si of saleItems) {
        const cat = si.product.category || 'Uncategorized';
        const rev = (si.pricePerUnit || 0) * (si.quantity || 0);
        if (!map[cat]) map[cat] = { name: cat, value: 0 };
        map[cat].value += rev;
        total += rev;
      }
      items = Object.values(map).sort((a, b) => b.value - a.value).slice(0, limit);
    } else if (groupBy === 'udhar') {
      const udharItems = saleItems.filter(si => si.sale.paymentType === 'UDHAR');
      const map = {};
      for (const si of udharItems) {
        const rev = (si.pricePerUnit || 0) * (si.quantity || 0);
        if (!map[si.productId]) map[si.productId] = { name: si.product.name, value: 0 };
        map[si.productId].value += rev;
        total += rev;
      }
      items = Object.values(map).sort((a, b) => b.value - a.value).slice(0, limit);
    }
    res.json({ items, total, currency: 'INR' });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

router.get('/low-stock', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const products = await prisma.product.findMany({
      where: { shopId: req.shop.id }
    });
    const lowStock = products
      .filter(p => p.currentStock != null && p.minStock != null && p.currentStock <= p.minStock)
      .sort((a, b) => {
        const ratioA = a.minStock ? a.currentStock / a.minStock : Infinity;
        const ratioB = b.minStock ? b.currentStock / b.minStock : Infinity;
        return ratioA - ratioB;
      })
      .slice(0, limit);
    res.json(lowStock.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      current_stock: p.currentStock,
      min_stock: p.minStock,
    })));
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

router.get('/recent-bills', async (req, res) => {
  try {
    const sales = await prisma.sale.findMany({
      where: { shopId: req.shop.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        customer: { select: { name: true, mobile: true } }
      }
    });
    res.json(sales.map(s => ({
      id: s.id,
      invoice_number: s.invoiceNumber,
      total_amount: s.totalAmount,
      payment_type: s.paymentType,
      customer_name: s.customer?.name,
      customer_mobile: s.customer?.mobile,
      created_at: s.createdAt,
    })));
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

router.get('/ai-context', async (req, res) => {
  try {
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    const [productsCount, todaySalesAgg, allProducts] = await Promise.all([
      prisma.product.count({ where: { shopId: req.shop.id } }),
      prisma.sale.aggregate({
        where: { shopId: req.shop.id, createdAt: { gte: todayStart, lte: todayEnd } },
        _sum: { totalAmount: true }
      }),
      prisma.product.findMany({
        where: { shopId: req.shop.id },
        select: { currentStock: true, minStock: true }
      })
    ]);
    const lowStockItems = allProducts.filter(p => p.currentStock <= p.minStock).length;
    res.json({
      shopName: req.shop.name,
      productsCount,
      todaySales: todaySalesAgg._sum.totalAmount || 0,
      lowStockItems,
      subscriptionPlan: req.shop.subscriptionPlan
    });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

router.get('/product-insights/:productId', async (req, res) => {
  try {
    const productId = req.params.productId;
    const { startDate, endDate } = getDateRange(req.query);
    const product = await prisma.product.findFirst({
      where: { id: productId, shopId: req.shop.id }
    });
    if (!product) {
      return res.status(404).json({ detail: 'Product not found' });
    }
    const saleItems = await prisma.saleItem.findMany({
      where: {
        productId,
        sale: {
          shopId: req.shop.id,
          createdAt: { gte: startDate, lte: endDate }
        }
      },
      include: { sale: { select: { id: true } } }
    });
    let totalQuantity = 0;
    let totalRevenue = 0;
    let totalProfit = 0;
    const billIds = new Set();
    for (const si of saleItems) {
      totalQuantity += si.quantity || 0;
      totalRevenue += (si.pricePerUnit || 0) * (si.quantity || 0);
      totalProfit += (si.marginPerUnit || 0) * (si.quantity || 0);
      billIds.add(si.sale.id);
    }
    res.json({
      product: {
        id: product.id,
        name: product.name,
        category: product.category,
        currentStock: product.currentStock,
        minStock: product.minStock,
        sellingPrice: product.sellingPrice,
        mrp: product.mrp
      },
      metrics: {
        totalQuantity,
        totalRevenue,
        totalProfit,
        totalBills: billIds.size
      }
    });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

router.get('/business-report', async (req, res) => {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    endOfMonth.setDate(0);
    endOfMonth.setHours(23, 59, 59, 999);
    const [salesAgg, billsCount, productsCount, customersCount] = await Promise.all([
      prisma.sale.aggregate({
        where: { shopId: req.shop.id, createdAt: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { totalAmount: true, totalProfit: true }
      }),
      prisma.sale.count({
        where: { shopId: req.shop.id, createdAt: { gte: startOfMonth, lte: endOfMonth } }
      }),
      prisma.product.count({ where: { shopId: req.shop.id } }),
      prisma.customer.count({ where: { shopId: req.shop.id } })
    ]);
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    res.json({
      shopName: req.shop.name,
      period,
      totalSales: salesAgg._sum.totalAmount || 0,
      totalProfit: salesAgg._sum.totalProfit || 0,
      totalBills: billsCount,
      totalProducts: productsCount,
      totalCustomers: customersCount,
      subscriptionPlan: req.shop.subscriptionPlan
    });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

router.get('/export', async (req, res) => {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    endOfMonth.setDate(0);
    endOfMonth.setHours(23, 59, 59, 999);
    const sales = await prisma.sale.findMany({
      where: { shopId: req.shop.id, createdAt: { gte: startOfMonth, lte: endOfMonth } },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { name: true, mobile: true } },
        items: {
          include: { product: { select: { name: true, baseUnit: true } } }
        }
      }
    });
    const rows = sales.map(sale => ({
      billId: sale.id,
      date: sale.createdAt,
      customerName: sale.customer?.name || 'Walk-in',
      customerMobile: sale.customer?.mobile || '',
      paymentType: sale.paymentType,
      totalAmount: sale.totalAmount,
      totalProfit: sale.totalProfit,
      items: sale.items.map(item => ({
        productName: item.product.name,
        quantity: item.quantity,
        unit: item.unit,
        pricePerUnit: item.pricePerUnit,
        total: (item.pricePerUnit || 0) * (item.quantity || 0)
      }))
    }));
    const total = sales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    res.json({ rows, total, period });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

export default router;
