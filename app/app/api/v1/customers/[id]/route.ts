import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// PUT /customers/:id — update name / mobile / email
export const PUT = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const customer = await prisma.customer.findFirst({ where: { id, shopId: shop.id } });
  if (!customer) throw new ApiError(404, 'Customer not found');

  const { name, mobile, email } = await readBody(req);
  const updated = await prisma.customer.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(mobile !== undefined && { mobile: mobile.trim() }),
      ...(email !== undefined && { email: email.trim() }),
    },
  });

  return json({ id: updated.id, name: updated.name, mobile: updated.mobile });
});

// DELETE /customers/:id
export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const customer = await prisma.customer.findFirst({ where: { id, shopId: shop.id } });
  if (!customer) throw new ApiError(404, 'Customer not found');

  await prisma.customer_transactions.deleteMany({ where: { customer_id: id } });
  await prisma.customer.delete({ where: { id } });

  return json({ detail: 'Customer deleted' });
});
