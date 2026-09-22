import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { isMillBillingPackage } from '@/lib/config/packageConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/purchases/[id]/to-raw-material — Bada Udyog only.
 *
 * A purchase can already push its items straight into Raw Material at creation time (the "Add to Raw Material" checkbox per row on
 * the Add Purchase form). This is the retroactive path for a bill that was saved WITHOUT that checkbox ticked — e.g. the product
 * wasn't classed Raw Material yet, or an import created the purchase. It never re-adds an item the invoice already converted (checked
 * via the same "Auto-created/Imported from Purchase Invoice <no>" note every other raw-lot writer uses, so this stays idempotent).
 *
 * Body: { productIds?: string[] } — which invoice items to convert; omitted = every item whose product is classed Raw Material.
 */
export const POST = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  if (!isMillBillingPackage(shop.packageType)) throw new ApiError(400, 'Raw Material is a Bada Udyog feature.', 'NOT_MILL_SHOP');

  const invoice = await prisma.purchaseInvoice.findFirst({
    where: { id, shopId: shop.id },
    include: { purchaseItems: { include: { product: { select: { id: true, name: true, baseUnit: true, millCategory: true } } } } },
  });
  if (!invoice) throw new ApiError(404, 'Purchase invoice not found');

  const body = await readBody<any>(req).catch(() => ({}));
  const wanted: string[] | null = Array.isArray(body?.productIds) ? body.productIds.map(String) : null;

  const already = await (prisma as any).rawMaterialLot.findMany({
    where: { shopId: shop.id, notes: { contains: `Purchase Invoice ${invoice.invoiceNumber}` } },
    select: { productId: true },
  });
  const converted = new Set(already.map((l: any) => l.productId));

  const candidates = invoice.purchaseItems.filter((it: any) =>
    it.product && !converted.has(it.productId) && (wanted ? wanted.includes(it.productId) : it.product.millCategory === 'raw_material'),
  );
  if (candidates.length === 0) {
    throw new ApiError(400, 'Nothing to convert — either no item on this bill is classed Raw Material, or every one is already in Raw Material.', 'NOTHING_TO_CONVERT');
  }

  const created = await prisma.$transaction(
    candidates.map((it: any, i: number) =>
      (prisma as any).rawMaterialLot.create({
        data: {
          shopId: shop.id,
          productId: it.productId,
          supplierId: invoice.supplierId,
          lotNumber: `${invoice.invoiceNumber}${candidates.length > 1 ? `-L${i + 1}` : ''}`,
          purchaseDate: invoice.date,
          weightKg: it.quantity,
          ratePerKg: it.cost || null,
          totalAmount: Math.round(Number(it.quantity) * Number(it.cost || 0) * 100) / 100,
          remainingKg: it.quantity,
          notes: `Added to Raw Material from Purchase Invoice ${invoice.invoiceNumber}`,
        },
      }),
    ),
  );

  return json({ created: created.length, lots: created });
});
