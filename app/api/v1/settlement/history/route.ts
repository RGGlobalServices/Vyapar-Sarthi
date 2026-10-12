import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/settlement/history
 *
 * Returns all past settlement payment transactions (those whose note contains
 * "Settled bill"), enriched with entity names and any paired write-off discount
 * amount. Sorted newest-first.
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);

  // ── Suppliers ────────────────────────────────────────────────────────────
  const suppliers = await prisma.supplier.findMany({
    where: { shopId: shop.id },
    select: { id: true, name: true },
  });
  const supplierIds = suppliers.map((s) => s.id);
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));

  const supplierTxns = supplierIds.length > 0
    ? await prisma.supplierTransaction.findMany({
        where: {
          supplierId: { in: supplierIds },
          note: { contains: 'Settled bill' },
          type: { in: ['payment', 'discount'] },
        },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  // ── Parties ──────────────────────────────────────────────────────────────
  const parties = await prisma.customer.findMany({
    where: { shopId: shop.id, customerType: 'party' },
    select: { id: true, name: true },
  });
  const partyIds = parties.map((p) => p.id);
  const partyById = new Map(parties.map((p) => [p.id, p]));

  const partyTxns = partyIds.length > 0
    ? await prisma.customer_transactions.findMany({
        where: {
          customer_id: { in: partyIds },
          note: { contains: 'Settled bill' },
          type: { in: ['payment', 'discount'] },
        },
        orderBy: { created_at: 'desc' },
      })
    : [];

  // ── Build history items ──────────────────────────────────────────────────
  type HistoryItem = {
    txId: string;
    discountTxId?: string;
    kind: 'payable' | 'receivable';
    entityId: string;
    entityName: string;
    billNumber: string;
    settledAt: Date | null;
    paidAmount: number;
    writeOffAmount: number;
  };

  const extractBillNumber = (note: string | null | undefined) =>
    note?.match(/Settled bill #(.+)$/)?.[1] || '';

  const items: HistoryItem[] = [];

  const supplierPayments = supplierTxns.filter((t) => t.type === 'payment');
  const supplierDiscounts = supplierTxns.filter((t) => t.type === 'discount');

  for (const p of supplierPayments) {
    const billNumber = extractBillNumber(p.note);
    const paired = supplierDiscounts.find(
      (d) => d.supplierId === p.supplierId && d.note?.includes(`Settled bill #${billNumber}`)
    );
    items.push({
      txId: p.id,
      discountTxId: paired?.id,
      kind: 'payable',
      entityId: p.supplierId || '',
      entityName: supplierById.get(p.supplierId || '')?.name || '',
      billNumber,
      settledAt: p.createdAt,
      paidAmount: Number(p.amount) || 0,
      writeOffAmount: paired ? Number(paired.amount) || 0 : 0,
    });
  }

  const partyPayments = partyTxns.filter((t) => t.type === 'payment');
  const partyDiscounts = partyTxns.filter((t) => t.type === 'discount');

  for (const p of partyPayments) {
    const billNumber = extractBillNumber(p.note);
    const paired = partyDiscounts.find(
      (d) => d.customer_id === p.customer_id && d.note?.includes(`Settled bill #${billNumber}`)
    );
    items.push({
      txId: p.id,
      discountTxId: paired?.id,
      kind: 'receivable',
      entityId: p.customer_id || '',
      entityName: partyById.get(p.customer_id || '')?.name || '',
      billNumber,
      settledAt: p.created_at,
      paidAmount: Number(p.amount) || 0,
      writeOffAmount: paired ? Number(paired.amount) || 0 : 0,
    });
  }

  items.sort((a, b) => {
    const ta = a.settledAt ? new Date(a.settledAt).getTime() : 0;
    const tb = b.settledAt ? new Date(b.settledAt).getTime() : 0;
    return tb - ta;
  });

  return json({ items });
});
