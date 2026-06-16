import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const credits = await prisma.dukandarCredit.findMany({
    where: { retailerId: user.uuid! },
    orderBy: { createdAt: 'desc' },
  });

  const enriched = await Promise.all(
    credits.map(async (c) => {
      const wholesaler = await prisma.user.findUnique({ where: { uuid: c.wholesalerId! } });
      const wsShop = await prisma.shop.findFirst({ where: { ownerId: c.wholesalerId! } });
      return {
        id: c.id,
        wholesalerName: wholesaler?.fullName || wholesaler?.name || '',
        wholesalerShop: wsShop?.name || '',
        amount: c.amount,
        description: c.description,
        items: JSON.parse(c.items || '[]'),
        status: c.status,
        dueDate: c.dueDate,
        createdAt: c.createdAt,
      };
    }),
  );

  return json(enriched);
});
