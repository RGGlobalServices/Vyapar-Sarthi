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
      const [retailer, shops] = await Promise.all([
        prisma.user.findUnique({ where: { uuid: rel.retailerId! } }),
        prisma.shop.findMany({ where: { ownerId: rel.retailerId! } }),
      ]);
      if (!retailer) return null;

      const activeShop = shops[0] || null;

      let stockAlerts: Array<Record<string, unknown>> = [];
      if (activeShop) {
        const allProducts = await prisma.product.findMany({
          where: { shopId: activeShop.id },
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
        relationshipId: rel.id,
        id: retailer.uuid,
        email: retailer.email,
        name: retailer.fullName || retailer.name || '',
        mobile: retailer.mobile || '',
        isActive: !!retailer.isActive,
        shops: shops.map(s => ({ id: s.id, name: s.name || retailer.storeName || 'Unnamed Shop' })),
        selectedShopId: activeShop?.id || null,
        shopName: activeShop?.name || retailer.storeName || '',
        stockAlerts,
      };
    }),
  );

  return json(dukandars.filter(Boolean));
});
