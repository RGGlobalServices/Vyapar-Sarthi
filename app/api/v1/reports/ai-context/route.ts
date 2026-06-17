import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { startOfDay, endOfDay } from '@/lib/server/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  const [productsCount, todaySalesAgg, allProducts] = await Promise.all([
    prisma.product.count({ where: { shopId: shop.id } }),
    prisma.sale.aggregate({
      where: { shopId: shop.id, createdAt: { gte: todayStart, lte: todayEnd } },
      _sum: { totalAmount: true },
    }),
    prisma.product.findMany({ where: { shopId: shop.id }, select: { currentStock: true, minStock: true } }),
  ]);
  const lowStockItems = allProducts.filter((p) => (p.currentStock ?? 0) <= (p.minStock ?? 0)).length;
  return json({
    shopName: shop.name,
    productsCount,
    todaySales: todaySalesAgg._sum.totalAmount || 0,
    lowStockItems,
    subscriptionPlan: shop.subscriptionPlan,
  });
});
