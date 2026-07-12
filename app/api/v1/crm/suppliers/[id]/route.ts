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

  const supplier = await prisma.supplier.update({
    where: { id, shopId: shop.id },
    data: {
      name: data.name.trim(),
      mobile: data.mobile?.trim() || '',
      email: data.email?.trim() || '',
      contact: data.contact?.trim() || null,
      gst: data.gst?.trim() || null,
      address: data.address?.trim() || null,
      creditDays: parseInt(data.creditDays) || 0,
      creditLimit: parseFloat(data.creditLimit) || 0,
    },
  });

  return json(supplier);
});

export const DELETE = handle(async (req, { params }: any) => {
  const { shop } = await requireShop(req);
  const { id } = await params;

  await prisma.supplier.delete({
    where: { id, shopId: shop.id }
  });

  return json({ success: true });
});
