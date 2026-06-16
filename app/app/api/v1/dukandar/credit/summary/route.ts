import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Summary = { total: number; pending: number; paid: number; name: string; shop: string };

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const credits = await prisma.dukandarCredit.findMany({ where: { wholesalerId: user.uuid! } });

  const summary: Record<string, Summary> = {};
  for (const c of credits) {
    const key = c.retailerId!;
    if (!summary[key]) {
      const retailer = await prisma.user.findUnique({ where: { uuid: key } });
      const rtShop = await prisma.shop.findFirst({ where: { ownerId: key } });
      summary[key] = {
        total: 0,
        pending: 0,
        paid: 0,
        name: retailer?.fullName || retailer?.name || '',
        shop: rtShop?.name || '',
      };
    }
    summary[key].total += c.amount ?? 0;
    if (c.status === 'pending') summary[key].pending += c.amount ?? 0;
    else if (c.status === 'paid') summary[key].paid += c.amount ?? 0;
  }

  return json(summary);
});
