import prisma from '@/lib/server/prisma';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { requireShop } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const orders = await prisma.order.findMany({
    where: { shopId: shop.id },
    include: { customer: true },
    orderBy: { createdAt: 'desc' }
  });
  return json(orders);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const data = await readBody<{ orderNumber: string, customerId?: string, totalAmount: number, status?: string }>(req);
  
  if (!data.orderNumber || typeof data.totalAmount !== 'number') {
    throw new ApiError(400, 'Order number and total amount are required');
  }

  const order = await prisma.order.create({
    data: {
      shopId: shop.id,
      orderNumber: data.orderNumber,
      customerId: data.customerId || null,
      totalAmount: data.totalAmount,
      status: data.status || 'pending',
    },
    include: { customer: true }
  });

  return json(order, 201);
});
