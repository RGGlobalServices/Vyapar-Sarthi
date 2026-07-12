import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);

  const suppliers = await prisma.supplier.findMany({
    where: { shopId: shop.id },
    include: {
      supplierTransactions: {
        orderBy: { createdAt: 'desc' },
        take: 5
      }
    },
    orderBy: { name: 'asc' },
  });

  return json(suppliers);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const data = await readBody(req);

  if (!data.name?.trim()) throw new ApiError(400, 'Name is required');

  const supplier = await prisma.supplier.create({
    data: {
      shopId: shop.id,
      name: data.name.trim(),
      mobile: data.mobile?.trim() || '',
      email: data.email?.trim() || '',
      contact: data.contact?.trim() || null,
      gst: data.gst?.trim() || null,
      address: data.address?.trim() || null,
      creditDays: parseInt(data.creditDays) || 0,
      creditLimit: parseFloat(data.creditLimit) || 0,
      balance: parseFloat(data.openingBalance) || 0,
    },
  });

  // If there is an opening balance (amount owed to supplier), record it in the ledger
  if (supplier.balance && supplier.balance > 0) {
    await prisma.supplierTransaction.create({
      data: {
        supplierId: supplier.id,
        type: 'credit',
        amount: supplier.balance,
        note: 'Opening Balance',
      }
    });
  }

  return json(supplier);
});
