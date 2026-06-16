import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  await requireShop(req);
  const { bill_id, items } = await readBody(req);

  if (!bill_id || !items || !items.length) {
    throw new ApiError(400, 'bill_id and items are required');
  }

  const sale = await prisma.sale.findUnique({
    where: { id: bill_id },
    include: { items: true },
  });

  if (!sale) throw new ApiError(404, 'Bill not found');

  for (const ret of items) {
    const saleItem = sale.items.find((si) => si.id === ret.item_id);
    if (!saleItem) continue;

    await prisma.product.update({
      where: { id: saleItem.productId! },
      data: { currentStock: { increment: ret.quantity } },
    });
  }

  return json({ detail: 'Return processed successfully' });
});
