import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query } from '@/lib/server/http';
import { getDateRange } from '@/lib/server/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Simple in-memory cache for dashboard data
interface CacheEntry {
  data: any;
  timestamp: number;
}
const dashboardCache = new Map<string, CacheEntry>();
const CACHE_TTL = 10000; // 10 seconds

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);
  const { startDate, endDate } = getDateRange(q);
  const forceRefresh = q.refresh === 'true' || q.refresh === '1';

  const cacheKey = `${shop.id}_${startDate.getTime()}_${endDate.getTime()}`;

  if (!forceRefresh) {
    const cached = dashboardCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`[API] Dashboard Cache HIT for shop ${shop.id}`);
      return json(cached.data);
    }
  }

  console.log(`[API] Dashboard Cache MISS/REFRESH for shop ${shop.id}. Fetching from DB...`);

  // Execute all dashboard queries concurrently on the database
  const [
    salesAgg,
    profitAgg,
    customers,
    productsCount,
    lowStock,
    recentBills,
    topProd
  ] = await Promise.all([
    // 1. Sales aggregate sum
    prisma.sale.aggregate({
      where: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate } },
      _sum: { totalAmount: true },
    }),
    // 2. Profit aggregate sum
    prisma.sale.aggregate({
      where: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate } },
      _sum: { totalProfit: true },
    }),
    // 3. Customer total outstanding udhar
    prisma.customer.aggregate({
      where: { shopId: shop.id },
      _sum: { totalDue: true }
    }),
    // 4. Low stock count for stats
    prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int as count 
      FROM products 
      WHERE shop_id = ${shop.id}::uuid 
        AND current_stock <= min_stock 
        AND current_stock > 0
        AND min_stock > 0
    `,
    // 5. Low stock alerts (limit 5)
    prisma.$queryRaw<any[]>`
      SELECT id, name, category, current_stock, min_stock
      FROM products 
      WHERE shop_id = ${shop.id}::uuid 
        AND current_stock <= min_stock
        AND min_stock > 0
      ORDER BY (current_stock / min_stock) ASC
      LIMIT 5
    `,
    // 6. Recent bills (limit 5)
    prisma.sale.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { customer: { select: { name: true, mobile: true } } },
    }),
    // 7. Top products by revenue (limit 5)
    prisma.$queryRaw<any[]>`
      SELECT p.id, p.name, p.category, SUM(si.price_per_unit * si.quantity) as value, SUM(si.quantity) as qty
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      WHERE s.shop_id = ${shop.id}::uuid AND s.created_at >= ${startDate} AND s.created_at <= ${endDate}
      GROUP BY p.id, p.name, p.category
      ORDER BY value DESC
      LIMIT 5
    `
  ]);

  const totalUdhar = customers._sum?.totalDue || 0;
  const lowStockCount = Number((productsCount as any[])[0]?.count || 0);

  const payload = {
    summary: {
      today_sales: salesAgg._sum.totalAmount || 0,
      today_profit: profitAgg._sum.totalProfit || 0,
      total_udhar: totalUdhar,
      low_stock_count: lowStockCount,
    },
    lowStock: lowStock.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      current_stock: p.current_stock,
      min_stock: p.min_stock,
    })),
    recentBills: recentBills.map((s) => ({
      id: s.id,
      invoice_number: s.invoice_number,
      total_amount: s.totalAmount,
      payment_type: s.paymentType,
      customer_name: s.customer?.name,
      customer_mobile: s.customer?.mobile,
      created_at: s.createdAt,
    })),
    topProducts: topProd.map(r => ({
      id: r.id,
      name: r.name,
      category: r.category,
      value: Number(r.value || 0),
      qty: Number(r.qty || 0),
    }))
  };

  // Cache result
  dashboardCache.set(cacheKey, {
    data: payload,
    timestamp: Date.now()
  });

  return json(payload);
});
