import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req, { enforceSubscription: false });

  const transactions = await prisma.paymentTransaction.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      txnid: true,
      amount: true,
      status: true,
      plan: true,
      createdAt: true,
      type: true,
    },
  });

  return json(transactions);
});
