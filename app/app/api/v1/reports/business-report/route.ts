import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const endOfMonth = new Date(startOfMonth);
  endOfMonth.setMonth(endOfMonth.getMonth() + 1);
  endOfMonth.setDate(0);
  endOfMonth.setHours(23, 59, 59, 999);
  const [salesAgg, billsCount, productsCount, customersCount] = await Promise.all([
    prisma.sale.aggregate({
      where: { shopId: shop.id, createdAt: { gte: startOfMonth, lte: endOfMonth } },
      _sum: { totalAmount: true, totalProfit: true },
    }),
    prisma.sale.count({ where: { shopId: shop.id, createdAt: { gte: startOfMonth, lte: endOfMonth } } }),
    prisma.product.count({ where: { shopId: shop.id } }),
    prisma.customer.count({ where: { shopId: shop.id } }),
  ]);
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return json({
    shopName: shop.name,
    period,
    totalSales: salesAgg._sum.totalAmount || 0,
    totalProfit: salesAgg._sum.totalProfit || 0,
    totalBills: billsCount,
    totalProducts: productsCount,
    totalCustomers: customersCount,
    subscriptionPlan: shop.subscriptionPlan,
  });
});
