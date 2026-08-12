import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/crm/payments-all?entityType=party|customer
 *
 * Every payment collected from any party (or any retail Udhar customer) for
 * this shop, flattened into one list — the "click Total Collected" rollup.
 * No FIFO replay needed here, unlike pending-bills — a payment row is a
 * payment row regardless of which bill it conceptually cleared.
 *
 * Query params (all optional): from/to (payment date window), search
 * (matches entity name, mobile, or bill number).
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);

  const entityType = q.entityType;
  if (entityType !== 'party' && entityType !== 'customer') {
    throw new ApiError(400, 'entityType must be party or customer');
  }

  const from = q.from ? new Date(q.from) : null;
  const to = q.to ? new Date(q.to) : null;
  if (to) to.setHours(23, 59, 59, 999);

  const customerTypeFilter = entityType === 'party'
    ? { customerType: 'party' }
    : { OR: [{ customerType: null }, { customerType: { not: 'party' } }] };

  const dateFilter = from || to ? { created_at: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};

  const payments = await prisma.customer_transactions.findMany({
    where: { type: 'payment', customers: { shopId: shop.id, ...customerTypeFilter }, ...dateFilter },
    orderBy: { created_at: 'desc' },
    include: { customers: { select: { id: true, name: true, mobile: true } } },
  });

  let rows = payments.map((p) => ({
    id: p.id,
    entityId: p.customer_id,
    entityName: p.customers?.name || '',
    entityMobile: p.customers?.mobile || '',
    billNumber: p.bill_number || '',
    note: p.note || '',
    amount: Number(p.amount) || 0,
    date: p.created_at,
  }));

  if (q.search?.trim()) {
    const needle = q.search.trim().toLowerCase();
    rows = rows.filter(
      (r) => r.entityName.toLowerCase().includes(needle) || (r.entityMobile || '').includes(needle) || (r.billNumber || '').toLowerCase().includes(needle)
    );
  }

  const summary = rows.reduce(
    (acc, r) => { acc.totalPaid += r.amount; acc.paymentCount += 1; return acc; },
    { totalPaid: 0, paymentCount: 0 },
  );

  return json({ payments: rows, summary });
});
