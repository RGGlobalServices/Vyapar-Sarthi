import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Resolve the supplier and assert it belongs to the caller's shop. */
async function getOwnedSupplier(req: Request, id: string) {
  const { shop } = await requireShop(req);
  const supplier = await prisma.supplier.findFirst({ where: { id, shopId: shop.id } });
  if (!supplier) throw new ApiError(404, 'Supplier not found');
  return { shop, supplier };
}

/**
 * GET /api/v1/suppliers/[id]/transactions?from=&to=
 *
 * Full purchase + payment history for one supplier, newest first, and the same
 * rows bucketed by calendar month for the month-wise view. Optional from/to
 * bound the window.
 */
export const GET = handle(async (req, ctx: any) => {
  const { id } = await ctx.params;
  const { supplier } = await getOwnedSupplier(req, id);

  const url = new URL(req.url);
  const fromRaw = url.searchParams.get('from');
  const toRaw = url.searchParams.get('to');
  const from = fromRaw ? new Date(fromRaw) : null;
  const to = toRaw ? new Date(toRaw) : null;
  if (to) to.setHours(23, 59, 59, 999);

  const transactions = await prisma.supplierTransaction.findMany({
    where: {
      supplierId: id,
      ...(from || to
        ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
  });

  // Bucket into months keyed 'YYYY-MM' so the UI can render collapsible
  // month sections without doing date math itself.
  const monthMap = new Map<string, { month: string; purchased: number; paid: number; items: any[] }>();
  for (const t of transactions) {
    const d = t.createdAt ? new Date(t.createdAt) : new Date();
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthMap.has(key)) monthMap.set(key, { month: key, purchased: 0, paid: 0, items: [] });
    const bucket = monthMap.get(key)!;
    const amount = Number(t.amount) || 0;
    if (t.type === 'payment') bucket.paid += amount;
    else bucket.purchased += amount;
    bucket.items.push({
      id: t.id,
      type: t.type,
      amount,
      note: t.note || '',
      billNumber: t.billNumber || '',
      date: t.createdAt,
    });
  }

  const months = [...monthMap.values()].sort((a, b) => b.month.localeCompare(a.month));

  const totalPurchased = transactions
    .filter((t) => t.type !== 'payment')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalPaid = transactions
    .filter((t) => t.type === 'payment')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);

  return json({
    supplier: {
      id: supplier.id,
      name: supplier.name,
      mobile: supplier.mobile || '',
      email: supplier.email || '',
      gst: supplier.gst || '',
      address: supplier.address || '',
      remaining: Number(supplier.balance) || 0,
      documents: (supplier as any).documents || [],
    },
    totals: { totalPurchased, totalPaid, remaining: Number(supplier.balance) || 0 },
    months,
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: Number(t.amount) || 0,
      note: t.note || '',
      billNumber: t.billNumber || '',
      date: t.createdAt,
    })),
  });
});

/**
 * POST /api/v1/suppliers/[id]/transactions
 *
 * Body: { type: 'purchase' | 'payment', amount, date?, note?, billNumber?, paidAmount? }
 *
 * A 'purchase' increases what you owe. When `paidAmount` is also supplied the
 * part-payment is recorded as its own payment row in the same transaction, so
 * "bought ₹10,000, paid ₹3,000 now" is one action and leaves ₹7,000 remaining.
 *
 * `date` backdates the entry — SupplierTransaction.createdAt is @default(now())
 * (not @updatedAt), so an explicit value is allowed and no migration is needed.
 */
export const POST = handle(async (req, ctx: any) => {
  const { id } = await ctx.params;
  const { shop, supplier } = await getOwnedSupplier(req, id);
  const body = await readBody<{
    type?: string;
    amount?: number | string;
    paidAmount?: number | string;
    date?: string;
    note?: string;
    billNumber?: string;
  }>(req);

  const type = body.type === 'payment' ? 'payment' : 'purchase';
  const amount = parseFloat(String(body.amount ?? ''));
  if (!isFinite(amount) || amount <= 0) throw new ApiError(400, 'A positive amount is required');

  const paidAmount = parseFloat(String(body.paidAmount ?? '0'));
  const hasPartPayment = type === 'purchase' && isFinite(paidAmount) && paidAmount > 0;
  if (hasPartPayment && paidAmount > amount) {
    throw new ApiError(400, 'Paid amount cannot be greater than the purchase amount');
  }

  // Backdate when a valid date is given, else record as now.
  let when: Date | undefined;
  if (body.date) {
    const parsed = new Date(body.date);
    if (!isNaN(parsed.getTime())) when = parsed;
  }

  const note = body.note?.trim() || (type === 'payment' ? 'Payment to supplier' : 'Purchase');
  const billNumber = body.billNumber?.trim() || null;

  // Dukan/Vyapar shops track cash paid to suppliers as an Expense so it shows
  // up in the dashboard's Today's/Month's Expenses. Wholesale shops run their
  // own Party/Ledger system and are excluded.
  const trackAsExpense = shop.subscriptionPlan !== 'wholesale';

  const result = await prisma.$transaction(async (tx) => {
    // balance = what is still owed. A purchase adds to it, a payment reduces it.
    const delta = type === 'payment' ? -amount : amount - (hasPartPayment ? paidAmount : 0);

    const created = await tx.supplierTransaction.create({
      data: {
        supplierId: id,
        type,
        amount,
        note,
        billNumber,
        ...(when ? { createdAt: when } : {}),
      },
    });

    const recordPaymentExpense = async (paidNow: number) => {
      const expense = await tx.expense.create({
        data: {
          shopId: shop.id,
          category: 'Supplier Payment',
          amount: paidNow,
          description: `Paid to ${supplier.name}${billNumber ? ` (${billNumber})` : ''}`,
          paymentMode: 'Cash',
          ...(when ? { date: when } : {}),
        },
      });
      await tx.cashBook.create({
        data: {
          shopId: shop.id,
          type: 'expense',
          amount: paidNow,
          referenceId: expense.id,
          description: expense.description!,
          date: expense.date,
        },
      });
    };

    if (type === 'payment' && trackAsExpense) {
      await recordPaymentExpense(amount);
    }

    if (hasPartPayment) {
      await tx.supplierTransaction.create({
        data: {
          supplierId: id,
          type: 'payment',
          amount: paidAmount,
          note: `Paid against ${billNumber || 'purchase'}`,
          billNumber,
          ...(when ? { createdAt: when } : {}),
        },
      });

      if (trackAsExpense) {
        await recordPaymentExpense(paidAmount);
      }
    }

    const updated = await tx.supplier.update({
      where: { id },
      data: { balance: { increment: delta } },
    });

    await tx.activityLog.create({
      data: {
        shopId: shop.id,
        action: type === 'payment' ? 'payment_given' : 'purchase_recorded',
        entityId: created.id,
        details: {
          entityType: 'supplier',
          name: supplier.name,
          amount,
          ...(hasPartPayment ? { paidAmount } : {}),
        },
      },
    }).catch(() => {});

    return { transaction: created, remaining: Number(updated.balance) || 0 };
  });

  return json(result);
});
