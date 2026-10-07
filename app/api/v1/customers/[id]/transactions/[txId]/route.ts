import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { recordDeletion } from '@/lib/server/trash';
import { isCustomerCredit } from '@/lib/server/ledgerClassification';

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

// PATCH /customers/:id/transactions/:txId — edit amount/note/bill_number
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id, txId } = await params;
  const { shop } = await requireShop(req);
  const customer = await prisma.customer.findFirst({ where: { id, shopId: shop.id } });
  if (!customer) throw new ApiError(404, 'Customer not found');

  const tx = await prisma.customer_transactions.findFirst({ where: { id: txId, customer_id: id } });
  if (!tx) throw new ApiError(404, 'Transaction not found');

  const body = await readBody<{ amount?: number | string; note?: string; bill_number?: string }>(req);
  const newAmount = parseFloat(String(body.amount ?? ''));
  if (!isFinite(newAmount) || newAmount <= 0) throw new ApiError(400, 'A positive amount is required');

  const oldAmount = Number(tx.amount) || 0;
  // Credit transactions (payments) reduce totalDue; debit (udhar/sale) increase it.
  // On edit, reverse old and apply new.
  const sign = isCustomerCredit(tx.type) ? -1 : 1;
  const balanceDelta = sign * (newAmount - oldAmount);

  await prisma.$transaction([
    prisma.customer_transactions.update({
      where: { id: txId },
      data: {
        amount: newAmount,
        ...(body.note !== undefined ? { note: String(body.note).trim() || tx.note } : {}),
        ...(body.bill_number !== undefined ? { bill_number: String(body.bill_number).trim() || tx.bill_number } : {}),
      },
    }),
    prisma.customer.update({
      where: { id },
      data: { totalDue: { increment: balanceDelta } },
    }),
  ]);

  return json({ detail: 'Transaction updated' });
});
