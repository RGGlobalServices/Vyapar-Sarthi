import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { softDeleteCustomer } from '@/lib/server/customers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// PUT /customers/:id — update editable profile fields
export const PUT = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const customer = await prisma.customer.findFirst({ where: { id, shopId: shop.id } });
  if (!customer) throw new ApiError(404, 'Customer not found');

  const { name, mobile, email, address, customerType, creditLimit, creditDays } = await readBody(req);
  const updated = await prisma.customer.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(mobile !== undefined && { mobile: mobile.trim() }),
      ...(email !== undefined && { email: email.trim() }),
      ...(address !== undefined && { address: address.trim() }),
      ...(customerType !== undefined && { customerType }),
      ...(creditLimit !== undefined && { creditLimit: Number(creditLimit) || 0 }),
      ...(creditDays !== undefined && { creditDays: Number(creditDays) || 0 }),
    },
  });

  return json(updated);
});

// PATCH /customers/:id — update the uploaded documents list (photos/PDFs)
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const customer = await prisma.customer.findFirst({ where: { id, shopId: shop.id } });
  if (!customer) throw new ApiError(404, 'Customer not found');

  const { documents } = await readBody(req);
  const updated = await prisma.customer.update({
    where: { id },
    data: {
      ...(documents !== undefined && { documents }),
    },
  });

  return json({ id: updated.id, documents: updated.documents });
});

// DELETE /customers/:id — soft-deletes (archives), recoverable from the
// recycle bin for 30 days. Used to hard-delete with zero recovery, unlike
// the identical Party/Customer-tab delete path — unified onto the same
// softDeleteCustomer helper so both surfaces behave the same way.
export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop, user } = await requireShop(req);

  await softDeleteCustomer(shop.id, id, user.email);

  return json({ detail: 'Customer deleted' });
});
