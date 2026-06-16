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
    include: { sale: { select: { id: true } } },
  });
  let totalQuantity = 0;
  let totalRevenue = 0;
  let totalProfit = 0;
  const billIds = new Set<string>();
  for (const si of saleItems) {
    totalQuantity += si.quantity || 0;
    totalRevenue += (si.pricePerUnit || 0) * (si.quantity || 0);
    totalProfit += (si.marginPerUnit || 0) * (si.quantity || 0);
    billIds.add(si.sale!.id);
  }
  return json({
    product: {
      id: product.id,
      name: product.name,
      category: product.category,
      currentStock: product.currentStock,
      minStock: product.minStock,
      sellingPrice: product.sellingPrice,
      mrp: product.mrp,
    },
    metrics: { totalQuantity, totalRevenue, totalProfit, totalBills: billIds.size },
  });
});
