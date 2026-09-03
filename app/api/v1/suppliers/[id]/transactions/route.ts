import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { isSupplierCredit } from '@/lib/server/ledgerClassification';

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
    // sequence (insertion order) breaks ties among rows backdated to the same
    // calendar day, which otherwise share the identical midnight timestamp —
    // see the schema comment on SupplierTransaction.sequence.
    orderBy: [{ createdAt: 'desc' }, { sequence: 'desc' }],
  });

  // Compute a payment-due date per purchase from the supplier's own credit
  // terms — dueDate = purchaseDate + creditDays. Doing this at read time
  // (instead of persisting a column) avoids a schema change AND keeps the
  // due date in sync when the shopkeeper edits the terms later. Payments
  // don't have a due date. When creditDays is 0, no due date is set.
  const creditDays = Number((supplier as any).creditDays) || 0;
  const computeDueDate = (created: Date | null | undefined, type: string | null | undefined): Date | null => {
    if (!created || isSupplierCredit(type) || creditDays <= 0) return null;
    return new Date(new Date(created).getTime() + creditDays * 86400000);
  };

  // Bucket into months keyed 'YYYY-MM' so the UI can render collapsible
  // month sections without doing date math itself.
  const monthMap = new Map<string, { month: string; purchased: number; paid: number; items: any[] }>();
  for (const t of transactions) {
    const d = t.createdAt ? new Date(t.createdAt) : new Date();
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthMap.has(key)) monthMap.set(key, { month: key, purchased: 0, paid: 0, items: [] });
    const bucket = monthMap.get(key)!;
    const amount = Number(t.amount) || 0;
    if (isSupplierCredit(t.type)) bucket.paid += amount;
    else bucket.purchased += amount;
    bucket.items.push({
      id: t.id,
      type: t.type,
      amount,
      note: t.note || '',
      billNumber: t.billNumber || '',
      date: t.createdAt,
      dueDate: computeDueDate(t.createdAt, t.type),
    });
  }

  const months = [...monthMap.values()].sort((a, b) => b.month.localeCompare(a.month));

  const totalPurchased = transactions
    .filter((t) => !isSupplierCredit(t.type))
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalPaid = transactions
    .filter((t) => isSupplierCredit(t.type))
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);

  // Due Invoices / Overdue Amount: the ledger only tracks an aggregate
  // balance, not which payment paid off which purchase, so we derive both by
  // replaying the full history oldest-first and applying each payment FIFO
  // against the oldest still-open purchases — the same assumption real AP
  // ledgers use absent explicit invoice-level payment allocation. The sum of
  // the resulting open purchases' remaining amounts always equals
  // supplier.balance, so these numbers stay consistent with "Outstanding".
  const chronological = [...transactions].sort((a, b) => {
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return at - bt || a.sequence - b.sequence;
  });
  // allPurchases is append-only (unlike a shift()-ing queue) so a fully
  // settled bill is still available afterward for the per-bill Total/Paid/
  // Remaining/Status breakdown below — only the FIFO application below skips
  // already-settled entries via cursor, it never removes them.
  const allPurchases: {
    id: string; billNumber: string; date: Date | null; originalAmount: number;
    remaining: number; dueDate: Date | null;
  }[] = [];
  let fifoCursor = 0;
  for (const t of chronological) {
    const amount = Number(t.amount) || 0;
    if (isSupplierCredit(t.type)) {
      let toApply = amount;
      while (toApply > 1e-6 && fifoCursor < allPurchases.length) {
        const p = allPurchases[fifoCursor];
        const take = Math.min(p.remaining, toApply);
        p.remaining -= take;
        toApply -= take;
        if (p.remaining <= 1e-6) fifoCursor++;
        else break;
      }
    } else if (amount > 1e-6) {
      // Skip zero/negligible-amount purchase rows entirely — pushing one
      // with nothing owed would sit in the queue forever counted as "open"
      // unless a later payment happens to trigger the front-of-queue sweep
      // above.
      allPurchases.push({
        id: t.id,
        billNumber: t.billNumber || '',
        date: t.createdAt,
        originalAmount: amount,
        remaining: amount,
        dueDate: computeDueDate(t.createdAt, t.type),
      });
    }
  }
  const openNow = new Date();
  const stillOpen = allPurchases.filter((p) => p.remaining > 1e-6);

  // Per-bill Total/Paid/Remaining/Status lookup, keyed by bill number, for
  // the exported statement — covers every bill (settled or not), unlike
  // stillOpen/dueBills above which only track what's currently outstanding.
  const billBreakdownByNumber = new Map<string, { totalAmount: number; paid: number; remaining: number; status: 'paid' | 'partial' | 'unpaid' }>();
  for (const p of allPurchases) {
    if (!p.billNumber) continue;
    const paid = Math.max(0, p.originalAmount - p.remaining);
    const status: 'paid' | 'partial' | 'unpaid' = p.remaining <= 1e-6 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    billBreakdownByNumber.set(p.billNumber, { totalAmount: p.originalAmount, paid, remaining: Math.max(0, p.remaining), status });
  }
  const dueInvoicesCount = stillOpen.length;
  const overdueAmount = stillOpen.reduce(
    (sum, p) => sum + (p.dueDate && p.dueDate < openNow ? p.remaining : 0),
    0
  );
  // Per-bill breakdown for the "pay against this bill" picker — oldest first,
  // matching the FIFO order payments actually settle in, so the bill at the
  // top of the list is also the one a payment would apply to first.
  const dueBills = [...stillOpen]
    .sort((a, b) => (a.date ? new Date(a.date).getTime() : 0) - (b.date ? new Date(b.date).getTime() : 0))
    .map((p) => ({
      id: p.id,
      billNumber: p.billNumber,
      date: p.date,
      originalAmount: p.originalAmount,
      remaining: p.remaining,
      dueDate: p.dueDate,
    }));

  return json({
    supplier: {
      id: supplier.id,
      name: supplier.name,
      contact: supplier.contact || '',
      mobile: supplier.mobile || '',
      email: supplier.email || '',
      gst: supplier.gst || '',
      address: supplier.address || '',
      remaining: Number(supplier.balance) || 0,
      creditLimit: Number((supplier as any).creditLimit) || 0,
      creditDays: Number((supplier as any).creditDays) || 0,
      documents: (supplier as any).documents || [],
    },
    totals: {
      totalPurchased,
      totalPaid,
      remaining: Number(supplier.balance) || 0,
      dueInvoicesCount,
      overdueAmount,
    },
    months,
    dueBills,
    transactions: transactions.map((t) => {
      const bill = t.billNumber ? billBreakdownByNumber.get(t.billNumber) : undefined;
      return {
        id: t.id,
        type: t.type,
        amount: Number(t.amount) || 0,
        note: t.note || '',
        billNumber: t.billNumber || '',
        date: t.createdAt,
        dueDate: computeDueDate(t.createdAt, t.type),
        paymentMethod: (t as any).paymentMethod || null,
        // Bill-level context (total/paid/remaining/status) attached from the
        // FIFO breakdown above — only present when the row carries a bill
        // number that matches a purchase; blank for freehand entries.
        billTotalAmount: bill?.totalAmount ?? null,
        billPaid: bill?.paid ?? null,
        billRemaining: bill?.remaining ?? null,
        billStatus: bill?.status ?? null,
      };
    }),
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
    paymentMethod?: string;
  }>(req);

  const type = body.type === 'payment' ? 'payment' : 'purchase';
  const amount = parseFloat(String(body.amount ?? ''));
  if (!isFinite(amount) || amount <= 0) throw new ApiError(400, 'A positive amount is required');

  const paidAmount = parseFloat(String(body.paidAmount ?? '0'));
  const hasPartPayment = type === 'purchase' && isFinite(paidAmount) && paidAmount > 0;
  if (hasPartPayment && paidAmount > amount) {
    throw new ApiError(400, 'Paid amount cannot be greater than the purchase amount');
  }

  // Only meaningful for an actual payment event (standalone payment, or the
  // part-payment leg of a purchase) — a plain purchase row isn't a payment.
  const paymentMethod = ['Cash', 'UPI', 'Card'].includes(String(body.paymentMethod))
    ? String(body.paymentMethod)
    : 'Cash';

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
        ...(type === 'payment' ? { paymentMethod } : {}),
        ...(when ? { createdAt: when } : {}),
      },
    });

    // Only a Cash payment moves the physical drawer, so only Cash writes a
    // CashBook row — same convention Billing already uses (UPI/Card sales
    // never touch CashBook either). The Expense record itself is still
    // created for every method since the money left the business either way.
    const recordPaymentExpense = async (paidNow: number) => {
      const expense = await tx.expense.create({
        data: {
          shopId: shop.id,
          category: 'Supplier Payment',
          amount: paidNow,
          description: `Paid to ${supplier.name}${billNumber ? ` (${billNumber})` : ''}`,
          paymentMode: paymentMethod,
          ...(when ? { date: when } : {}),
        },
      });
      if (paymentMethod === 'Cash') {
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
      }
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
          paymentMethod,
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
