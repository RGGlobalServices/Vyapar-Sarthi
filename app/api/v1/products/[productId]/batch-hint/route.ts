import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ productId: string }> };

// Lightweight FIFO hint for manual (non-scan) add-to-cart in Billing — a
// shopkeeper without a barcode scanner just searches/taps a product, so
// there's no scanned batch to compare against (see the scan-path nudge in
// billing/page.tsx). This only tells the UI whether MORE THAN ONE live
// batch exists and, if so, which is oldest — with a single batch there's
// nothing "older" to point them to, so no nudge is worth showing.
export const GET = handle<Ctx>(async (req, { params }) => {
  const { productId } = await params;
  const { shop } = await requireShop(req, { enforceSubscription: false });
  if (!productId) throw new ApiError(400, 'Product ID required');

  const batches = await prisma.batch.findMany({
    where: { productId, shopId: shop.id, quantity: { gt: 0 } },
    orderBy: { createdAt: 'asc' },
    take: 2,
    select: { batchNumber: true, purchaseDate: true },
  });

  return json({
    batchCount: batches.length,
    oldestBatch: batches.length > 1 ? { batchNumber: batches[0].batchNumber, purchaseDate: batches[0].purchaseDate } : null,
  });
});
