import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query } from '@/lib/server/http';
import { getDateRange } from '@/lib/server/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const { startDate, endDate } = getDateRange(query(req));
  const [salesAgg, profitAgg, customers, products] = await Promise.all([
    prisma.sale.aggregate({
      where: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate } },
      _sum: { totalAmount: true },
    }),
    prisma.sale.aggregate({
      where: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate } },
      _sum: { totalProfit: true },
    }),
    prisma.customer.aggregate({ where: { shopId: shop.id }, _sum: { totalDue: true } }),
    prisma.$queryRaw<{count: number}[]>`
      SELECT COUNT(*)::int as count 
      FROM products 
      WHERE shop_id = ${shop.id}::uuid 
        AND current_stock <= min_stock 
        AND current_stock > 0
    `,
  ]);
  const totalUdhar = customers._sum?.totalDue || 0;
  const lowStockCount = Number((products as any[])[0]?.count || 0);
  return json({
    today_sales: salesAgg._sum.totalAmount || 0,
    today_profit: profitAgg._sum.totalProfit || 0,
    total_udhar: totalUdhar,
    low_stock_count: lowStockCount,
  });
});
