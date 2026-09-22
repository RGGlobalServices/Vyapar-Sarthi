import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { parseMoney, round2, toPaise } from '@/lib/server/moneyValidation';
import { invalidateDashboardCacheForShop } from '@/lib/server/dashboardCache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// POST /customers/:id/transactions — add udhar or payment
export const POST = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);

  const { type, amount, note, billNumber, date } = await readBody(req);
  if (!type || amount === undefined || amount === null) throw new ApiError(400, 'type and non-negative amount required');
  if (!['udhar', 'payment'].includes(type)) throw new ApiError(400, 'type must be udhar or payment');
  const amt = round2(parseMoney(amount, 'amount'));
  if (amt < 0) throw new ApiError(400, 'type and non-negative amount required');

  const txRow = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string; total_due: number | null; credit_limit: number | null }>>`
      SELECT id, total_due, credit_limit
      FROM customers
      WHERE id = ${id}::uuid AND shop_id = ${shop.id}::uuid
      FOR UPDATE
    `;
    if (!locked.length) throw new ApiError(404, 'Customer not found');
    const customer = locked[0];

    const currentDue = Number(customer.total_due || 0);

    // A payment cannot exceed the outstanding balance (no negative balances).
    if (type === 'payment' && toPaise(amt) > toPaise(currentDue)) {
      throw new ApiError(400, `Payment (${amt}) exceeds the outstanding balance (${round2(Math.max(0, currentDue))})`, 'PAYMENT_EXCEEDS_DUE');
    }

    // Credit limit check on udhar additions
    if (type === 'udhar' && (customer.credit_limit ?? 0) > 0) {
      if (currentDue + amt > customer.credit_limit!) {
        throw new ApiError(400, `Credit Limit of ₹${customer.credit_limit} exceeded by ₹${(currentDue + amt) - customer.credit_limit!}`, 'CREDIT_LIMIT_EXCEEDED');
      }
    }

    const createdTx = await tx.customer_transactions.create({
      data: {
        customer_id: id,
        type,
        amount: amt,
        note: note || '',
        bill_number: billNumber || '',
        created_at: date ? new Date(date) : new Date(),
      },
    });

    await tx.customer.update({
      where: { id },
      data: {
        totalDue: {
          [type === 'udhar' ? 'increment' : 'decrement']: amt
        }
      }
    });

    return createdTx;
  }, { maxWait: 30000, timeout: 60000 });

  invalidateDashboardCacheForShop(shop.id);
  return json({
    id: txRow.id,
    type: txRow.type,
    amount: txRow.amount,
    note: txRow.note,
    billNumber: txRow.bill_number,
    date: txRow.created_at?.toISOString(),
  });
});
