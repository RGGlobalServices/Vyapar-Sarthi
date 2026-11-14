import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { isSupplierCredit } from '@/lib/server/ledgerClassification';
import { isWholesaleTierPackage } from '@/lib/config/packageConfig';
import { invalidateDashboardCacheForShop } from '@/lib/server/dashboardCache';

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

  // 1. Fetch full transaction history for this supplier to maintain accurate AP ledger balances,
  // payment allocations, and per-bill status, regardless of UI date filters.
  const allSupplierTransactions = await prisma.supplierTransaction.findMany({
    where: { supplierId: id },
    orderBy: [{ createdAt: 'asc' }, { sequence: 'asc' }],
  });

  // Filter transactions for date window if requested
  const transactions = allSupplierTransactions.filter((t) => {
    if (!t.createdAt) return true;
    const tTime = new Date(t.createdAt).getTime();
    if (from && tTime < from.getTime()) return false;
    if (to && tTime > to.getTime()) return false;
    return true;
  }).reverse(); // Most recent first for history view

  // Compute a payment-due date per purchase from the supplier's own credit terms
  const creditDays = Number((supplier as any).creditDays) || 0;
  const computeDueDate = (created: Date | null | undefined, type: string | null | undefined): Date | null => {
    if (!created || isSupplierCredit(type) || creditDays <= 0) return null;
    return new Date(new Date(created).getTime() + creditDays * 86400000);
  };

  // Bucket into months keyed 'YYYY-MM'
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
  const totalCashPaid = transactions
    .filter((t) => t.type === 'payment' || t.type === 'purchase_return')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalDiscount = transactions
    .filter((t) => t.type === 'discount')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalPaid = totalCashPaid + totalDiscount;

  // Chronological AP ledger replay across ALL supplier transactions.
  // When backdated to the same calendar day, purchases sort BEFORE credits/payments
  // so payments made on a day properly settle against that day's purchases.
  const chronological = [...allSupplierTransactions].sort((a, b) => {
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (at !== bt) return at - bt;
    const aWeight = isSupplierCredit(a.type) ? 2 : 1;
    const bWeight = isSupplierCredit(b.type) ? 2 : 1;
    if (aWeight !== bWeight) return aWeight - bWeight;
    return a.sequence - b.sequence;
  });

  type BillRecord = {
    id: string;
    billNumber: string;
    date: Date | null;
    originalAmount: number;
    remaining: number;
    paidAmount: number;
    dueDate: Date | null;
    status: 'paid' | 'partial' | 'unpaid';
    paymentStatus: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID';
  };

  const allPurchases: BillRecord[] = [];
  const purchasesByBillNum = new Map<string, BillRecord[]>();

  for (const t of chronological) {
    const amount = Number(t.amount) || 0;
    if (!isSupplierCredit(t.type) && amount > 1e-6) {
      const p: BillRecord = {
        id: t.id,
        billNumber: t.billNumber || '',
        date: t.createdAt,
        originalAmount: amount,
        remaining: amount,
        paidAmount: 0,
        dueDate: computeDueDate(t.createdAt, t.type),
        status: 'unpaid',
        paymentStatus: 'UNPAID',
      };
      allPurchases.push(p);
      if (p.billNumber) {
        const list = purchasesByBillNum.get(p.billNumber) || [];
        list.push(p);
        purchasesByBillNum.set(p.billNumber, list);
      }
    }
  }

  // Apply credits/payments: bill-specific allocations first, then FIFO
  for (const t of chronological) {
    if (!isSupplierCredit(t.type)) continue;
    let toApply = Number(t.amount) || 0;
    if (toApply <= 1e-6) continue;

    // 1. If payment explicitly targets a bill number, allocate to open purchases of that bill first
    if (t.billNumber && purchasesByBillNum.has(t.billNumber)) {
      const matchingBills = purchasesByBillNum.get(t.billNumber)!;
      for (const p of matchingBills) {
        if (p.remaining > 1e-6) {
          const take = Math.min(p.remaining, toApply);
          p.remaining = Math.round((p.remaining - take) * 100) / 100;
          p.paidAmount = Math.round((p.paidAmount + take) * 100) / 100;
          toApply = Math.round((toApply - take) * 100) / 100;
          if (toApply <= 1e-6) break;
        }
      }
    }

    // 2. Any remainder (or general payment) settles FIFO against open purchases
    if (toApply > 1e-6) {
      for (const p of allPurchases) {
        if (p.remaining > 1e-6) {
          const take = Math.min(p.remaining, toApply);
          p.remaining = Math.round((p.remaining - take) * 100) / 100;
          p.paidAmount = Math.round((p.paidAmount + take) * 100) / 100;
          toApply = Math.round((toApply - take) * 100) / 100;
          if (toApply <= 1e-6) break;
        }
      }
    }
  }

  // Finalize payment statuses
  for (const p of allPurchases) {
    if (p.remaining <= 0.005) {
      p.remaining = 0;
      p.status = 'paid';
      p.paymentStatus = 'PAID';
    } else if (p.paidAmount > 0.005) {
      p.status = 'partial';
      p.paymentStatus = 'PARTIALLY_PAID';
    } else {
      p.status = 'unpaid';
      p.paymentStatus = 'UNPAID';
    }
  }

  const openNow = new Date();
  const stillOpen = allPurchases.filter((p) => p.remaining > 0.005);

  const billBreakdownById = new Map<string, BillRecord>();
  const billBreakdownByNumber = new Map<string, BillRecord>();
  for (const p of allPurchases) {
    billBreakdownById.set(p.id, p);
    if (p.billNumber) billBreakdownByNumber.set(p.billNumber, p);
  }

  const dueInvoicesCount = stillOpen.length;
  const overdueAmount = stillOpen.reduce(
    (sum, p) => sum + (p.dueDate && p.dueDate < openNow ? p.remaining : 0),
    0
  );

  const dueBills = [...stillOpen]
    .sort((a, b) => (a.date ? new Date(a.date).getTime() : 0) - (b.date ? new Date(b.date).getTime() : 0))
    .map((p) => ({
      id: p.id,
      billNumber: p.billNumber,
      date: p.date,
      originalAmount: p.originalAmount,
      paidAmount: p.paidAmount,
      remaining: p.remaining,
      dueDate: p.dueDate,
      status: p.status,
      paymentStatus: p.paymentStatus,
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
      totalCashPaid,
      totalDiscount,
      remaining: Number(supplier.balance) || 0,
      dueInvoicesCount,
      overdueAmount,
    },
    months,
    dueBills,
    transactions: transactions.map((t) => {
      const bill = t.id ? billBreakdownById.get(t.id) : (t.billNumber ? billBreakdownByNumber.get(t.billNumber) : undefined);
      return {
        id: t.id,
        type: t.type,
        amount: Number(t.amount) || 0,
        note: t.note || '',
        billNumber: t.billNumber || '',
        date: t.createdAt,
        dueDate: computeDueDate(t.createdAt, t.type),
        paymentMethod: (t as any).paymentMethod || null,
        billTotalAmount: bill?.originalAmount ?? null,
        billPaid: bill?.paidAmount ?? null,
        billRemaining: bill?.remaining ?? null,
        billStatus: bill?.status ?? null,
        paymentStatus: bill?.paymentStatus ?? null,
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
  const paymentMethod = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Check', 'DD', 'Mix'].includes(String(body.paymentMethod))
    ? String(body.paymentMethod)
    : null;

  // Backdate when a valid date is given, else record as now.
  let when: Date | undefined;
  if (body.date) {
    const parsed = new Date(body.date);
    if (!isNaN(parsed.getTime())) {
      const todayYMD = new Date().toISOString().slice(0, 10);
      const inputYMD = body.date.slice(0, 10);
      if (inputYMD === todayYMD) {
        when = new Date();
      } else {
        parsed.setHours(23, 59, 59, 999);
        when = parsed;
      }
    }
  }

  const note = body.note?.trim() || (type === 'payment' ? 'Payment to supplier' : 'Purchase');
  const billNumber = body.billNumber?.trim() || null;
  const isExplicitAdvance = (body as any).isAdvance === true || /advance/i.test(note);

  // Dukan/Vyapar shops track cash paid to suppliers as an Expense so it shows
  // up in the dashboard's Today's/Month's Expenses. Wholesale-tier shops
  // (Udyog + Bada Udyog) run their own Party/Ledger system and are excluded.
  const trackAsExpense = !isWholesaleTierPackage(shop.subscriptionPlan);

  const result = await prisma.$transaction(async (tx) => {
    // Overpayment validation
    if (type === 'payment' && !isExplicitAdvance) {
      if (billNumber) {
        const billPurchases = await tx.supplierTransaction.findMany({
          where: { supplierId: id, billNumber, type: 'purchase' }
        });
        const billCredits = await tx.supplierTransaction.findMany({
          where: { supplierId: id, billNumber, type: { in: ['payment', 'purchase_return', 'discount'] } }
        });
        const billTotalAmt = billPurchases.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        const billPaidAmt = billCredits.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        const billRemaining = Math.max(0, billTotalAmt - billPaidAmt);
        if (billPurchases.length > 0 && amount > billRemaining + 0.01) {
          throw new ApiError(400, `Payment amount (₹${amount}) exceeds remaining balance of bill #${billNumber} (₹${billRemaining.toLocaleString('en-IN')})`);
        }
      }

      const currentBalance = Number(supplier.balance) || 0;
      if (currentBalance > 0 && amount > currentBalance + 0.01) {
        throw new ApiError(400, `Payment amount (₹${amount}) exceeds total supplier outstanding balance of ₹${currentBalance.toLocaleString('en-IN')}`);
      }
    }

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
    }).catch(() => { });

    return { transaction: created, remaining: Number(updated.balance) || 0 };
  });

  invalidateDashboardCacheForShop(shop.id);
  return json(result);
});
