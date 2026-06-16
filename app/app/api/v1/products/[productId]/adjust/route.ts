import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ productId: string }> };

export const POST = handle<Ctx>(async (req, { params }) => {
  const { productId } = await params;
  const { shop } = await requireShop(req);
  const { quantity, type, note } = await readBody(req);
  const product = await prisma.product.findFirst({ where: { id: productId, shopId: shop.id } });
  if (!product) throw new ApiError(404, 'Product not found');
  const change = type === 'out' ? -Math.abs(quantity) : Math.abs(quantity);
  const [updated] = await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: { currentStock: { increment: change } },
    }),
    prisma.stockLog.create({
      data: {
        shopId: shop.id,
        productId,
        type,
        quantity: Math.abs(change),
        note: note || null,
      },
    }),
  ]);
  return json(updated);
});
