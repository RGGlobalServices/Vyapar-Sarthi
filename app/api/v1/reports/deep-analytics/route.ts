import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query } from '@/lib/server/http';
import { getDateRange, formatDate } from '@/lib/server/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);
  
  // Custom date parsing to support exact timeframe filters
  const today = new Date();
  let start = new Date(today);
  start.setHours(0, 0, 0, 0);
  let end = new Date(today);
  end.setHours(23, 59, 59, 999);
  
  if (q.startDate) {
    start = new Date(q.startDate);
    start.setHours(0, 0, 0, 0);
  } else if (q.timeframe === 'week') {
    start.setDate(today.getDate() - 6);
  } else if (q.timeframe === 'month') {
    start.setMonth(today.getMonth() - 1);
  } else if (q.timeframe === 'quarter') {
    start.setMonth(today.getMonth() - 3);
  } else if (q.timeframe === 'year') {
    start.setFullYear(today.getFullYear() - 1);
  }

  if (q.endDate) {
    end = new Date(q.endDate);
    end.setHours(23, 59, 59, 999);
  }

  // 1. Sales Trend
  const sales = await prisma.sale.findMany({
    where: { shopId: shop.id, createdAt: { gte: start, lte: end } },
    select: { id: true, totalAmount: true, totalProfit: true, paymentType: true, createdAt: true },
    orderBy: { createdAt: 'asc' }
  });

  const salesByDay: Record<string, number> = {};
  const profitByDay: Record<string, number> = {};
  const paymentMethodSums: Record<string, number> = {};
  let totalRevenue = 0;
  let totalProfit = 0;
  let totalUdhar = 0;

  for (const sale of sales) {
    const key = formatDate(sale.createdAt || new Date());
    const amt = sale.totalAmount || 0;
    
    salesByDay[key] = (salesByDay[key] || 0) + amt;
    profitByDay[key] = (profitByDay[key] || 0) + (sale.totalProfit || 0);
    
    totalRevenue += amt;
    totalProfit += (sale.totalProfit || 0);

    const pt = sale.paymentType?.toUpperCase() || 'UNKNOWN';
    if (pt === 'UDHAR') totalUdhar += amt;
    paymentMethodSums[pt] = (paymentMethodSums[pt] || 0) + amt;
  }

  // Format trend array properly mapping between start and end date
  const trend = [];
  let currentDate = new Date(start);
  while (currentDate <= end) {
    const key = formatDate(currentDate);
    trend.push({
      date: key,
      sales: salesByDay[key] || 0,
      profit: profitByDay[key] || 0,
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Payment Flow
  const paymentFlow = Object.keys(paymentMethodSums).map(k => ({
    name: k,
    value: paymentMethodSums[k]
  })).sort((a, b) => b.value - a.value);

  // 2. Stock Health and Velocity (Using raw SQL for speed across joins)
  const stockVelocityRaw = await prisma.$queryRaw<any[]>`
    SELECT 
      COALESCE(p.name, 'Other Sales') as name, 
      SUM(si.quantity) as sales_velocity,
      MAX(p.current_stock) as current_stock
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    LEFT JOIN products p ON si.product_id = p.id
    WHERE s.shop_id = ${shop.id}::uuid AND s.created_at >= ${start} AND s.created_at <= ${end}
    GROUP BY p.id, p.name
    ORDER BY sales_velocity DESC
    LIMIT 20
  `;

  const stockHealth = stockVelocityRaw.map(r => ({
    name: r.name,
    salesVelocity: Number(r.sales_velocity || 0),
    currentStock: Number(r.current_stock || 0)
  }));

  // Overall Stock Valuation
  const allProducts = await prisma.product.findMany({
    where: { shopId: shop.id },
    select: { currentStock: true, sellingPrice: true }
  });
  
  let stockValuation = 0;
  let lowStockAlerts = 0;
  for (const p of allProducts) {
    const qty = p.currentStock || 0;
    if (qty <= 5) lowStockAlerts++;
    stockValuation += (qty * (p.sellingPrice || 0));
  }

  const averageOrderValue = sales.length > 0 ? totalRevenue / sales.length : 0;

  return json({
    kpis: {
      totalRevenue,
      totalProfit,
      totalUdhar,
      averageOrderValue,
      stockValuation,
      lowStockAlerts
    },
    trend,
    paymentFlow,
    stockHealth
  });
});
