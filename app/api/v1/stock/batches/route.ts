import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Real Batch rows exist (Purchases already creates one per line item) but
// nothing ever fetched them — the Stock page's `batches` state was a
// permanently-disabled `useSWR(null, ...)` stub. This is that missing fetch.
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);

  const batches = await prisma.batch.findMany({
    where: { shopId: shop.id, quantity: { gt: 0 } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  return json(batches);
});
