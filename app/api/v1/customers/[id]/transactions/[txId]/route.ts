import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; txId: string }> };

// DELETE /customers/:id/transactions/:txId
export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id, txId } = await params;
  const { shop } = await requireShop(req);
  const customer = await prisma.customer.findFirst({ where: { id, shopId: shop.id } });
  if (!customer) throw new ApiError(404, 'Customer not found');

  const tx = await prisma.customer_transactions.findFirst({ where: { id: txId, customer_id: id } });
  if (!tx) throw new ApiError(404, 'Transaction not found');

  await prisma.customer_transactions.delete({ where: { id: txId } });

  // Atomic update to reverse the transaction's effect
  await prisma.customer.update({
    where: { id },
    data: {
      totalDue: {
        [tx.type === 'udhar' ? 'decrement' : 'increment']: Number(tx.amount || 0)
      }
    }
  });

  return json({ detail: 'Transaction deleted' });
});
