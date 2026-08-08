import prisma from '@/lib/server/prisma';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { requireShop } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const url = new URL(req.url);
  const direction = url.searchParams.get('direction'); // 'incoming' | 'outgoing'
  const status = url.searchParams.get('status');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const q = url.searchParams.get('q');

  const where: any = { shopId: shop.id };
  if (direction) where.direction = direction;
  if (status) where.status = status;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(`${to}T23:59:59.999`);
  }
  if (q) {
    where.OR = [
      { orderNumber: { contains: q, mode: 'insensitive' } },
      { customer: { name: { contains: q, mode: 'insensitive' } } },
      { supplier: { name: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const orders = await prisma.order.findMany({
    where,
    include: { customer: true, supplier: true },
    orderBy: { createdAt: 'desc' }
  });
  return json(orders);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const data = await readBody<{
    orderNumber: string,
    direction?: string,
    customerId?: string,
    supplierId?: string,
    totalAmount: number,
    status?: string,
    expectedDate?: string,
    notes?: string,
  }>(req);

  if (!data.orderNumber || typeof data.totalAmount !== 'number') {
    throw new ApiError(400, 'Order number and total amount are required');
  }

  const direction = data.direction === 'outgoing' ? 'outgoing' : 'incoming';

  const order = await prisma.order.create({
    data: {
      shopId: shop.id,
      orderNumber: data.orderNumber,
      direction,
      customerId: direction === 'incoming' ? (data.customerId || null) : null,
      supplierId: direction === 'outgoing' ? (data.supplierId || null) : null,
      totalAmount: data.totalAmount,
      status: data.status || 'pending',
      expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
      notes: data.notes || null,
    },
    include: { customer: true, supplier: true }
  });

  return json(order, 201);
});
