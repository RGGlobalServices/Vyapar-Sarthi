import prisma from '@/lib/server/prisma';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { requireShop } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PUT = handle(async (req, { params }) => {
  const { shop } = await requireShop(req);
  const id = params.id;
  const data = await readBody<{ orderNumber: string, status: string, totalAmount: number }>(req);

  if (!id) throw new ApiError(400, 'Order ID is required');

  const order = await prisma.order.findFirst({
    where: { id, shopId: shop.id }
  });

  if (!order) throw new ApiError(404, 'Order not found');

  const updated = await prisma.order.update({
    where: { id },
    data: {
      orderNumber: data.orderNumber,
      status: data.status,
      totalAmount: data.totalAmount
    }
  });

  return json(updated);
});

export const DELETE = handle(async (req, { params }) => {
  const { shop } = await requireShop(req);
  const id = params.id;

  if (!id) throw new ApiError(400, 'Order ID is required');

  const order = await prisma.order.findFirst({
    where: { id, shopId: shop.id }
  });

  if (!order) throw new ApiError(404, 'Order not found');

  await prisma.order.delete({
    where: { id }
  });

  return json({ success: true });
});
