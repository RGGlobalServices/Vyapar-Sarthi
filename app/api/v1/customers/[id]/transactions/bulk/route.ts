import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';
import { recordDeletion } from '@/lib/server/trash';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// DELETE /customers/:id/transactions/bulk?ids=csv — snapshots + hard-deletes
// each transaction and reverses its effect on totalDue, mirroring the
// single-transaction DELETE route's logic per id.
export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop, user } = await requireShop(req);
  const customer = await prisma.customer.findFirst({ where: { id, shopId: shop.id } });
  if (!customer) throw new ApiError(404, 'Customer not found');

  const url = new URL(req.url);
  const idsParam = url.searchParams.get('ids');
  if (!idsParam) throw new ApiError(400, 'No transaction IDs provided');
  const txIds = idsParam.split(',').filter(Boolean);

  const deleted: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const txId of txIds) {
    try {
      const tx = await prisma.customer_transactions.findFirst({ where: { id: txId, customer_id: id } });
      if (!tx) {
        failed.push({ id: txId, error: 'Not found' });
        continue;
      }

      await recordDeletion({
        shopId: shop.id,
        entityType: 'customer_transaction',
        entityId: tx.id,
        label: tx.note || tx.bill_number,
        data: tx,
        deletedBy: user.email,
      });

      await prisma.customer_transactions.delete({ where: { id: txId } });
      await prisma.customer.update({
        where: { id },
        data: { totalDue: { [tx.type === 'udhar' ? 'decrement' : 'increment']: Number(tx.amount || 0) } },
      });

      deleted.push(txId);
    } catch (error: any) {
      failed.push({ id: txId, error: error.message || 'Delete failed' });
    }
  }

  return json({ success: true, deleted, failed });
});
