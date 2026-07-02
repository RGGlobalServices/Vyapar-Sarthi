import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;

  if (!id) throw new ApiError(400, 'Alert ID is required');

  const alert = await prisma.dukandarStockAlert.findUnique({
    where: { id },
  });

  if (!alert) throw new ApiError(404, 'Alert not found');

  // Only the retailer (receiver) OR the wholesaler (sender) may view this alert
  const isRetailer = alert.retailerId === user.uuid;
  const isWholesaler = alert.wholesalerId === user.uuid;
  if (!isRetailer && !isWholesaler) throw new ApiError(403, 'Unauthorized');

  const wholesaler = await prisma.user.findUnique({ where: { uuid: alert.wholesalerId! } });
  const wsShop = await prisma.shop.findFirst({ where: { ownerId: alert.wholesalerId! } });
  const retailer = await prisma.user.findUnique({ where: { uuid: alert.retailerId! } });
  const rtShop = await prisma.shop.findFirst({ where: { ownerId: alert.retailerId! } });

  const enriched = {
    id: alert.id,
    wholesalerName: wholesaler?.fullName || wholesaler?.name || '',
    wholesalerShop: wsShop?.name || '',
    retailerName: retailer?.fullName || retailer?.name || '',
    retailerShop: rtShop?.name || '',
    message: alert.message,
    products: JSON.parse(alert.products || '[]'),
    status: alert.status,
    createdAt: alert.createdAt,
    respondedAt: alert.respondedAt,
    // Let client know which role the viewer has so UI can adapt
    viewerRole: isRetailer ? 'retailer' : 'wholesaler',
  };

  return json(enriched);
});

