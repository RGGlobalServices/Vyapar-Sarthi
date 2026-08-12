import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';
import { recordDeletion } from '@/lib/server/trash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; txId: string }> };

// DELETE /customers/:id/transactions/:txId
export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id, txId } = await params;
  const { shop, user } = await requireShop(req);
  const customer = await prisma.customer.findFirst({ where: { id, shopId: shop.id } });
  if (!customer) throw new ApiError(404, 'Customer not found');

  const tx = await prisma.customer_transactions.findFirst({ where: { id: txId, customer_id: id } });
  if (!tx) throw new ApiError(404, 'Transaction not found');

  // A transaction row has no "type" field to corrupt via prefixing (unlike
  // Customer's archived_ convention) — hard-delete + snapshot-restore is
  // correct here, the same shape as Product/Staff/Supplier.
  await recordDeletion({
    shopId: shop.id,
    entityType: 'customer_transaction',
    entityId: tx.id,
    label: tx.note || tx.bill_number,
    data: tx,
    deletedBy: user.email,
  });

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
