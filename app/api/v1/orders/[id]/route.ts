import prisma from '@/lib/server/prisma';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { requireShop } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = handle<Ctx>(async (req, { params }) => {
  const { shop } = await requireShop(req);
  const { id } = await params;
  const data = await readBody<{
    orderNumber: string,
    status: string,
    totalAmount: number,
    direction?: string,
    customerId?: string,
    supplierId?: string,
    expectedDate?: string,
    notes?: string,
  }>(req);

  if (!id) throw new ApiError(400, 'Order ID is required');

  const order = await prisma.order.findFirst({
    where: { id, shopId: shop.id }
  });

  if (!order) throw new ApiError(404, 'Order not found');

  const direction = data.direction === 'outgoing' ? 'outgoing' : 'incoming';
  // Only stamped the first time a status actually becomes "completed" — a
  // later edit that keeps it completed (or un-completes it) doesn't touch
  // this, so it stays a true record of when it finished.
  const completedAt = data.status === 'completed' && order.status !== 'completed' ? new Date() : undefined;

  const updated = await prisma.order.update({
    where: { id },
    data: {
      orderNumber: data.orderNumber,
      status: data.status,
      totalAmount: data.totalAmount,
      direction,
      customerId: direction === 'incoming' ? (data.customerId || null) : null,
      supplierId: direction === 'outgoing' ? (data.supplierId || null) : null,
      expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
      notes: data.notes || null,
      ...(completedAt ? { completedAt } : {}),
    },
    include: { customer: true, supplier: true }
  });

  return json(updated);
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { shop } = await requireShop(req);
  const { id } = await params;

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
