import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';
import { assertMillEligibleShop } from '@/lib/server/billingCharges';
import { MILL_CHARGE_KEYS, MILL_PRICING_MODEL, type MillChargeKey } from '@/lib/millBilling';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ identifier: string }> };

// Legacy wholesale billing folded these charges into the bill as plain SaleItems (see lib/invoice-helpers.ts).
// In a mill_v2 cart they become CHARGE VALUES — never goods lines. Packing has no mill_v2 key → 'other' (approved).
const LEGACY_CHARGE_TO_KEY: Record<string, MillChargeKey> = {
  'Transport Charges': 'freight',
  'Loading Charges': 'loading',
  'Packing Charges': 'other',
  'Other Charges': 'other',
};

/**
 * GET /billing/:identifier/duplicate-preview — what a "duplicate this invoice into a mill_v2 cart" would carry.
 *
 * Server-authoritative: everything is decided from the SOURCE invoice's own stored data; the target model comes from the
 * shop (Bada Udyog + confirmed), never from the client. Phase 1 rules:
 *   • legacy NON-GST invoice → allowed AS-IS (rates copied unchanged), and the copy must stay NON-GST
 *   • legacy GST invoice     → BLOCKED (the historical GST rate cannot be recovered reliably; the conversion engine is
 *                               deliberately not built yet). No rate is ever inferred from the current product.
 *   • mill_v2 invoice        → as-is (its rates are already GST-exclusive)
 * The client sends `duplicated_from` back with the new bill so POST /billing re-enforces the same rules.
 */
export const GET = handle<Ctx>(async (req, { params }) => {
  const { identifier } = await params;
  const { shop } = await requireShop(req);
  assertMillEligibleShop(shop as any);
  const shopId = shop.id;

  const cleanId = identifier.replace(/^INV[-_]?/i, '').replace(/[^a-zA-Z0-9]/g, '');
  const invVariants = [`INV-${cleanId}`, `INV_${cleanId}`, `INV${cleanId}`, cleanId];
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
  const isHexSegment = /^[0-9a-f]{8,}$/i.test(cleanId);
  const include = { items: { include: { product: { select: { id: true, name: true } } } } };

  let sale: any = await prisma.sale.findFirst({
    where: { OR: [...(isUUID ? [{ id: identifier }] : []), ...invVariants.map((inv) => ({ invoice_number: inv }))], shopId },
    include,
  });
  if (!sale && isHexSegment) {
    const raw = (await prisma.$queryRawUnsafe(
      'SELECT id FROM sales WHERE id::text LIKE $1 AND shop_id = $2::uuid LIMIT 1', `${cleanId.toLowerCase()}%`, shopId,
    )) as Array<{ id: string }>;
    if (raw.length) sale = await prisma.sale.findFirst({ where: { id: raw[0].id, shopId }, include });
  }
  if (!sale) throw new ApiError(404, 'Invoice not found');

  const sourceModel = sale.pricingModel === MILL_PRICING_MODEL ? MILL_PRICING_MODEL : 'legacy';
  const base = {
    source: { id: sale.id, invoice_number: sale.invoice_number, pricing_model: sourceModel, bill_type: sale.billType || 'non_gst' },
    target_model: MILL_PRICING_MODEL,
    duplicated_from: sale.id,
  };
  const blocked = (code: string, reason: string) => json({ ...base, status: 'blocked', code, reason, force_bill_type: null, items: [], charges: null });

  if (sourceModel === 'legacy' && sale.billType === 'gst') {
    return blocked('MILL_DUPLICATE_LEGACY_GST_BLOCKED', 'This is a legacy GST invoice. Its original GST rates cannot be recovered reliably, so it cannot be duplicated into mill billing. Please re-enter the rates.');
  }
  // A product-backed line whose product no longer exists cannot be put in a cart.
  if ((sale.items || []).some((it: any) => it.productId && !it.product)) {
    return blocked('MILL_DUPLICATE_PRODUCT_MISSING', 'A product on this invoice no longer exists, so it cannot be duplicated.');
  }

  const goods: any[] = [];
  const legacyCharges: Record<MillChargeKey, number> = { freight: 0, hamali: 0, loading: 0, unloading: 0, other: 0 };
  for (const it of sale.items || []) {
    const name: string = it.product?.name || it.itemName || it.variant || 'Item';
    const qty = Number(it.quantity) || 0;
    const price = Number(it.pricePerUnit) || 0;
    if (sourceModel === 'legacy' && !it.productId && LEGACY_CHARGE_TO_KEY[name]) {
      const key = LEGACY_CHARGE_TO_KEY[name];
      legacyCharges[key] = Math.round((legacyCharges[key] + qty * price) * 100) / 100;
      continue;
    }
    goods.push({ product_id: it.productId || null, name, unit: it.unit || null, variant: it.variant || null, quantity: qty, rate: price });
  }

  if (sourceModel === MILL_PRICING_MODEL) {
    const stored: any = sale.charges && typeof sale.charges === 'object' ? sale.charges : {};
    const charges = Object.fromEntries(MILL_CHARGE_KEYS.map((k) => [k, Number(stored[k]) || 0]));
    return json({
      ...base, status: 'as_is', force_bill_type: null, items: goods, charges,
      discount: sale.discountAmount ? { type: 'fixed', value: Number(sale.discountAmount) } : null,
    });
  }

  // Legacy NON-GST: rates copied as-is; the new bill must stay non-GST.
  return json({
    ...base, status: 'as_is_non_gst', force_bill_type: 'non_gst', items: goods, charges: legacyCharges,
    note: 'Rates are copied unchanged from a non-GST invoice. The new bill must stay non-GST unless the rates are re-entered.',
  });
});
