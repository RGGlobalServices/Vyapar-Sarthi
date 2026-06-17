import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const alerts = await prisma.dukandarStockAlert.findMany({
    where: { retailerId: user.uuid! },
    orderBy: { createdAt: 'desc' },
  });

  const enriched = await Promise.all(
    alerts.map(async (a) => {
      const wholesaler = await prisma.user.findUnique({ where: { uuid: a.wholesalerId! } });
      const wsShop = await prisma.shop.findFirst({ where: { ownerId: a.wholesalerId! } });
      return {
        id: a.id,
        wholesalerName: wholesaler?.fullName || wholesaler?.name || '',
        wholesalerShop: wsShop?.name || '',
        message: a.message,
        products: JSON.parse(a.products || '[]'),
        status: a.status,
        createdAt: a.createdAt,
        respondedAt: a.respondedAt,
      };
    }),
  );

  return json(enriched);
});
