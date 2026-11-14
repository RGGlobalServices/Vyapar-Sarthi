import { Prisma } from '@prisma/client';
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

  // Few round trips matter more than anything else here: the billing screen gives up after 4s and reports "Not found", and every
  // query is a network hop to the database. So: ONE query for the three exact identifiers (company barcode, SKU, carton
  // barcode — most specific wins), and on a miss ONE SQL lookup into the per-variant barcodes (run alongside the HSN check).
  // This used to be five sequential queries that ended by downloading the whole catalogue with its godown joins.
  const lc = barcode.toLowerCase();
  const exact = await prisma.product.findMany({
    where: {
      shopId: shop.id,
      AND: [
        notArchived,
        { OR: [
          { barcode: { equals: barcode, mode: 'insensitive' } },
          { sku: { equals: barcode, mode: 'insensitive' } },
          { cartonBarcode: { equals: barcode, mode: 'insensitive' } },
        ] },
      ],
    },
    include,
    take: 6,
  });
  let product: any =
    exact.find(p => (p.barcode || '').toLowerCase() === lc) ||
    exact.find(p => (p.sku || '').toLowerCase() === lc) ||
    exact.find(p => (p.cartonBarcode || '').toLowerCase() === lc) ||
    null;

  // Per-variant barcodes live in metadata.size_prices[<compositeKey>].barcode. The shared 'PRD-NEW-…' placeholder codes
  // (older Add-form data) belong to many products at once, so they can never identify one. HSN is a tax class shared by many
  // items, so it is only accepted when it points at exactly ONE product.
  let matchedVariant: string | null = null;
  if (!product) {
    const needle = barcode.toUpperCase();
    const variantLookup = /^PRD-NEW(-|$)/i.test(barcode)
      ? Promise.resolve([] as Array<{ id: string; key: string }>)
      : prisma.$queryRaw<Array<{ id: string; key: string }>>(Prisma.sql`
          SELECT p.id::text AS id, e.key AS key
          FROM products p
          CROSS JOIN LATERAL jsonb_each(
            CASE WHEN jsonb_typeof(p.metadata -> 'size_prices') = 'object' THEN p.metadata -> 'size_prices' ELSE '{}'::jsonb END
          ) AS e
          WHERE p.shop_id = ${shop.id}::uuid
            AND p.archived IS NOT TRUE
            AND upper(btrim(e.value ->> 'barcode')) = ${needle}
          LIMIT 1`);
    const [variantRows, hsnRows] = await Promise.all([
      variantLookup,
      prisma.product.findMany({
        where: { shopId: shop.id, hsnCode: { equals: barcode, mode: 'insensitive' }, ...notArchived },
        select: { id: true },
        take: 2,
      }),
    ]);
    const id = variantRows[0]?.id ?? (hsnRows.length === 1 ? hsnRows[0].id : null);
    if (variantRows[0]) matchedVariant = variantRows[0].key;
    if (id) product = await prisma.product.findFirst({ where: { id, shopId: shop.id }, include });
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
