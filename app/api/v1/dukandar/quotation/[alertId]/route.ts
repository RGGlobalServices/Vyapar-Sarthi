import prisma from '@/lib/server/prisma';
import { requireUser, requireShop } from '@/lib/server/auth';
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

  // The alert's product list is wholesaler-editable (POST below), so an id in
  // it is untrusted: only resolve prices for products that belong to one of the
  // retailer's own shops, never an arbitrary product id from another tenant.
  const retailerShopIds = (await prisma.shop.findMany({
    where: { ownerId: alert.retailerId! },
    select: { id: true },
  })).map((s) => s.id);

  const fullProducts = await Promise.all(
    products.map(async (p: { id: string } & Record<string, unknown>) => {
      const full = p?.id
        ? await prisma.product.findFirst({ where: { id: p.id, shopId: { in: retailerShopIds } } })
        : null;
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
  const { user, shop: wsShop } = await requireShop(req, { enforceSubscription: false });
  const { products } = await readBody(req);

  if (!products || !Array.isArray(products)) {
    throw new ApiError(400, 'products array is required');
  }

  const alert = await prisma.dukandarStockAlert.findUnique({ where: { id: alertId } });
  if (!alert) throw new ApiError(404, 'Alert not found');
  if (alert.wholesalerId !== user.uuid) throw new ApiError(403, 'Unauthorized');

  // A quotation may only re-price / re-quantify the products the alert already
  // contained. Accepting arbitrary product ids let a wholesaler point the
  // alert at any product in the database and read its prices via GET.
  const allowedIds = new Set<string>(
    (JSON.parse(alert.products || '[]') as Array<{ id?: string }>).map((p) => p?.id).filter(Boolean) as string[]
  );
  if (products.some((p: { id?: string }) => !p?.id || !allowedIds.has(p.id))) {
    throw new ApiError(400, 'Quotation contains products that are not part of this request');
  }

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
  const senderName = wsShop.name || user.storeName || 'Wholesaler';

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

