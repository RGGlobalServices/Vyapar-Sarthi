import prisma from '@/lib/server/prisma';
import { readLotVariantKeys } from '@/lib/server/lotColumns';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { receiveLot } from '@/lib/server/lotCreate';
import { packsOfOutputs } from '@/lib/server/packing';

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

  // size/colour each lot was bought for (only once the optional migration 16 has been run)
  const variantKeys = await readLotVariantKeys(prisma, batches.map((b) => b.id));

  // For badaudyog: attach mill pack lines to lots that came from production
  let packByBatchNumber = new Map<string, { packKg: number; packs: number; packType: string }[]>();
  if (shop.packageType === 'badaudyog') {
    const batchNumbers = batches.map((b) => b.batchNumber).filter(Boolean) as string[];
    if (batchNumbers.length) {
      const outputs: any[] = await prisma.$queryRawUnsafe(
        `SELECT id::text AS id, output_lot_number FROM production_outputs WHERE shop_id = $1::uuid AND product_id = $2::uuid AND output_type = 'finished_good' AND output_lot_number = ANY($3::text[])`,
        shop.id, productId, batchNumbers,
      );
      if (outputs.length) {
        const pm = await packsOfOutputs(prisma, outputs.map((o) => o.id));
        for (const o of outputs) {
          packByBatchNumber.set(o.output_lot_number, (pm.get(o.id) || []).map((l) => ({ packKg: l.packKg, packs: l.packs, packType: l.packType })));
        }
      }
    }
  }

  return json(batches.map((b) => ({
    ...b,
    variantKey: variantKeys.get(b.id) ?? null,
    packLines: packByBatchNumber.get(b.batchNumber ?? '') ?? [],
  })));
});

/**
 * New lot for an existing product ("new stock came at a new price"): { batchNumber?, quantity, costPrice?,
 * sellingPrice?, expiryDate?, variantKey?, updateShelfPrice? }. Old lots keep their own prices; only when
 * `updateShelfPrice` is true does the product's own selling price follow this lot.
 */
export const POST = handle<Ctx>(async (req, { params }) => {
  const { productId } = await params;
  const { shop } = await requireShop(req);
  if (!productId) throw new ApiError(400, 'Product ID required');
  const b = await readBody(req);

  const result = await prisma.$transaction(async (tx) => {
    const r = await receiveLot(tx, {
      shopId: shop.id,
      productId,
      batchNumber: b.batchNumber ?? b.batch_number,
      quantity: Number(b.quantity),
      costPrice: b.costPrice ?? b.cost_price,
      sellingPrice: b.sellingPrice ?? b.selling_price,
      expiryDate: b.expiryDate ?? b.expiry_date,
      variantKey: b.variantKey ?? b.variant_key,
    });
    if (b.updateShelfPrice && r.sellingPrice) {
      await tx.product.update({ where: { id: productId, shopId: shop.id }, data: { sellingPrice: r.sellingPrice, ...(r.costPrice ? { costPrice: r.costPrice } : {}) } });
    }
    return r;
  }, { maxWait: 30000, timeout: 60000 });

  return json(result, 201);
});
