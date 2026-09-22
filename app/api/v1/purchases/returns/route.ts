import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/purchases/returns — every purchase-return (debit note) this shop has raised, newest first, with the supplier name,
 * the original purchase invoice number and its items. The Purchases page's per-invoice "Return" button already lets you raise
 * one and shows it inside that one invoice's own detail; this is the standalone history across every supplier/invoice.
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);
  const from = q.start_date || q.from ? new Date(q.start_date || q.from) : null;
  const to = q.end_date || q.to ? new Date(`${q.end_date || q.to}T23:59:59.999`) : null;

  const rows = await prisma.purchaseReturn.findMany({
    where: { shopId: shop.id, ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
    include: {
      supplier: { select: { id: true, name: true, mobile: true } },
      purchaseInvoice: { select: { id: true, invoiceNumber: true } },
      items: { select: { id: true, name: true, variantKey: true, quantity: true, rate: true, amount: true } },
    },
    orderBy: { date: 'desc' },
    take: 500,
  });

  return json({
    rows,
    summary: { count: rows.length, totalAmount: Math.round(rows.reduce((s, r) => s + (r.totalAmount || 0), 0) * 100) / 100 },
  });
});
