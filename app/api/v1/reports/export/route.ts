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
  const sales = await prisma.sale.findMany({
    where: { shopId: shop.id, createdAt: { gte: startOfMonth, lte: endOfMonth } },
    orderBy: { createdAt: 'desc' },
    include: {
      customer: { select: { name: true, mobile: true } },
      items: { include: { product: { select: { name: true, baseUnit: true } } } },
    },
  });
  const rows = sales.map((sale) => ({
    billId: sale.id,
    date: sale.createdAt,
    customerName: sale.customer?.name || 'Walk-in',
    customerMobile: sale.customer?.mobile || '',
    paymentType: sale.paymentType,
    totalAmount: sale.totalAmount,
    totalProfit: sale.totalProfit,
    items: sale.items.map((item) => ({
      productName: item.product!.name,
      quantity: item.quantity,
      unit: item.unit,
      pricePerUnit: item.pricePerUnit,
      total: (item.pricePerUnit || 0) * (item.quantity || 0),
    })),
  }));
  const total = sales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return json({ rows, total, period });
});
