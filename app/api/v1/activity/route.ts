import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);
  const take = q.take ? parseInt(q.take) : 50;

  const logs = await prisma.activityLog.findMany({
    where: { shopId: shop.id, ...(q.action ? { action: q.action } : {}) },
    orderBy: { createdAt: 'desc' },
    take: take
  });

  return json(logs);
});
