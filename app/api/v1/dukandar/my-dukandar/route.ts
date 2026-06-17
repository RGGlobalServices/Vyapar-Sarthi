import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const relationships = await prisma.dukandarRelationship.findMany({
    where: { wholesalerId: user.uuid!, status: 'active' },
  });

  const dukandars = await Promise.all(
    relationships.map(async (rel) => {
      const retailer = await prisma.user.findUnique({ where: { uuid: rel.retailerId! } });
      if (!retailer) return null;

      const shop = await prisma.shop.findFirst({ where: { ownerId: rel.retailerId! } });
      let stockAlerts: Array<Record<string, unknown>> = [];
      if (shop) {
        const allProducts = await prisma.product.findMany({
          where: { shopId: shop.id },
          select: { id: true, name: true, currentStock: true, minStock: true, baseUnit: true },
        });
        stockAlerts = allProducts
          .filter((p) => (p.currentStock ?? 0) <= (p.minStock ?? 0))
          .map((p) => ({
            productId: p.id,
            productName: p.name,
            currentStock: p.currentStock,
            minStock: p.minStock,
            unit: p.baseUnit,
          }));
      }
      return {
        id: retailer.uuid,
        email: retailer.email,
        name: retailer.fullName || retailer.name || '',
        shopName: shop?.name || retailer.storeName || '',
        mobile: retailer.mobile || '',
        isActive: !!retailer.isActive,
        stockAlerts,
      };
    }),
  );

  return json(dukandars.filter(Boolean));
});
