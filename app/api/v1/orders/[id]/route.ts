import prisma from '@/lib/server/prisma';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { requireShop } from '@/lib/server/auth';
import { computeItemsAndTotal, type OrderItemInput } from '@/lib/server/orderItems';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = handle<Ctx>(async (req, { params }) => {
  const { shop } = await requireShop(req);
  const { id } = await params;
  const data = await readBody<{
    orderNumber: string,
    status: string,
    totalAmount?: number,
    direction?: string,
    customerId?: string,
    supplierId?: string,
    expectedDate?: string,
    notes?: string,
    items?: OrderItemInput[],
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

  const { items, totalAmount } = computeItemsAndTotal(data.items, Number(data.totalAmount) || order.totalAmount);

  // Line items are replaced wholesale (delete + recreate) rather than diffed
  // in place — simplest correct approach for a handful of rows, and matches
  // how the client always resubmits the full current item list on save.
  const updated = await prisma.$transaction([
    prisma.orderItem.deleteMany({ where: { orderId: id } }),
    prisma.order.update({
      where: { id },
      data: {
        orderNumber: data.orderNumber,
        status: data.status,
        totalAmount,
        direction,
        customerId: direction === 'incoming' ? (data.customerId || null) : null,
        supplierId: direction === 'outgoing' ? (data.supplierId || null) : null,
        expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
        notes: data.notes || null,
        ...(completedAt ? { completedAt } : {}),
        items: items.length > 0 ? { create: items } : undefined,
      },
      include: { customer: true, supplier: true, items: { include: { product: true } } }
    }),
  ]);

  return json(updated[1]);
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
