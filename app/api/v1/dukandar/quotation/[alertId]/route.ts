import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

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
        sellingPrice: full?.sellingPrice || p.sellingPrice || 0,
        wholesaleCost: full?.wholesaleCost || p.wholesaleCost || 0,
      };
    }),
  );

  return json({
    quotationId: alert.id,
    fromShop: wsShop?.name || wholesaler?.storeName || 'Wholesaler',
    toShop: rtShop?.name || retailer?.storeName || 'Retailer',
    products: fullProducts,
    createdAt: alert.createdAt,
    status: alert.status,
  });
});

export const POST = handle<Ctx>(async (req, { params }) => {
  const { alertId } = await params;
  const user = await requireUser(req);
  const { products } = await readBody(req);

  if (!products || !Array.isArray(products)) {
    throw new ApiError(400, 'products array is required');
  }

  const alert = await prisma.dukandarStockAlert.findUnique({ where: { id: alertId } });
  if (!alert) throw new ApiError(404, 'Alert not found');
  if (alert.wholesalerId !== user.uuid) throw new ApiError(403, 'Unauthorized');

  // Update alert status and products list (with new prices & quantities)
  await prisma.dukandarStockAlert.update({
    where: { id: alertId },
    data: {
      status: 'quotation_sent',
      products: JSON.stringify(products),
      respondedAt: new Date(),
    },
  });

  // Notify retailer
  const wsShop = await prisma.shop.findFirst({ where: { ownerId: user.uuid! } });
  const senderName = wsShop?.name || user.storeName || 'Wholesaler';

  await prisma.userNotification.create({
    data: {
      userId: alert.retailerId,     // recipient = retailer
      title: 'Quotation Received',
      message: `${senderName} has sent a quotation for your stock request.`,
      notificationType: 'dukandar_stock_alert',
      link: `/dukandar-alerts/${alert.id}`,
    },
  });

  return json({ detail: 'Quotation sent successfully' });
});

