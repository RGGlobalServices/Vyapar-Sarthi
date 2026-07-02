import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const { bill_id, items } = await readBody(req);

  if (!bill_id || !items || !items.length) {
    throw new ApiError(400, 'bill_id and items are required');
  }

  const sale = await prisma.sale.findUnique({
    where: { id: bill_id },
    include: { items: { include: { product: true } } },
  });

  if (!sale) throw new ApiError(404, 'Bill not found');

  for (const ret of items) {
    const saleItem = sale.items.find((si) => si.id === ret.item_id);
    if (!saleItem) continue;

    await prisma.product.update({
      where: { id: saleItem.productId! },
      data: { currentStock: { increment: ret.quantity } },
    });

    const newRet = await prisma.materialReturn.create({
      data: {
        shopId: sale.shopId!,
        productId: saleItem.productId ? saleItem.productId : undefined,
        itemName: ret.name || saleItem.product?.name || 'Unknown Item',
        quantity: ret.quantity,
        reason: ret.reason || 'Customer Return',
        amount: ret.quantity * (ret.price || saleItem.pricePerUnit || 0),
        date: new Date(),
      }
    });

    if (shop.subscriptionPlan === 'wholesale') {
      const latestBatch = await prisma.batch.findFirst({
        where: { productId: saleItem.productId, shopId: shop.id },
        orderBy: { createdAt: 'desc' }
      });
      if (latestBatch) {
        await prisma.batch.update({
          where: { id: latestBatch.id },
          data: { quantity: { increment: ret.quantity } }
        });
      }
      await prisma.$executeRaw`
        INSERT INTO stock_movements (shop_id, product_id, type, quantity, reference_id, created_at)
        VALUES (${shop.id}::uuid, ${saleItem.productId}::uuid, 'return', ${ret.quantity}, ${newRet.id}::uuid, NOW())
      `;
    }
  }

  return json({ detail: 'Return processed successfully' });
});
