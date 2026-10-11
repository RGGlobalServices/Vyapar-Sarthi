import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { isMillBillingPackage } from '@/lib/config/packageConfig';
import { sendToNotPacked } from '@/lib/server/sendToNotPacked';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/mill/send-to-not-packed — Bada Udyog only.
 *
 * Quick Production's by-product output already lands in stock the moment the run is saved (same as a
 * finished good); this is the opt-in extra step for a by-product the shopkeeper wants weighed into bags
 * before it's sold, exactly like Milling -> Not Packed already does for finished goods. Called
 * best-effort right after a production-entry save — a failure here never undoes the run itself.
 *
 *   body: { productId, quantity, unit?, sourceLabel }  — sourceLabel: the run's own batch number, used
 *   both to name the synthetic batch and as the idempotency key if this is ever called twice for it.
 */
export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  if (!isMillBillingPackage((shop as any).packageType)) throw new ApiError(403, 'Not Packed is a Bada Udyog feature.', 'NOT_MILL_SHOP');
  const body = await readBody<any>(req);

  const productId = String(body.productId ?? '').trim();
  const quantity = Number(body.quantity);
  const sourceLabel = String(body.sourceLabel ?? '').trim();
  if (!productId || !(quantity > 0) || !sourceLabel) throw new ApiError(400, 'productId, quantity and sourceLabel are required.', 'MISSING_FIELDS');

  const product = await prisma.product.findFirst({ where: { id: productId, shopId: shop.id }, select: { id: true, name: true, baseUnit: true } });
  if (!product) throw new ApiError(404, 'Product not found', 'PRODUCT_NOT_FOUND');

  const result = await prisma.$transaction(
    (tx) =>
      sendToNotPacked(tx, shop.id, {
        productId, productName: product.name, quantity, unit: body.unit || product.baseUnit || 'kg',
        batchLabel: `${sourceLabel}-BP`, sourceNote: `By-product from Run ${sourceLabel}`,
      }),
    { timeout: 15000 },
  );
  return json({ sent: !!result, ...result }, 201);
});
