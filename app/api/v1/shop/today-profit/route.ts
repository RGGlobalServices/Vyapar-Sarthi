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

  const totalRevenue = sales.reduce((s, r) => s + (r.totalAmount || 0), 0);
  const totalProfit = sales.reduce((s, r) => s + (r.totalProfit || 0), 0);
  const saleCount = sales.length;

  return json({ totalRevenue, totalProfit, saleCount });
});
