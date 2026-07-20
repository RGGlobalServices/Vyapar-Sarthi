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
  
  // 'all' = the entire sales history, regardless of when it happened. This is the
  // Sales-History screen's default so imported historical (and even future-dated)
  // sales are visible without the shopkeeper having to guess a date range.
  const isAllTime = q.timeframe === 'all' && !q.startDate && !q.endDate;

  if (q.startDate) {
    start = new Date(q.startDate);
    start.setHours(0, 0, 0, 0);
  } else if (isAllTime) {
    start = new Date('2000-01-01T00:00:00.000Z');
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
  } else if (isAllTime) {
    // Far future so back-dated OR future-dated imported sales are all included.
    end = new Date('2100-01-01T00:00:00.000Z');
  }

  // 1. Sales Trend & KPIs (via SQL Aggregation)
  const salesByDayRaw = await prisma.$queryRaw<any[]>`
    SELECT 
      DATE_TRUNC('day', created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') as date,
      SUM(total_amount)::float as total_amount,
      SUM(total_profit)::float as total_profit
    FROM sales 
    WHERE shop_id = ${shop.id}::uuid AND created_at >= ${start} AND created_at <= ${end}
    GROUP BY 1 ORDER BY 1 ASC
  `;

  const paymentMethodsRaw = await prisma.$queryRaw<any[]>`
    SELECT 
      payment_type as method, 
      SUM(total_amount)::float as amount
    FROM sales 
    WHERE shop_id = ${shop.id}::uuid AND created_at >= ${start} AND created_at <= ${end}
    GROUP BY 1
  `;

  const salesCountRaw = await prisma.$queryRaw<any[]>`
    SELECT COUNT(*)::int as count 
    FROM sales 
    WHERE shop_id = ${shop.id}::uuid AND created_at >= ${start} AND created_at <= ${end}
  `;

  const salesByDay: Record<string, number> = {};
  const profitByDay: Record<string, number> = {};
  const paymentMethodSums: Record<string, number> = {};
  let totalRevenue = 0;
  let totalProfit = 0;
  let totalUdhar = 0;

  for (const row of salesByDayRaw) {
    const key = formatDate(row.date);
    const amt = Number(row.total_amount || 0);
    const prof = Number(row.total_profit || 0);
    salesByDay[key] = amt;
    profitByDay[key] = prof;
    totalRevenue += amt;
    totalProfit += prof;
  }

  for (const row of paymentMethodsRaw) {
    const method = row.method || 'Cash';
    const amt = Number(row.amount || 0);
    paymentMethodSums[method] = amt;
    if (method.toLowerCase() === 'udhar') totalUdhar += amt;
  }

  const totalSalesCount = Number(salesCountRaw[0]?.count || 0);

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

  // Overall Stock Valuation (SQL Aggregation instead of fetching all products)
  const stockValuationRaw = await prisma.$queryRaw<any[]>`
    SELECT 
      SUM(current_stock * selling_price)::float as stock_valuation,
      COUNT(CASE WHEN current_stock <= 5 THEN 1 END)::int as low_stock_alerts
    FROM products
    WHERE shop_id = ${shop.id}::uuid AND (archived = false OR archived IS NULL)
  `;

  const stockValuation = Number(stockValuationRaw[0]?.stock_valuation || 0);
  const lowStockAlerts = Number(stockValuationRaw[0]?.low_stock_alerts || 0);

  const averageOrderValue = totalSalesCount > 0 ? totalRevenue / totalSalesCount : 0;

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
