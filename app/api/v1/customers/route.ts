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
