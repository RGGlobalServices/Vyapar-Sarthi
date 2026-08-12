import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { softDeleteCustomer } from '@/lib/server/customers';

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
  const { shop, user } = await requireShop(req);
  const { id } = await params;

  // Soft delete by archiving, since they might have ledgers/transactions
  // which would block a hard delete due to foreign key constraints. The row
  // itself is never destroyed, but it's still logged to the trash bin so
  // there's one unified place to find and restore anything deleted —
  // "restore" for a customer means un-prefixing customerType (see
  // /api/v1/admin/trash/[id]/restore), not re-inserting from `data`. Shared
  // with the Udhar delete route (customers/[id]) — see lib/server/customers.ts.
  await softDeleteCustomer(shop.id, id, user.email);

  return json({ success: true });
});
