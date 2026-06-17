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

  // Recalculate totalDue
  const allTx = await prisma.customer_transactions.findMany({ where: { customer_id: id } });
  const totalDue = allTx.reduce(
    (sum, t) => (t.type === 'udhar' ? sum + (t.amount || 0) : sum - (t.amount || 0)),
    0,
  );
  await prisma.customer.update({ where: { id }, data: { totalDue } });

  return json({ detail: 'Transaction deleted' });
});
