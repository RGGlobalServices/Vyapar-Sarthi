import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const url = new URL(req.url);
  const type = url.searchParams.get('type') || 'customer';

  const customers = await prisma.customer.findMany({
    where: { 
      shopId: shop.id,
      customerType: type 
    },
    include: {
      customer_transactions: {
        orderBy: { created_at: 'desc' },
        take: 5
      }
    },
    orderBy: { name: 'asc' },
  });

  return json(customers);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const data = await readBody(req);

  if (!data.name?.trim()) throw new ApiError(400, 'Name is required');

  const customer = await prisma.customer.create({
    data: {
      shopId: shop.id,
      name: data.name.trim(),
      mobile: data.mobile?.trim() || '',
      email: data.email?.trim() || '',
      customerType: data.customerType || 'customer',
      shopName: data.shopName?.trim() || null,
      gst: data.gst?.trim() || null,
      pan: data.pan?.trim() || null,
      address: data.address?.trim() || null,
      creditDays: parseInt(data.creditDays) || 0,
      creditLimit: parseFloat(data.creditLimit) || 0,
      notes: data.notes?.trim() || null,
      totalDue: parseFloat(data.openingBalance) || 0,
    },
  });

  // If there is an opening balance, record it in the ledger
  if (customer.totalDue && customer.totalDue > 0) {
    await prisma.customer_transactions.create({
      data: {
        customer_id: customer.id,
        type: 'udhar',
        amount: customer.totalDue,
        note: 'Opening Balance',
      }
    });
  }

  return json(customer);
});
