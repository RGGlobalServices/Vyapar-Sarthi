import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query } from '@/lib/server/http';
import { getDateRange } from '@/lib/server/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const { startDate, endDate } = getDateRange(query(req));
  const [salesAgg, customers, products, returnsSummary, returnsProfitLost, marginData] = await Promise.all([
    prisma.sale.aggregate({
      where: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate } },
      _sum: { totalAmount: true, totalProfit: true },
    }),
    prisma.customer.aggregate({ where: { shopId: shop.id }, _sum: { totalDue: true } }),
    // Match dashboard route's low-stock criteria for consistency.
    prisma.$queryRaw<{count: number}[]>`
      SELECT COUNT(*)::int as count
      FROM products
      WHERE shop_id = ${shop.id}::uuid
        AND current_stock <= min_stock
        AND min_stock > 0
    `,
    prisma.materialReturn.aggregate({
      where: { shopId: shop.id, date: { gte: startDate, lte: endDate } },
      _sum: { amount: true },
    }),
    prisma.$queryRaw<{ profit_lost: number }[]>`
      SELECT SUM(
        r.quantity * (COALESCE(p.selling_price, 0) - COALESCE(p.wholesale_cost, 0))
      )::float as profit_lost
      FROM material_returns r
      LEFT JOIN products p ON r.product_id = p.id
      WHERE r.shop_id = ${shop.id}::uuid AND r.date >= ${startDate} AND r.date <= ${endDate}
    `,
    prisma.$queryRaw<{ total_profit: number, total_amount: number }[]>`
      SELECT SUM(total_profit)::float as total_profit, SUM(total_amount)::float as total_amount
      FROM sales
      WHERE shop_id = ${shop.id}::uuid
    `,
  ]);
  const totalUdhar = customers._sum?.totalDue || 0;
  const lowStockCount = Number((products as any[])[0]?.count || 0);
  const totalReturnsAmount = returnsSummary._sum.amount || 0;
  let totalReturnsProfitLost = Number(returnsProfitLost[0]?.profit_lost || 0);

  if (totalReturnsAmount > 0 && totalReturnsProfitLost === 0) {
    const todayGrossSales = salesAgg._sum.totalAmount || 0;
    const todayGrossProfit = salesAgg._sum.totalProfit || 0;

    if (todayGrossSales > 0) {
      const todayMargin = todayGrossProfit / todayGrossSales;
      totalReturnsProfitLost = totalReturnsAmount * todayMargin;
    } else {
      const allTimeProfit = Number((marginData as any[])[0]?.total_profit || 0);
      const allTimeSales = Number((marginData as any[])[0]?.total_amount || 0);
      const avgMargin = allTimeSales > 0 ? (allTimeProfit / allTimeSales) : 0.0;
      totalReturnsProfitLost = totalReturnsAmount * avgMargin;
    }
  }

  return json({
    today_sales: (salesAgg._sum.totalAmount || 0) - totalReturnsAmount,
    today_profit: (salesAgg._sum.totalProfit || 0) - totalReturnsProfitLost,
    total_udhar: totalUdhar,
    low_stock_count: lowStockCount,
  });
});
