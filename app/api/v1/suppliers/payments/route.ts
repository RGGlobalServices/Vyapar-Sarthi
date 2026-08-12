import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/suppliers/payments
 *
 * Every payment made to any supplier for this shop, flattened into one list —
 * the "click Total Paid" rollup. Unlike pending-bills, this needs no FIFO
 * replay: a payment row is a payment row, full stop.
 *
 * Query params (all optional):
 *   from/to — payment date window
 *   search  — matches supplier name, mobile, or bill number
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);

  const from = q.from ? new Date(q.from) : null;
  const to = q.to ? new Date(q.to) : null;
  if (to) to.setHours(23, 59, 59, 999);

  const dateFilter =
    from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};

  const payments = await prisma.supplierTransaction.findMany({
    where: { type: 'payment', supplier: { shopId: shop.id }, ...dateFilter },
    orderBy: [{ createdAt: 'desc' }, { sequence: 'desc' }],
    include: { supplier: { select: { id: true, name: true, mobile: true } } },
  });

  let rows = payments.map((p) => ({
    id: p.id,
    supplierId: p.supplierId,
    supplierName: p.supplier?.name || '',
    supplierMobile: p.supplier?.mobile || '',
    billNumber: p.billNumber || '',
    note: p.note || '',
    amount: Number(p.amount) || 0,
    date: p.createdAt,
  }));

  if (q.search?.trim()) {
    const needle = q.search.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.supplierName.toLowerCase().includes(needle) ||
        (r.supplierMobile || '').includes(needle) ||
        (r.billNumber || '').toLowerCase().includes(needle)
    );
  }

  const summary = rows.reduce(
    (acc, r) => { acc.totalPaid += r.amount; acc.paymentCount += 1; return acc; },
    { totalPaid: 0, paymentCount: 0 },
  );

  return json({ payments: rows, summary });
});
