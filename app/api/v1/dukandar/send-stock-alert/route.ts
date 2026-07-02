import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const { retailerId } = await readBody(req);
  if (!retailerId) throw new ApiError(400, 'retailerId required');

  const shop = await prisma.shop.findFirst({ where: { ownerId: user.uuid! } });
  if (!shop || shop.subscriptionPlan !== 'wholesale') throw new ApiError(403, 'Udyog plan required');

  const relationship = await prisma.dukandarRelationship.findFirst({
    where: { wholesalerId: user.uuid, retailerId, status: 'active' },
  });
  if (!relationship) throw new ApiError(404, 'Dukandar not found');

  const retailerShop = await prisma.shop.findFirst({ where: { ownerId: retailerId } });
  if (!retailerShop) throw new ApiError(404, 'Retailer shop not found');

  const allProducts = await prisma.product.findMany({
    where: { shopId: retailerShop.id },
    select: { id: true, name: true, currentStock: true, minStock: true, baseUnit: true },
  });

  const lowStockProducts = allProducts.filter((p) => (p.currentStock ?? 0) <= (p.minStock ?? 0));
  if (lowStockProducts.length === 0) {
    throw new ApiError(400, 'No low stock products found for this dukandar');
  }

  const productNames = lowStockProducts.map((p) => p.name).join(', ');
  const message = `Your products are low in stock: ${productNames}. Can I take your order?`;

  const alert = await prisma.dukandarStockAlert.create({
    data: {
      relationshipId: relationship.id,
      wholesalerId: user.uuid,
      retailerId,
      message,
      products: JSON.stringify(lowStockProducts),
      status: 'pending',
    },
  });

  await prisma.userNotification.create({
    data: {
      userId: retailerId,           // recipient = retailer
      title: 'Stock Alert from Wholesaler',
      message,
      notificationType: 'dukandar_stock_alert',
      link: `/dukandar-alerts/${alert.id}`,
    },
  });

  return json({ detail: 'Stock alert sent', alertId: alert.id });
});
