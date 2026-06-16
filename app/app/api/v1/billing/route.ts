import crypto from 'crypto';
import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const shopId = shop.id;
  const body = await readBody(req);
  const customerId = body.customer_id || null;
  const items = body.items;
  const totalAmount = body.total_amount;
  const totalProfit = body.total_profit;
  const paymentType = body.payment_type;

  if (!items || !items.length) throw new ApiError(400, 'No items in bill');

  const invoice_number = `INV-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

  const sale = await prisma.$transaction(async (tx) => {
    const created = await tx.sale.create({
      data: {
        shopId,
        customerId,
        totalAmount,
        totalProfit,
        paymentType,
        invoice_number,
        items: {
          create: items.map((item: any) => ({
            productId: item.product_id || item.productId,
            unit: item.unit,
            quantity: item.quantity,
            pricePerUnit: item.price_per_unit || item.pricePerUnit,
            marginPerUnit: item.margin_per_unit || item.marginPerUnit,
          })),
        },
      },
      include: { items: true },
    });
    for (const item of items) {
      const pid = item.product_id || item.productId;
      if (!pid) continue;
      await tx.product.update({
        where: { id: pid },
        data: { currentStock: { decrement: item.quantity } },
      });
    }
    if (paymentType === 'Udhar' && customerId) {
      await tx.customer.update({
        where: { id: customerId },
        data: { totalDue: { increment: totalAmount } },
      });
    }
    return created;
  });
  return json(sale, 201);
});

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const sales = await prisma.sale.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: 'desc' },
    include: { customer: { select: { name: true } } },
  });
  return json(
    sales.map((s) => ({
      id: s.id,
      invoice_number: s.invoice_number,
      total_amount: s.totalAmount,
      payment_type: s.paymentType,
      customer_name: s.customer?.name || null,
      created_at: s.createdAt,
    })),
  );
});
