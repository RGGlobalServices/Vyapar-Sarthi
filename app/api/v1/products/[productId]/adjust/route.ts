import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { openVariantStores, adjustVariantStores, closeVariantStores } from '@/lib/variants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ productId: string }> };

export const POST = handle<Ctx>(async (req, { params }) => {
  const { productId } = await params;
  const { shop } = await requireShop(req);
  const { quantity, type, note, variantKey } = await readBody(req);
  const product = await prisma.product.findFirst({ where: { id: productId, shopId: shop.id } });
  if (!product) throw new ApiError(404, 'Product not found');
  const change = type === 'out' ? -Math.abs(quantity) : Math.abs(quantity);
  // A product with colour/size variants keeps its stock per variant: an aggregate-only change would
  // leave currentStock disagreeing with the variant sum (the "stock mismatch" bug), so the caller must
  // say which variant, and both variant stores + the total are moved together.
  const stores = openVariantStores(product);
  const hasVariants = !!(stores.map || stores.rows);
  let storeWrite: ReturnType<typeof closeVariantStores> = {};
  if (hasVariants) {
    if (!variantKey) throw new ApiError(400, 'This product has sizes/colours — choose which size/colour to adjust.');
    const r = adjustVariantStores(stores, String(variantKey), change, { rejectNegative: change < 0 });
    if (r === 'missing') throw new ApiError(400, `"${variantKey}" is not a variant of this product.`);
    if (r === 'insufficient') throw new ApiError(400, `Negative stock is not allowed for "${variantKey}".`);
    storeWrite = closeVariantStores(stores);
  }
  const [updated] = await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: { currentStock: { increment: change }, ...(storeWrite as any) },
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
