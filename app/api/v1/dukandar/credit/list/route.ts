import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, query } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const { retailerId } = query(req);
  const where: { wholesalerId: string; retailerId?: string } = { wholesalerId: user.uuid! };
  if (retailerId) where.retailerId = retailerId;

  const credits = await prisma.dukandarCredit.findMany({ where, orderBy: { createdAt: 'desc' } });

  const enriched = await Promise.all(
    credits.map(async (c) => {
      const retailer = await prisma.user.findUnique({ where: { uuid: c.retailerId! } });
      const rtShop = await prisma.shop.findFirst({ where: { ownerId: c.retailerId! } });
      return {
        id: c.id,
        retailerName: retailer?.fullName || retailer?.name || '',
        retailerShop: rtShop?.name || '',
        retailerId: c.retailerId,
        amount: c.amount,
        description: c.description,
        items: JSON.parse(c.items || '[]'),
        status: c.status,
        dueDate: c.dueDate,
        createdAt: c.createdAt,
        paidAt: c.paidAt,
      };
    }),
  );

  return json(enriched);
});
