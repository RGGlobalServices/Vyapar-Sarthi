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
const CACHE_TTL = 30000; // 30 seconds

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

  // Execute dashboard queries in parallel batches to improve speed
  // while preventing connection pool exhaustion
  const [
    salesAndProfit,
    customers,
    productsCount,
    returnsSummary,
    returnsByReason,
    returnsProfitLost,
    realizedProfitData,
    udharPaymentsData,
    marginData,
    udharGivenData
  ] = await Promise.all([
    prisma.sale.aggregate({
      where: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate } },
      _sum: { totalAmount: true, totalProfit: true },
    }),
    prisma.customer.aggregate({
      where: { shopId: shop.id },
      _sum: { totalDue: true }
    }),
    prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int as count 
      FROM products 
      WHERE shop_id = ${shop.id}::uuid 
        AND current_stock <= min_stock 
        AND current_stock > 0
        AND min_stock > 0
    `,
    prisma.materialReturn.aggregate({
      where: { shopId: shop.id, date: { gte: startDate, lte: endDate } },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.materialReturn.groupBy({
      by: ['reason'],
      where: { shopId: shop.id, date: { gte: startDate, lte: endDate } },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.$queryRaw<{ profit_lost: number }[]>`
      SELECT SUM(
        r.quantity * (COALESCE(p.selling_price, 0) - COALESCE(p.wholesale_cost, 0))
      )::float as profit_lost
      FROM material_returns r
      LEFT JOIN products p ON r.product_id = p.id
      WHERE r.shop_id = ${shop.id}::uuid AND r.date >= ${startDate} AND r.date <= ${endDate}
    `,
    prisma.$queryRaw<{ realized_sales_profit: number }[]>`
      SELECT SUM(
        CASE 
          WHEN total_amount > 0 THEN (amount_paid / total_amount) * total_profit
          ELSE 0
        END
      )::float as realized_sales_profit
      FROM sales
      WHERE shop_id = ${shop.id}::uuid AND created_at >= ${startDate} AND created_at <= ${endDate}
    `,
    prisma.$queryRaw<{ total_udhar_paid: number }[]>`
      SELECT SUM(t.amount)::float as total_udhar_paid
      FROM customer_transactions t
      JOIN customers c ON t.customer_id = c.id
      WHERE c.shop_id = ${shop.id}::uuid 
        AND t.type = 'payment'
        AND t.created_at >= ${startDate} 
        AND t.created_at <= ${endDate}
    `,
    prisma.$queryRaw<{ total_profit: number, total_amount: number }[]>`
      SELECT SUM(total_profit)::float as total_profit, SUM(total_amount)::float as total_amount
      FROM sales
      WHERE shop_id = ${shop.id}::uuid
    `,
    prisma.$queryRaw<{ total_udhar_given: number }[]>`
      SELECT SUM(t.amount)::float as total_udhar_given
      FROM customer_transactions t
      JOIN customers c ON t.customer_id = c.id
      WHERE c.shop_id = ${shop.id}::uuid 
        AND t.type = 'udhar'
        AND t.created_at >= ${startDate} 
        AND t.created_at <= ${endDate}
    `
  ]);

  const [
    lowStock,
    recentBills,
    topProd,
    fastProd,
    slowProd
  ] = await Promise.all([
    // Low stock
    prisma.$queryRaw<any[]>`
      SELECT id, name, category, current_stock, min_stock
      FROM products 
      WHERE shop_id = ${shop.id}::uuid 
        AND current_stock <= min_stock
        AND min_stock > 0
      ORDER BY (current_stock / min_stock) ASC
      LIMIT 5
    `,
    // Recent bills
    prisma.sale.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { customer: { select: { name: true, mobile: true } } },
    }),
    // Top Products by Value (Optimized)
    prisma.$queryRaw<any[]>`
      SELECT p.id, p.name, p.category, s_agg.value, s_agg.qty
      FROM (
        SELECT si.product_id, SUM(si.price_per_unit * si.quantity) as value, SUM(si.quantity) as qty
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.shop_id = ${shop.id}::uuid AND s.created_at >= ${startDate} AND s.created_at <= ${endDate}
        GROUP BY si.product_id
      ) s_agg
      JOIN products p ON s_agg.product_id = p.id
      ORDER BY s_agg.value DESC
      LIMIT 5
    `,
    // Fast moving by Qty (Optimized)
    prisma.$queryRaw<any[]>`
      SELECT p.id, p.name, p.category, s_agg.qty, s_agg.value
      FROM (
        SELECT si.product_id, SUM(si.quantity) as qty, SUM(si.price_per_unit * si.quantity) as value
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.shop_id = ${shop.id}::uuid AND s.created_at >= ${startDate} AND s.created_at <= ${endDate}
        GROUP BY si.product_id
      ) s_agg
      JOIN products p ON s_agg.product_id = p.id
      ORDER BY s_agg.qty DESC
      LIMIT 5
    `,
    // Slow moving (Optimized INNER JOIN)
    prisma.$queryRaw<any[]>`
      SELECT p.id, p.name, p.category, s_agg.qty, p.current_stock
      FROM (
        SELECT si.product_id, SUM(si.quantity) as qty
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.shop_id = ${shop.id}::uuid AND s.created_at >= ${startDate} AND s.created_at <= ${endDate}
        GROUP BY si.product_id
      ) s_agg
      JOIN products p ON s_agg.product_id = p.id
      WHERE p.current_stock > 0
      ORDER BY s_agg.qty ASC, p.current_stock DESC
      LIMIT 5
    `
  ]);

  const totalUdhar = customers._sum?.totalDue || 0;
  const lowStockCount = Number((productsCount as any[])[0]?.count || 0);
  const returnsProfit = Number((returnsProfitLost as any[])[0]?.profit_lost || 0);
  const returnsAmount = returnsSummary._sum.amount || 0;

  // Realized Profit Calculation
  const realizedSalesProfit = Number((realizedProfitData as any[])[0]?.realized_sales_profit || 0);
  const udharPaid = Number((udharPaymentsData as any[])[0]?.total_udhar_paid || 0);
  const allTimeProfit = Number((marginData as any[])[0]?.total_profit || 0);
  const allTimeSales = Number((marginData as any[])[0]?.total_amount || 0);
  const avgMargin = allTimeSales > 0 ? (allTimeProfit / allTimeSales) : 0.0;
  
  // Realized Profit = (Profit from Cash collected today) + (Udhar Payments collected today * All Time Profit Margin)
  const finalProfit = realizedSalesProfit + (udharPaid * avgMargin);

  const payload: any = {
    summary: {
      today_sales: (salesAndProfit._sum.totalAmount || 0) - returnsAmount,
      today_profit: finalProfit - returnsProfit,
      expected_profit: (salesAndProfit._sum.totalProfit || 0) - returnsProfit,
      cash_profit: finalProfit - returnsProfit,
      udhar_profit: Math.max(0, (salesAndProfit._sum.totalProfit || 0) - finalProfit),
      total_udhar: totalUdhar,
      period_udhar: Number((udharGivenData as any[])[0]?.total_udhar_given || 0),
      low_stock_count: lowStockCount,
      returns_amount: returnsSummary._sum.amount || 0,
      returns_count: returnsSummary._count.id || 0,
    },
    returnsByReason: returnsByReason.map(r => ({
      reason: r.reason,
      amount: r._sum.amount || 0,
      count: r._count.id || 0,
    })),
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
      total_amount: s.totalAmount || 0,
      payment_type: s.paymentType,
      payment_details: s.paymentDetails,
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
    })),
    fastMoving: fastProd.map(r => ({
      id: r.id,
      name: r.name,
      category: r.category,
      value: Number(r.value || 0),
      qty: Number(r.qty || 0),
    })),
    slowMoving: slowProd.map(r => ({
      id: r.id,
      name: r.name,
      category: r.category,
      current_stock: Number(r.current_stock || 0),
      qty: Number(r.qty || 0),
    }))
  };

  // Add ERP / Wholesale specific stats
  if (shop.subscriptionPlan === 'wholesale') {
    const [inventoryValueResult, expiringBatches, recentFeeds] = await Promise.all([
      prisma.$queryRaw<{ total_value: number }[]>`
        SELECT COALESCE(SUM(current_stock * wholesale_cost), 0)::float as total_value
        FROM products
        WHERE shop_id = ${shop.id}::uuid AND current_stock > 0
      `,
      prisma.batch.findMany({
        where: { 
          shopId: shop.id, 
          quantity: { gt: 0 },
          expiryDate: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } // Next 30 days
        },
        include: { product: { select: { name: true } } },
        orderBy: { expiryDate: 'asc' },
        take: 5
      }),
      prisma.$queryRaw`
        SELECT m.id, m.type, m.quantity, m.created_at, p.name as product_name
        FROM stock_movements m
        JOIN products p ON p.id = m.product_id
        WHERE m.shop_id = ${shop.id}::uuid
        ORDER BY m.created_at DESC
        LIMIT 5
      ` as Promise<any[]>
    ]);

    payload.wholesale = {
      inventoryValue: inventoryValueResult[0]?.total_value || 0,
      expiringBatches,
      recentFeeds
    };
  }

  // Cache result
  dashboardCache.set(cacheKey, {
    data: payload,
    timestamp: Date.now()
  });

  return json(payload);
});
