import prisma from '@/lib/server/prisma';
import { requireShop, requireShopScope } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /customers — all customers for this shop with their transactions
export const GET = handle(async (req) => {
  const { shopIds, allShopAccess, ownedShops } = await requireShopScope(req);
  const customers = await prisma.customer.findMany({
    // Excludes soft-deleted customers (customerType prefixed `archived_` by
    // softDeleteCustomer) — without this a "deleted" Udhar customer keeps
    // appearing in this exact list even though the delete succeeded.
    // customerType is nullable, so the exclusion is a separate OR branch
    // rather than a bare NOT — a NULL customerType must never be filtered
    // out just because NOT+startsWith's NULL handling is ambiguous.
    where: {
      shopId: { in: shopIds },
      OR: [
        { customerType: null },
        { NOT: { customerType: { startsWith: 'archived_' } } },
      ],
    },
    include: {
      customer_transactions: {
        orderBy: { created_at: 'desc' },
        take: 5
      }
    },
    orderBy: { name: 'asc' },
    take: 1000 // Prevent massive payload, needs full pagination later
  });

  // Item summary for the Udhar cards, so the shopkeeper sees what was sold without opening the bill.
  // Reuses the existing Sale/SaleItem rows (no new table, no duplicated data) and costs exactly ONE
  // extra query for every bill referenced by the transactions returned above — never one per card.
  // Only 'udhar' rows get a summary: a refund/payment row carrying the same bill number is about part
  // of that bill, so showing the whole bill's items there would mislead. Legacy/manual rows whose
  // bill number matches no sale simply get no summary.
  const billNumbers = new Set<string>();
  for (const c of customers) {
    for (const t of c.customer_transactions || []) {
      if ((t.type || 'udhar') === 'udhar' && t.bill_number) billNumbers.add(t.bill_number);
    }
  }
  type ItemSummary = { items: { name: string; quantity: number; variant: string | null }[]; itemCount: number; totalQty: number };
  const itemsByBill = new Map<string, ItemSummary>();
  if (billNumbers.size) {
    const sales = await prisma.sale.findMany({
      where: { shopId: { in: shopIds }, invoice_number: { in: [...billNumbers] } },
      select: {
        invoice_number: true,
        items: { select: { quantity: true, variant: true, itemName: true, product: { select: { name: true } } } },
      },
    });
    for (const s of sales) {
      if (!s.invoice_number || !s.items.length) continue;
      const lines = s.items.map((i) => ({
        name: i.product?.name || i.itemName || '',
        quantity: Number(i.quantity) || 0,
        variant: i.variant || null,
      }));
      itemsByBill.set(s.invoice_number, {
        // The card shows at most 3 lines, so only the first 3 travel; the totals cover the whole bill.
        items: lines.slice(0, 3),
        itemCount: lines.length,
        totalQty: Math.round(lines.reduce((sum, l) => sum + l.quantity, 0) * 1000) / 1000,
      });
    }
  }

  const shopNameById = new Map(ownedShops.map(s => [s.id, s.name]));

  const mapped = customers.map((c) => ({
    id: c.id,
    name: c.name || '',
    mobile: c.mobile || '',
    email: c.email || '',
    totalDue: c.totalDue || 0,
    createdAt: c.createdAt ? c.createdAt.toISOString() : new Date().toISOString(),
    ...(allShopAccess ? { shopName: c.shopId ? shopNameById.get(c.shopId) : undefined } : {}),
    transactions: (c.customer_transactions || []).reverse().map((t) => ({
      id: t.id,
      type: t.type || 'udhar',
      amount: t.amount || 0,
      note: t.note || '',
      billNumber: t.bill_number || '',
      date: t.created_at ? t.created_at.toISOString() : new Date().toISOString(),
      ...((t.type || 'udhar') === 'udhar' && t.bill_number && itemsByBill.has(t.bill_number)
        ? { itemSummary: itemsByBill.get(t.bill_number) }
        : {}),
    })),
  }));

  return json(mapped);
});

// POST /customers — create a customer
export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const { name, mobile, email } = await readBody(req);
  if (!name?.trim()) throw new ApiError(400, 'Name is required');

  const customer = await prisma.customer.create({
    data: {
      shopId: shop.id,
      name: name.trim(),
      mobile: mobile?.trim() || '',
      email: email?.trim() || '',
      totalDue: 0,
    },
  });

  return json({
    id: customer.id,
    name: customer.name,
    mobile: customer.mobile,
    email: customer.email || '',
    totalDue: 0,
    transactions: [],
  });
});
