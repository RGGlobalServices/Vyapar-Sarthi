import bcrypt from 'bcryptjs';
import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { startOfDay, endOfDay } from '@/lib/server/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/v1/shop/today-profit — verify profit password then return today's profit
export const POST = handle(async (req) => {
  const { user, shop } = await requireShop(req);
  const { password } = await readBody<{ password?: string }>(req);

  if (!user.profitViewPassword) {
    throw new ApiError(400, 'No profit password set. Please set one in your profile.');
  }
  if (!password) throw new ApiError(400, 'Password is required.');

  const valid = await bcrypt.compare(password, user.profitViewPassword);
  if (!valid) throw new ApiError(401, 'Incorrect profit password.');

  // Today's sales
  const todayStart = startOfDay();
  const todayEnd = endOfDay();

  const sales = await prisma.sale.findMany({
    where: { shopId: shop.id, createdAt: { gte: todayStart, lte: todayEnd } },
    select: { totalAmount: true, totalProfit: true },
  });

  // Note: sales filter by `createdAt` (timestamp) while returns filter by
  // `date` (business date). If a return is logged today for a sale from a
  // prior day the numbers can diverge slightly.
  const returnsSummary = await prisma.materialReturn.aggregate({
    where: { shopId: shop.id, date: { gte: todayStart, lte: todayEnd } },
    _sum: { amount: true },
  });

  const returnsProfitLost = await prisma.$queryRaw<{ profit_lost: number }[]>`
    SELECT SUM(
      r.quantity * (COALESCE(p.selling_price, 0) - COALESCE(p.wholesale_cost, 0))
    )::float as profit_lost
    FROM material_returns r
    LEFT JOIN products p ON r.product_id = p.id
    WHERE r.shop_id = ${shop.id}::uuid AND r.date >= ${todayStart} AND r.date <= ${todayEnd}
  `;

  const marginData = await prisma.$queryRaw<{ total_profit: number, total_amount: number }[]>`
    SELECT SUM(total_profit)::float as total_profit, SUM(total_amount)::float as total_amount
    FROM sales
    WHERE shop_id = ${shop.id}::uuid
  `;

  const totalReturnsAmount = returnsSummary._sum.amount || 0;
  let totalReturnsProfitLost = Number(returnsProfitLost[0]?.profit_lost || 0);

  if (totalReturnsAmount > 0 && totalReturnsProfitLost === 0) {
    const todayGrossSales = sales.reduce((s, r) => s + (r.totalAmount || 0), 0);
    const todayGrossProfit = sales.reduce((s, r) => s + (r.totalProfit || 0), 0);
    
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

  const totalRevenue = sales.reduce((s, r) => s + (r.totalAmount || 0), 0) - totalReturnsAmount;
  const totalProfit = sales.reduce((s, r) => s + (r.totalProfit || 0), 0) - totalReturnsProfitLost;
  const saleCount = sales.length;

  return json({ totalRevenue, totalProfit, saleCount });
});
