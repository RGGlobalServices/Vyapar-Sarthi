import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /customers — all customers for this shop with their transactions
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const customers = await prisma.customer.findMany({
    where: { shopId: shop.id },
    include: { 
      customer_transactions: { 
        orderBy: { created_at: 'desc' },
        take: 5 
      } 
    },
    orderBy: { name: 'asc' },
    take: 1000 // Prevent massive payload, needs full pagination later
  });

  const mapped = customers.map((c) => ({
    id: c.id,
    name: c.name || '',
    mobile: c.mobile || '',
    email: c.email || '',
    totalDue: c.totalDue || 0,
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
