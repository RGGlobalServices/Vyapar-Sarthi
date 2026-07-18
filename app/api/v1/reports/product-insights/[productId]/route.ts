import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query, ApiError } from '@/lib/server/http';
import { getDateRange } from '@/lib/server/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ productId: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  const { productId } = await params;
  const { shop } = await requireShop(req);
  const { startDate, endDate } = getDateRange(query(req));
  const product = await prisma.product.findFirst({ where: { id: productId, shopId: shop.id } });
  if (!product) throw new ApiError(404, 'Product not found');
  const saleItems = await prisma.saleItem.findMany({
    where: { productId, sale: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate } } },
    include: { sale: true },
    orderBy: { sale: { createdAt: 'desc' } }
  });

  let totalQuantity = 0;
  let totalRevenue = 0;
  let totalProfit = 0;
  const billIds = new Set<string>();
  const trendMap = new Map<string, { qty: number, revenue: number }>();
  
  const recentSales = [];

  for (const si of saleItems) {
    const qty = si.quantity || 0;
    const price = si.pricePerUnit || 0;
    const rev = price * qty;
    
    totalQuantity += qty;
    totalRevenue += rev;
    totalProfit += (si.marginPerUnit || 0) * qty;
    billIds.add(si.sale!.id);

    // Trend
    const dateStr = si.sale!.createdAt ? new Date(si.sale!.createdAt).toISOString().split('T')[0] : 'Unknown';
    if (!trendMap.has(dateStr)) trendMap.set(dateStr, { qty: 0, revenue: 0 });
    const t = trendMap.get(dateStr)!;
    t.qty += qty;
    t.revenue += rev;

    // Recent Sales (take top 10)
    if (recentSales.length < 10) {
      recentSales.push({
        date: si.sale!.createdAt ? new Date(si.sale!.createdAt).toLocaleString('en-IN') : 'Unknown',
        qty,
        price,
        total: rev
      });
    }
  }

  const trend = Array.from(trendMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return json({
    product: {
      id: product.id,
      name: product.name,
      category: product.category,
      currentStock: product.currentStock,
      minStock: product.minStock,
      sellingPrice: product.sellingPrice,
      mrp: product.mrp,
      unit: product.baseUnit || 'pcs',
      cost: product.wholesaleCost || 0
    },
    stats: { 
      unitsSold: totalQuantity, 
      revenue: totalRevenue, 
      profit: totalProfit, 
      totalBills: billIds.size 
    },
    trend,
    recentSales
  });
});
