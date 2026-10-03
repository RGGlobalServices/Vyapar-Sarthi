import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/suppliers/payments-log
 *
 * Every SupplierTransaction across every supplier for this shop, newest
 * first, with the supplier's name/mobile joined in — the cross-supplier
 * "money going out" feed the Finance → Payments page needs. Existing
 * /api/v1/suppliers/[id]/transactions only ever looks at one supplier at a
 * time; this is that same table read shop-wide instead.
 *
 * Query params (all optional):
 *   type    — 'payment' | 'purchase' (defaults to all)
 *   search  — matches supplier name, mobile, or bill number
 *   limit   — max rows (default 100)
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);

  const suppliers = await prisma.supplier.findMany({
    where: { shopId: shop.id },
    select: { id: true, name: true, mobile: true },
  });
  if (suppliers.length === 0) return json({ rows: [], summary: { totalPaid: 0, totalPurchased: 0 } });

  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const supplierIds = suppliers.map((s) => s.id);

  const where: any = { supplierId: { in: supplierIds } };
  if (q.type === 'payment' || q.type === 'purchase') where.type = q.type;

  const limit = Math.min(500, Math.max(1, parseInt(q.limit || '100') || 100));

  const txns = await prisma.supplierTransaction.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { sequence: 'desc' }],
    take: limit * 3, // over-fetch a bit before search-filtering below
  });

  let rows = txns.map((t) => {
    const supplier = supplierById.get(t.supplierId || '');
    return {
      id: t.id,
      supplierId: t.supplierId,
      supplierName: supplier?.name || 'Unknown',
      supplierMobile: supplier?.mobile || '',
      type: t.type,
      amount: Number(t.amount) || 0,
      note: t.note || '',
      billNumber: t.billNumber || '',
      paymentMethod: t.paymentMethod || null,
      date: t.createdAt,
    };
  });

  if (q.search?.trim()) {
    const needle = q.search.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.supplierName.toLowerCase().includes(needle) ||
        (r.supplierMobile || '').includes(needle) ||
        (r.billNumber || '').toLowerCase().includes(needle)
    );
  }

  // The totals must cover EVERY matching entry, not just the newest rows shown (they used to be summed after the slice, so Total Paid
  // silently stopped growing once a shop had more than the row limit). With a search the matched rows are the set; without one the database sums.
  let summary = { totalPaid: 0, totalPurchased: 0 };
  if (q.search?.trim()) {
    summary = rows.reduce((acc, r) => {
      if (r.type === 'payment') acc.totalPaid += r.amount;
      else if (r.type === 'purchase') acc.totalPurchased += r.amount;
      return acc;
    }, summary);
  } else {
    const sums = await prisma.supplierTransaction.groupBy({ by: ['type'], where, _sum: { amount: true } });
    for (const g of sums) {
      if (g.type === 'payment') summary.totalPaid = Number(g._sum.amount) || 0;
      else if (g.type === 'purchase') summary.totalPurchased = Number(g._sum.amount) || 0;
    }
  }

  rows = rows.slice(0, limit);

  return json({ rows, summary });
});
