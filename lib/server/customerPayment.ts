import type { Prisma } from '@prisma/client';
import prisma from '@/lib/server/prisma';
import { ApiError } from '@/lib/server/http';
import { parseMoney, round2, toPaise } from '@/lib/server/moneyValidation';
import { recordDeletion } from '@/lib/server/trash';

/**
 * Records one real payment against a Customer/Party: decrements totalDue,
 * writes the customer_transactions ledger row, logs to CashBook for cash,
 * and writes an ActivityLog row — the exact logic /api/v1/crm/payments'
 * customer/party branch used to inline. Extracted so the Collection Register
 * (which posts many of these, one per party row, the moment each is saved)
 * and the original single-party "Collect Payment" flow share one path
 * instead of drifting apart.
 *
 * Takes an active `tx` so the caller controls the transaction boundary —
 * always call this inside its own short prisma.$transaction() per payment,
 * never looped across many payments in one transaction (this remote DB's
 * interactive-transaction latency makes that a real timeout risk — see
 * lib/server/purchases.ts's reversePurchaseInvoiceEffects for the same
 * lesson learned the hard way elsewhere in this codebase).
 */
export async function applyCustomerPayment(
  tx: Prisma.TransactionClient,
  params: { shopId: string; customerId: string; amount: number; paymentMode: string; note?: string }
): Promise<{ customerTransactionId: string; customerName: string; customerMobile: string | null; newTotalDue: number }> {
  const { shopId, customerId, paymentMode, note } = params;
  const amount = round2(parseMoney(params.amount, 'amount'));
  if (amount <= 0) throw new ApiError(400, 'Payment amount must be greater than zero');

  const lockedCustomers = await tx.$queryRaw<Array<{ id: string; name: string | null; mobile: string | null; total_due: number | null }>>`
    SELECT id, name, mobile, total_due
    FROM customers
    WHERE id = ${customerId}::uuid AND shop_id = ${shopId}::uuid
    FOR UPDATE
  `;
  if (!lockedCustomers.length) throw new ApiError(404, 'Customer/Party not found');
  const customer = lockedCustomers[0];

  // A payment can never exceed what the customer owes — that would push the
  // balance negative (there is no customer-advance feature).
  const owed = Number(customer.total_due || 0);
  if (toPaise(amount) > toPaise(owed)) {
    throw new ApiError(400, `Payment (${amount}) exceeds the outstanding balance (${round2(Math.max(0, owed))})`, 'PAYMENT_EXCEEDS_DUE');
  }

  const newTotalDue = owed - amount;

  await tx.customer.update({
    where: { id: customerId },
    data: { totalDue: { decrement: amount } },
  });

  const transaction = await tx.customer_transactions.create({
    data: {
      customer_id: customerId,
      type: 'payment',
      amount,
      note: `Payment via ${paymentMode || 'Cash'} - ${note || ''}`.trim(),
    },
  });

  if ((paymentMode || 'Cash').toLowerCase() === 'cash') {
    await tx.cashBook.create({
      data: {
        shopId,
        type: 'collection',
        amount,
        referenceId: transaction.id,
        description: `Payment from Customer: ${customer.name}`,
      },
    });
  }

  await tx.activityLog.create({
    data: {
      shopId,
      action: 'payment_collected',
      entityId: transaction.id,
      details: { entityType: 'customer', name: customer.name, amount },
    },
  });

  return {
    customerTransactionId: transaction.id,
    customerName: customer.name ?? '',
    customerMobile: customer.mobile ?? null,
    newTotalDue,
  };
}

/**
 * Undoes one applyCustomerPayment() — models the existing DELETE handler at
 * app/api/v1/customers/[id]/transactions/[txId]/route.ts exactly (snapshot
 * into the Recycle Bin via recordDeletion, delete the ledger row, restore
 * totalDue), plus one addition that route doesn't do: also removes the
 * matching CashBook row so a reversed cash collection doesn't leave an
 * orphaned entry behind.
 *
 * Deliberately NOT tx-threaded and NOT wrapped in a transaction with its
 * caller's other writes — mirrors that existing route's own sequential,
 * non-transactional style. A caller reversing several entries (e.g.
 * deleting a whole sheet) should call this once per entry in a plain loop,
 * not batch them inside one prisma.$transaction(), for the same remote-DB
 * timeout reason noted on applyCustomerPayment above. Safe to call on an
 * already-reversed transaction id — it's a no-op.
 */
export async function reverseCustomerPayment(params: {
  shopId: string;
  customerId: string;
  customerTransactionId: string;
  deletedBy?: string | null;
}): Promise<void> {
  const { shopId, customerId, customerTransactionId, deletedBy } = params;

  const txRow = await prisma.customer_transactions.findFirst({
    where: { id: customerTransactionId, customer_id: customerId },
  });
  if (!txRow) return;

  await recordDeletion({
    shopId,
    entityType: 'customer_transaction',
    entityId: txRow.id,
    label: txRow.note || txRow.bill_number,
    data: txRow,
    deletedBy,
  });

  await prisma.customer_transactions.delete({ where: { id: customerTransactionId } });

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      totalDue: { [txRow.type === 'udhar' ? 'decrement' : 'increment']: Number(txRow.amount || 0) },
    },
  });

  const cashRow = await prisma.cashBook.findFirst({ where: { shopId, referenceId: customerTransactionId } });
  if (cashRow) await prisma.cashBook.delete({ where: { id: cashRow.id } });
}
