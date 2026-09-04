import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { startOfDay } from '@/lib/server/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/products/barcode/:code
 *
 * Exact barcode lookup for the billing scanner.
 *
 * Billing keeps a client-side product list for instant scans, but `GET
 * /products` caps at 2000 rows — so in a shop with a larger catalogue anything
 * past that cap could never be scanned, and reported as "not found" despite
 * existing. This endpoint is the fallback: the screen checks its local list
 * first (no network, no delay) and only calls here on a miss.
 *
 * The response is shaped exactly like one element of `GET /products` —
 * including `godownProducts`, `_count` and `recentlyAdded` — so the scanned
 * product can go straight into the cart with no special-casing.
 *
 * Matching is exact and case-insensitive: a scanner reproduces the stored code
 * verbatim, and a `contains` match risks adding the wrong product to a bill.
 */
export const GET = handle(async (req, ctx: any) => {
  const { shop } = await requireShop(req, { enforceSubscription: false });
  const { code } = await ctx.params;

  const barcode = decodeURIComponent(String(code || '')).trim();
  if (!barcode) return json({ error: 'Barcode is required' }, 400);

  const notArchived = { OR: [{ archived: false }, { archived: null }] as any[] };
  const include = {
    godownProducts: true,
    _count: { select: { godownProducts: { where: { quantity: { gt: 0 } } } } },
  };

  // Resolve in priority order so the most specific identifier wins: the item's
  // own company barcode, then the shop's SKU, then the carton barcode. HSN is
  // last and only accepted when it points at exactly ONE product — an HSN code
  // is a tax class shared by many items, so a multi-match must not silently add
  // the wrong product to a bill.
  let product =
    (await prisma.product.findFirst({
      where: { shopId: shop.id, barcode: { equals: barcode, mode: 'insensitive' }, ...notArchived },
      include,
    })) ||
    (await prisma.product.findFirst({
      where: { shopId: shop.id, sku: { equals: barcode, mode: 'insensitive' }, ...notArchived },
      include,
    })) ||
    (await prisma.product.findFirst({
      where: { shopId: shop.id, cartonBarcode: { equals: barcode, mode: 'insensitive' }, ...notArchived },
      include,
    }));

  if (!product) {
    const byHsn = await prisma.product.findMany({
      where: { shopId: shop.id, hsnCode: { equals: barcode, mode: 'insensitive' }, ...notArchived },
      include,
      take: 2,
    });
    if (byHsn.length === 1) product = byHsn[0];
  }

  // Per-variant barcodes live in metadata.size_prices[<compositeKey>].barcode.
  // Prisma can't filter into a nested JSON path portably, so on a miss we scan
  // the parent products for a code match. Cheap: only fires when nothing else
  // matched, and the shop's product count is bounded.
  let matchedVariant: string | null = null;
  if (!product) {
    const candidates = await prisma.product.findMany({
      where: { shopId: shop.id, ...notArchived },
      include,
    });
    const needle = barcode.toUpperCase();
    outer: for (const p of candidates) {
      const meta = typeof p.metadata === 'string' ? JSON.parse(p.metadata) : (p.metadata || {});
      const sp = (meta && meta.size_prices) || {};
      for (const [variantKey, entry] of Object.entries<any>(sp)) {
        const code = (entry?.barcode || '').toString().trim().toUpperCase();
        if (code && code === needle) {
          product = p as any;
          matchedVariant = variantKey;
          break outer;
        }
      }
    }
  }

  // Batch-specific scan code (e.g. "PROD101-B1", printed per-lot from the
  // Purchases flow) — tried only after every product/variant-level code has
  // missed, so it never shadows the far more common plain product barcode.
  // Purely additive: a matched batch is returned as `matched_batch` and the
  // billing page adds it to the cart's line as `batch_id`, which the billing
  // route then draws stock/cost from directly instead of auto-FIFO-picking.
  let matchedBatch: { id: string; batchNumber: string | null; quantity: number; costPrice: number | null; sellingPrice: number | null; expiryDate: Date | null; isOldest: boolean } | null = null;
  if (!product) {
    const batch = await prisma.batch.findFirst({
      where: { shopId: shop.id, barcode: { equals: barcode, mode: 'insensitive' }, quantity: { gt: 0 } },
      include: { product: { include } },
    });
    if (batch && batch.product && (!batch.product.archived)) {
      product = batch.product as any;
      // Whether this is the oldest live batch for the product — lets the
      // billing UI show a gentle "sell the older lot first" nudge without a
      // second round-trip when the shopkeeper scanned a newer one instead.
      const oldestBatch = await prisma.batch.findFirst({
        where: { shopId: shop.id, productId: batch.productId, quantity: { gt: 0 } },
        orderBy: { createdAt: 'asc' },
      });
      matchedBatch = {
        id: batch.id,
        batchNumber: batch.batchNumber,
        quantity: batch.quantity,
        costPrice: batch.costPrice,
        sellingPrice: batch.sellingPrice,
        expiryDate: batch.expiryDate,
        isOldest: !oldestBatch || oldestBatch.id === batch.id,
      };
    }
  }

  if (!product) return json({ error: 'Product not found', barcode }, 404);

  // Same "+N newly added" figure the list endpoint attaches, so the two
  // sources stay interchangeable. Anchored to today's midnight in the shop's
  // timezone (Asia/Kolkata) — same reasoning as the list endpoint: server-
  // local midnight on a UTC host would drift the reset by 5:30h in India.
  const since = startOfDay();
  const recent = await prisma.stockLog
    .aggregate({
      where: {
        shopId: shop.id,
        productId: product.id,
        quantity: { gt: 0 },
        createdAt: { gte: since },
        type: { in: ['in', 'opening', 'import', 'receive', 'purchase', 'adjustment', 'daily_register_receive'] },
      },
      _sum: { quantity: true },
    })
    .catch(() => null);

  // matched_variant tells the billing UI which colour/size to pre-select
  // (client requirement: "scan variant barcode → that variant lands on bill").
  // matched_batch (when present) tells it which specific lot to bill from
  // instead of letting the server auto-FIFO-pick one.
  return json({ ...product, recentlyAdded: Number(recent?._sum?.quantity) || 0, matched_variant: matchedVariant, matched_batch: matchedBatch });
});
