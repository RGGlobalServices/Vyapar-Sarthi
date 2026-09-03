import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query } from '@/lib/server/http';
import { isSupplierCredit } from '@/lib/server/ledgerClassification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/suppliers/pending-bills
 *
 * Every still-open bill across every supplier for this shop, flattened into
 * one list — the "click Remaining To Pay" rollup. Same FIFO-replay logic as
 * app/api/v1/suppliers/[id]/transactions/route.ts's dueBills (a bill only
 * counts as pending once payments have been applied oldest-purchase-first),
 * just run once per supplier and concatenated instead of one supplier at a
 * time, so the numbers can never disagree with what a supplier's own detail
 * page shows.
 *
 * Query params (all optional):
 *   from/to — bill date window
 *   search  — matches supplier name, mobile, or bill number
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);

  const from = q.from ? new Date(q.from) : null;
  const to = q.to ? new Date(q.to) : null;
  if (to) to.setHours(23, 59, 59, 999);

  const suppliers = await prisma.supplier.findMany({
    where: { shopId: shop.id },
    select: { id: true, name: true, mobile: true, creditDays: true },
  });
  if (suppliers.length === 0) return json({ bills: [], summary: { totalPending: 0, billCount: 0 } });

  const supplierIds = suppliers.map((s) => s.id);
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));

  // Full chronological history per supplier is needed for a correct FIFO
  // replay regardless of the date window — a payment made last week can
  // still be settling a bill from two months ago. The date filter is
  // applied afterward, to the resulting bills' own dates.
  const allTxns = await prisma.supplierTransaction.findMany({
    where: { supplierId: { in: supplierIds } },
    orderBy: [{ createdAt: 'asc' }, { sequence: 'asc' }],
  });

  const bySupplier = new Map<string, typeof allTxns>();
  for (const t of allTxns) {
    if (!t.supplierId) continue;
    if (!bySupplier.has(t.supplierId)) bySupplier.set(t.supplierId, []);
    bySupplier.get(t.supplierId)!.push(t);
  }

  const computeDueDate = (created: Date | null | undefined, creditDays: number): Date | null => {
    if (!created || creditDays <= 0) return null;
    return new Date(new Date(created).getTime() + creditDays * 86400000);
  };

  const bills: any[] = [];
  for (const [supplierId, txns] of bySupplier) {
    const supplier = supplierById.get(supplierId);
    if (!supplier) continue;
    const creditDays = Number(supplier.creditDays) || 0;

    const openPurchases: { id: string; billNumber: string; date: Date | null; originalAmount: number; remaining: number }[] = [];
    for (const t of txns) {
      const amount = Number(t.amount) || 0;
      if (isSupplierCredit(t.type)) {
        let toApply = amount;
        for (const p of openPurchases) {
          if (toApply <= 0) break;
          const take = Math.min(p.remaining, toApply);
          p.remaining -= take;
          toApply -= take;
        }
        while (openPurchases.length && openPurchases[0].remaining <= 1e-6) openPurchases.shift();
      } else if (amount > 1e-6) {
        openPurchases.push({ id: t.id, billNumber: t.billNumber || '', date: t.createdAt, originalAmount: amount, remaining: amount });
      }
    }

    for (const p of openPurchases) {
      if (p.remaining <= 1e-6) continue;
      if (from && p.date && p.date < from) continue;
      if (to && p.date && p.date > to) continue;
      bills.push({
        id: p.id,
        supplierId,
        supplierName: supplier.name,
        supplierMobile: supplier.mobile || '',
        billNumber: p.billNumber,
        date: p.date,
        dueDate: computeDueDate(p.date, creditDays),
        originalAmount: p.originalAmount,
        remaining: p.remaining,
      });
    }
  }

  bills.sort((a, b) => (a.date ? new Date(a.date).getTime() : 0) - (b.date ? new Date(b.date).getTime() : 0));

  let filtered = bills;
  if (q.search?.trim()) {
    const needle = q.search.trim().toLowerCase();
    filtered = filtered.filter(
      (b) =>
        b.supplierName.toLowerCase().includes(needle) ||
        (b.supplierMobile || '').includes(needle) ||
        (b.billNumber || '').toLowerCase().includes(needle)
    );
  }

  const summary = filtered.reduce(
    (acc, b) => { acc.totalPending += b.remaining; acc.billCount += 1; return acc; },
    { totalPending: 0, billCount: 0 },
  );

  return json({ bills: filtered, summary });
});
