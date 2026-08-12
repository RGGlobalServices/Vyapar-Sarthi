import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/crm/pending-bills?entityType=party|customer
 *
 * Every still-open udhar bill across every party (or every retail Udhar
 * customer) for this shop — the "click Total Outstanding" rollup, mirroring
 * app/api/v1/suppliers/pending-bills.
 *
 * Unlike suppliers, a customer_transactions payment row has never been tied
 * to a specific bill (see api/v1/crm/payments — it only ever decrements the
 * aggregate customer.totalDue). So "how much of THIS bill is still pending"
 * doesn't exist anywhere as stored data — it's derived here the same way
 * Suppliers already derives it: replay each customer's own history
 * oldest-first, applying every payment against the oldest still-open udhar
 * bill first (the standard AR assumption absent explicit invoice-level
 * allocation). Sum of the result always equals customer.totalDue.
 *
 * Query params (all optional):
 *   from/to — bill date window
 *   search  — matches entity name, mobile, or bill number
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

  const entities = await prisma.customer.findMany({
    where: { shopId: shop.id, ...customerTypeFilter },
    select: { id: true, name: true, mobile: true },
  });
  if (entities.length === 0) return json({ bills: [], summary: { totalPending: 0, billCount: 0 } });

  const entityIds = entities.map((e) => e.id);
  const entityById = new Map(entities.map((e) => [e.id, e]));

  const allTxns = await prisma.customer_transactions.findMany({
    where: { customer_id: { in: entityIds } },
    orderBy: [{ created_at: 'asc' }],
  });

  const byEntity = new Map<string, typeof allTxns>();
  for (const t of allTxns) {
    if (!t.customer_id) continue;
    if (!byEntity.has(t.customer_id)) byEntity.set(t.customer_id, []);
    byEntity.get(t.customer_id)!.push(t);
  }

  const bills: { id: string; entityId: string; billNumber: string; date: Date | null; originalAmount: number; remaining: number }[] = [];
  for (const [entityId, txns] of byEntity) {
    const openBills: { id: string; billNumber: string; date: Date | null; originalAmount: number; remaining: number }[] = [];
    for (const t of txns) {
      const amount = Number(t.amount) || 0;
      if (t.type === 'payment') {
        let toApply = amount;
        for (const b of openBills) {
          if (toApply <= 0) break;
          const take = Math.min(b.remaining, toApply);
          b.remaining -= take;
          toApply -= take;
        }
        while (openBills.length && openBills[0].remaining <= 1e-6) openBills.shift();
      } else if (amount > 1e-6) {
        // udhar / sale / legacy credit — anything that isn't a payment adds to what's owed.
        openBills.push({ id: t.id, billNumber: t.bill_number || '', date: t.created_at, originalAmount: amount, remaining: amount });
      }
    }
    for (const b of openBills) {
      if (b.remaining <= 1e-6) continue;
      bills.push({ ...b, entityId });
    }
  }

  // GST enrichment — same bill_number = Sale.invoice_number join as /crm/ledger.
  const billNumbers = Array.from(new Set(bills.map((b) => b.billNumber).filter(Boolean)));
  const sales = billNumbers.length > 0
    ? await prisma.sale.findMany({
        where: { shopId: shop.id, invoice_number: { in: billNumbers } },
        select: { invoice_number: true, gstDetails: true, billType: true },
      })
    : [];
  const saleByInvoice = new Map(sales.map((s) => [s.invoice_number, s]));

  let rows = bills
    .filter((b) => (!from || (b.date && b.date >= from)) && (!to || (b.date && b.date <= to)))
    .map((b) => {
      const entity = entityById.get(b.entityId)!;
      const sale = b.billNumber ? saleByInvoice.get(b.billNumber) : undefined;
      const groups: { rate: number }[] = Array.isArray((sale?.gstDetails as any)?.groups) ? (sale!.gstDetails as any).groups : [];
      const gstPercent = sale?.billType === 'gst' && groups.length > 0 ? groups.map((g) => g.rate).join(', ') : null;
      return {
        id: b.id,
        entityId: b.entityId,
        entityName: entity.name || '',
        entityMobile: entity.mobile || '',
        billNumber: b.billNumber,
        date: b.date,
        originalAmount: b.originalAmount,
        remaining: b.remaining,
        gstPercent,
      };
    })
    .sort((a, b) => (a.date ? new Date(a.date).getTime() : 0) - (b.date ? new Date(b.date).getTime() : 0));

  if (q.search?.trim()) {
    const needle = q.search.trim().toLowerCase();
    rows = rows.filter(
      (b) => b.entityName.toLowerCase().includes(needle) || (b.entityMobile || '').includes(needle) || (b.billNumber || '').toLowerCase().includes(needle)
    );
  }

  const summary = rows.reduce(
    (acc, b) => { acc.totalPending += b.remaining; acc.billCount += 1; return acc; },
    { totalPending: 0, billCount: 0 },
  );

  return json({ bills: rows, summary });
});
