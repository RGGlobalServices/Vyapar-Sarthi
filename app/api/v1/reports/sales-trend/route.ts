import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { formatDate } from '@/lib/server/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);
  const sales = await prisma.sale.findMany({
    where: { shopId: shop.id, createdAt: { gte: sevenDaysAgo } },
    select: { totalAmount: true, createdAt: true },
  });
  const grouped: Record<string, number> = {};
  for (const sale of sales) {
    const key = formatDate(sale.createdAt!);
    grouped[key] = (grouped[key] || 0) + (sale.totalAmount || 0);
  }
  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = formatDate(d);
    trend.push({ date: key, total: grouped[key] || 0 });
  }
  return json(trend);
});
