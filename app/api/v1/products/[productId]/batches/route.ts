import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ productId: string }> };

/**
 * Live (quantity > 0) lots for one product, oldest-first — what powers the
 * Billing lot-picker (see addToCart in billing/page.tsx and
 * WholesaleBillingUI.tsx). Distinct from batch-hint (a 2-row nudge) and
 * erp-details (all batches including depleted ones, for the Product detail
 * view) — this is the exact "what can I actually sell from" list.
 */
export const GET = handle<Ctx>(async (req, { params }) => {
  const { productId } = await params;
  const { shop } = await requireShop(req, { enforceSubscription: false });
  if (!productId) throw new ApiError(400, 'Product ID required');

  const url = new URL(req.url);
  const variantId = url.searchParams.get('variantId');

  const batches = await prisma.batch.findMany({
    where: {
      productId, shopId: shop.id, quantity: { gt: 0 },
      ...(variantId ? { variantId } : {}),
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, batchNumber: true, quantity: true, initialQuantity: true,
      costPrice: true, sellingPrice: true, purchaseDate: true, expiryDate: true, createdAt: true,
    },
  });

  return json(batches);
});
