import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ alertId: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  const { alertId } = await params;
  const user = await requireUser(req);
  const alert = await prisma.dukandarStockAlert.findUnique({ where: { id: alertId } });
  if (!alert) throw new ApiError(404, 'Alert not found');

  const requesterId = user.uuid;
  if (alert.retailerId !== requesterId && alert.wholesalerId !== requesterId) {
    throw new ApiError(403, 'Unauthorized');
  }

  const products = JSON.parse(alert.products || '[]');
  const wholesaler = await prisma.user.findUnique({ where: { uuid: alert.wholesalerId! } });
  const wsShop = await prisma.shop.findFirst({ where: { ownerId: alert.wholesalerId! } });
  const retailer = await prisma.user.findUnique({ where: { uuid: alert.retailerId! } });
  const rtShop = await prisma.shop.findFirst({ where: { ownerId: alert.retailerId! } });

  const fullProducts = await Promise.all(
    products.map(async (p: { id: string } & Record<string, unknown>) => {
      const full = await prisma.product.findUnique({ where: { id: p.id } });
      return {
        ...p,
        sellingPrice: full?.sellingPrice || 0,
        wholesaleCost: full?.wholesaleCost || 0,
      };
    }),
  );

  return json({
    quotationId: alert.id,
    fromShop: wsShop?.name || wholesaler?.storeName || 'Wholesaler',
    toShop: rtShop?.name || retailer?.storeName || 'Retailer',
    products: fullProducts,
    createdAt: alert.createdAt,
  });
});
