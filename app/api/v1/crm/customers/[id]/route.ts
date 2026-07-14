import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PUT = handle(async (req, { params }: any) => {
  const { shop } = await requireShop(req);
  const data = await readBody(req);
  const { id } = await params;

  if (!data.name?.trim()) throw new ApiError(400, 'Name is required');

  const customer = await prisma.customer.update({
    where: { id, shopId: shop.id },
    data: {
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
    },
  });

  return json(customer);
});

export const DELETE = handle(async (req, { params }: any) => {
  const { shop } = await requireShop(req);
  const { id } = await params;

  // Soft delete by archiving, since they might have ledgers/transactions
  // which would block a hard delete due to foreign key constraints.
  const customer = await prisma.customer.findUnique({ where: { id, shopId: shop.id } });
  if (customer) {
    await prisma.customer.update({
      where: { id, shopId: shop.id },
      data: { customerType: `archived_${customer.customerType || 'customer'}` }
    });
  }

  return json({ success: true });
});
