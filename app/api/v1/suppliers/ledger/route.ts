import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/suppliers/ledger
 *
 * One call powers the whole Suppliers screen: every supplier with its
 * purchased / paid / remaining totals, plus shop-wide summary figures.
 *
 * Query params (all optional):
 *   from   — ISO date; only count transactions on/after this date
 *   to     — ISO date; only count transactions on/before this date
 *   status — 'paid' | 'unpaid' | 'partial' (filters the returned list)
 *   search — matches supplier name / mobile
 *
 * Amounts are derived from SupplierTransaction rows so a date filter gives a
 * true "what happened in this window" answer. `remaining` (the live amount
 * still owed) always comes from supplier.balance, which is date-independent —
 * filtering a window must never make an outstanding due look settled.
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);

  const from = q.from ? new Date(q.from) : null;
  const to = q.to ? new Date(q.to) : null;
  if (to) to.setHours(23, 59, 59, 999);

  const dateFilter =
    from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {};

  const suppliers = await prisma.supplier.findMany({
    where: { shopId: shop.id },
    orderBy: { name: 'asc' },
  });

  if (suppliers.length === 0) {
    return json({
      suppliers: [],
      summary: { totalPurchased: 0, totalPaid: 0, totalRemaining: 0, supplierCount: 0, unpaidCount: 0 },
    });
  }

  // Aggregate purchases and payments per supplier in two grouped queries
  // rather than N queries per supplier.
  const supplierIds = suppliers.map((s) => s.id);
  const grouped = await prisma.supplierTransaction.groupBy({
    by: ['supplierId', 'type'],
    where: { supplierId: { in: supplierIds }, ...dateFilter },
    _sum: { amount: true },
    _count: { id: true },
  });

  const totals = new Map<string, { purchased: number; paid: number; txnCount: number }>();
  for (const id of supplierIds) totals.set(id, { purchased: 0, paid: 0, txnCount: 0 });

  for (const row of grouped) {
    if (!row.supplierId) continue;
    const entry = totals.get(row.supplierId);
    if (!entry) continue;
    const amount = row._sum.amount || 0;
    // 'credit' is the legacy type used for opening balances — it means
    // "amount owed to the supplier", same direction as a purchase.
    if (row.type === 'payment') entry.paid += amount;
    else entry.purchased += amount;
    entry.txnCount += row._count.id;
  }

  const rows = suppliers.map((s) => {
    const t = totals.get(s.id) || { purchased: 0, paid: 0, txnCount: 0 };
    const remaining = Number(s.balance) || 0;
    return {
      id: s.id,
      name: s.name,
      mobile: s.mobile || '',
      email: s.email || '',
      gst: s.gst || '',
      address: s.address || '',
      creditDays: s.creditDays || 0,
      creditLimit: s.creditLimit || 0,
      totalPurchased: t.purchased,
      totalPaid: t.paid,
      remaining,
      txnCount: t.txnCount,
      // 'paid' only when nothing is outstanding; 'partial' when something has
      // been paid but a balance survives; otherwise 'unpaid'.
      status: remaining <= 0 ? 'paid' : t.paid > 0 ? 'partial' : 'unpaid',
      createdAt: s.createdAt,
    };
  });

  let filtered = rows;
  if (q.status && ['paid', 'unpaid', 'partial'].includes(q.status)) {
    filtered = filtered.filter((r) => r.status === q.status);
  }
  if (q.search?.trim()) {
    const needle = q.search.trim().toLowerCase();
    filtered = filtered.filter(
      (r) => r.name.toLowerCase().includes(needle) || (r.mobile || '').includes(needle),
    );
  }

  // Summary reflects the filtered set so the cards agree with the list.
  const summary = filtered.reduce(
    (acc, r) => {
      acc.totalPurchased += r.totalPurchased;
      acc.totalPaid += r.totalPaid;
      acc.totalRemaining += r.remaining;
      if (r.remaining > 0) acc.unpaidCount += 1;
      return acc;
    },
    { totalPurchased: 0, totalPaid: 0, totalRemaining: 0, supplierCount: filtered.length, unpaidCount: 0 },
  );

  return json({ suppliers: filtered, summary });
});
