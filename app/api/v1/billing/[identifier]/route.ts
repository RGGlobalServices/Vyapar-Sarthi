import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { recordDeletion } from '@/lib/server/trash';
import { getReturnedQuantitiesForSale, reverseSaleEffects, cleanupSaleBatches, createSaleEffects, restoreBatchQuantities } from '@/lib/server/sales';
import { invalidateDashboardCacheForShop } from '@/lib/server/dashboardCache';
import { assertSaleEditable } from '@/lib/server/millGuards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ identifier: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  const { identifier } = await params;
  const { shop } = await requireShop(req);
  const shopId = shop.id;

  const cleanId = identifier.replace(/^INV[-_]?/i, '').replace(/[^a-zA-Z0-9]/g, '');
  const invVariants = [`INV-${cleanId}`, `INV_${cleanId}`, `INV${cleanId}`, cleanId];

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
  const isHexSegment = /^[0-9a-f]{8,}$/i.test(cleanId);

  let sale = await prisma.sale.findFirst({
    where: {
      OR: [
        ...(isUUID ? [{ id: identifier }] : []),
        ...invVariants.map((inv) => ({ invoice_number: inv })),
      ],
      shopId,
    },
    include: {
      items: { include: { product: { select: { name: true, hsnCode: true, gstPercent: true } } } },
      customer: { select: { name: true, mobile: true, address: true, gst: true } },
    },
  });

  if (!sale && isHexSegment) {
    const raw = (await prisma.$queryRawUnsafe(
      'SELECT id FROM sales WHERE id::text LIKE $1 AND shop_id = $2::uuid LIMIT 1',
      `${cleanId.toLowerCase()}%`,
      shopId,
    )) as Array<{ id: string }>;
    if (raw.length) {
      sale = await prisma.sale.findFirst({
        where: { id: raw[0].id },
        include: {
          items: { include: { product: { select: { name: true, hsnCode: true, gstPercent: true } } } },
          customer: { select: { name: true, mobile: true, address: true, gst: true } },
        },
      });
    }
  }

  if (!sale) throw new ApiError(404, 'Invoice not found');

  const [returnedQuantities, priorReturnRows] = await Promise.all([
    getReturnedQuantitiesForSale(prisma, shopId, sale.id),
    prisma.materialReturn.findMany({
      where: { shopId, note: { contains: sale.id } },
      select: { amount: true, note: true },
    }),
  ]);

  // Compute the discount factor so the returns UI can display the effective
  // (post-discount) price per item rather than the raw stored pricePerUnit.
  // originalTotal = current totalAmount + sum of all prior settled return amounts.
  const priorReturnTotal = priorReturnRows.reduce((s, r) => {
    try { const n = JSON.parse(r.note || '{}'); return n?.billId === sale.id && n?.settled === true ? s + (Number(r.amount) || 0) : s; } catch { return s; }
  }, 0);
  const grossBeforeDiscount = sale.items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.pricePerUnit) || 0), 0);
  const originalTotal = Number(sale.totalAmount) + priorReturnTotal;
  // Regular bills: factor ≤ 1 (discount reduces total below gross).
  // Mill bills: factor > 1 (GST + charges make total exceed gross base prices).
  const discountFactor = grossBeforeDiscount > 0 ? Math.max(0, originalTotal / grossBeforeDiscount) : 1;

  // Mill (mill_v2) invoices only: the extra detail the Mill invoice template prints (unit, batch numbers, customer
  // contact). Legacy sales get exactly the response they always had.
  const isMillSale = (sale as any).pricingModel === 'mill_v2';
  const millBatchNames = new Map<string, string[]>();
  if (isMillSale && sale.items.length) {
    const rows = await prisma.saleItemBatch.findMany({
      where: { saleItemId: { in: sale.items.map((i) => i.id) } },
      include: { batch: { select: { batchNumber: true } } },
    });
    for (const r of rows) {
      const n = r.batch?.batchNumber;
      if (!n) continue;
      const arr = millBatchNames.get(r.saleItemId) || [];
      if (!arr.includes(n)) arr.push(n);
      millBatchNames.set(r.saleItemId, arr);
    }
  }

  return json({
    id: sale.id,
    invoice_number: sale.invoice_number,
    total_amount: sale.totalAmount,
    payment_type: sale.paymentType,
    amount_paid: sale.amountPaid,
    payment_details: sale.paymentDetails,
    bill_type: sale.billType,
    gst_amount: sale.gstAmount,
    gst_details: sale.gstDetails,
    // Mill Billing fields (null on every legacy sale)
    pricing_model: (sale as any).pricingModel ?? null,
    discount_amount: (sale as any).discountAmount ?? null,
    charges: (sale as any).charges ?? null,
    charges_total: (sale as any).chargesTotal ?? null,
    round_off_amount: (sale as any).roundOffAmount ?? null,
    is_manual: sale.isManual,
    bill_image_url: sale.billImageUrl,
    customer_id: sale.customerId || null,
    customer_name: sale.customer?.name || null,
    ...(isMillSale ? {
      customer_mobile: sale.customer?.mobile || null,
      customer_address: sale.customer?.address || null,
      customer_gst: sale.customer?.gst || null,
    } : {}),
    created_at: sale.createdAt,
    discount_factor: discountFactor,
    items: sale.items.map((item) => {
      const returnedQty = returnedQuantities[item.id] || returnedQuantities[item.productId || ''] || returnedQuantities[item.product?.name || ''] || 0;
      const ppu = Number(item.pricePerUnit) || 0;
      const effectivePpu = Math.round(ppu * discountFactor * 100) / 100;
      return {
        id: item.id,
        product_id: item.productId,
        name: item.product?.name || item.itemName || item.variant || (sale!.isManual ? 'Manual Bill' : 'Unknown'),
        price_per_unit: effectivePpu,
        original_price_per_unit: ppu,
        quantity: item.quantity,
        returned_quantity: returnedQty,
        total: effectivePpu * (item.quantity || 0),
        hsnCode: item.product?.hsnCode || '',
        gstPercent: item.product?.gstPercent || 0,
        ...(isMillSale ? { unit: item.unit || null, variant: item.variant || null, batch_numbers: millBatchNames.get(item.id) || [] } : {}),
      };
    }),
  });
});

/**
 * Edit a posted bill — customer, payment method/amount, and/or items. The
 * real-world need: a shopkeeper rings up a sale as Cash when the customer
 * actually paid UPI (or vice versa), and by end of day their cash count is
 * off. Rather than a narrow "just change the payment field" patch (which
 * would leave stock/customer-ledger/cashbook stuck on the OLD numbers if
 * items or amount also changed), this fully reverses the original bill's
 * effects and re-creates it with the edited data in one transaction —
 * exactly the reverse-then-recreate pattern purchases/[id]/route.ts already
 * uses for its own PATCH, via the same reverseSaleEffects() the recycle-bin
 * delete flow relies on. The invoice number, id, and original date are kept
 * so the bill the customer already has (WhatsApp text, printed slip) still
 * matches after the fix.
 */
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { identifier } = await params;
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);

  const cleanId = identifier.replace(/^INV[-_]?/i, '').replace(/[^a-zA-Z0-9]/g, '');
  const invVariants = [`INV-${cleanId}`, `INV_${cleanId}`, `INV${cleanId}`, cleanId];
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

  const existing = await prisma.sale.findFirst({
    where: {
      OR: [
        ...(isUUID ? [{ id: identifier }] : []),
        ...invVariants.map((inv) => ({ invoice_number: inv })),
      ],
      shopId: shop.id,
    },
  });
  if (!existing) throw new ApiError(404, 'Invoice not found');

  // Mill bills (`mill_v2`) are not editable yet — this path rebuilds a bill with the LEGACY inclusive engine and would
  // silently drop its charges/round-off. Legacy bills continue below, unchanged.
  assertSaleEditable(existing as any);

  // A bill with a return/exchange already recorded against it can't be
  // cleanly reversed — MaterialReturn's note references the OLD SaleItem
  // ids, which reverseSaleEffects/re-creation would orphan. Block rather
  // than silently corrupt that link; this is a real but narrow edge case
  // (editing a bill that's ALSO been partially returned) worth a follow-up,
  // not something to guess at now.
  const returnedQuantities = await getReturnedQuantitiesForSale(prisma, shop.id, existing.id);
  if (Object.values(returnedQuantities).some((q) => q > 0)) {
    throw new ApiError(409, 'This bill has a return/exchange recorded against it and can’t be edited yet. Contact support if this needs fixing.');
  }

  let result;
  let netQuantitiesByProduct = new Map<string, number>();
  try {
    result = await prisma.$transaction(async (tx) => {
      const reversed = await reverseSaleEffects(tx, shop.id, existing.id);
      netQuantitiesByProduct = reversed.netQuantitiesByProduct;
      // Delete the OLD wholesale-tier stock movement rows before re-creating
      // the sale under the same id — createSaleEffects below inserts fresh
      // ones with that same referenceId, so this must happen first or the
      // ledger would show two "sale" movements for one bill.
      await tx.stockMovement.deleteMany({ where: { shopId: shop.id, referenceId: existing.id, type: 'sale' } });
      return createSaleEffects(tx, shop, body, {
        id: existing.id,
        invoiceNumber: existing.invoice_number || undefined,
        createdAt: existing.createdAt,
      });
    }, { timeout: 20000, maxWait: 10000 });
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(400, err?.message || 'Failed to update bill');
  }

  // NOT cleanupSaleBatches — that also deletes StockMovement rows by
  // referenceId, which would wipe out the brand-new ones createSaleEffects
  // just inserted above. Only restore batch quantities from the reversal.
  try {
    await restoreBatchQuantities(prisma, shop.id, shop.packageType, netQuantitiesByProduct);
  } catch (e) { console.error('Batch quantity restore after edit failed:', e); }

  invalidateDashboardCacheForShop(shop.id);

  return json({ success: true, sale: result.sale });
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { identifier } = await params;
  const { shop, user } = await requireShop(req);

  // Accept BOTH a raw Sale.id (uuid) AND an invoice_number ("INV-1234ABCD")
  // — mirrors the GET handler above so the ledger view can delete a row
  // by the bill number it already has (customer_transactions carries
  // bill_number, not sale.id).
  const cleanId = identifier.replace(/^INV[-_]?/i, '').replace(/[^a-zA-Z0-9]/g, '');
  const invVariants = [`INV-${cleanId}`, `INV_${cleanId}`, `INV${cleanId}`, cleanId];
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

  const sale = await prisma.sale.findFirst({
    where: {
      OR: [
        ...(isUUID ? [{ id: identifier }] : []),
        ...invVariants.map((inv) => ({ invoice_number: inv })),
      ],
      shopId: shop.id,
    },
    include: { items: true },
  });
  if (!sale) throw new ApiError(404, 'Invoice not found');

  // Snapshot before reversal — recoverable from the recycle bin even though
  // the reversal below already restores stock/ledger, matching every other
  // delete route's snapshot-before-destroy ordering.
  await recordDeletion({
    shopId: shop.id,
    entityType: 'sale',
    entityId: sale.id,
    label: sale.invoice_number,
    data: sale,
    deletedBy: user.email,
  });

  const { netQuantitiesByProduct } = await prisma.$transaction(
    (tx) => reverseSaleEffects(tx, shop.id, sale.id),
    { timeout: 15000, maxWait: 10000 }
  );

  try {
    await cleanupSaleBatches(prisma, shop.id, sale.id, shop.packageType, netQuantitiesByProduct);
  } catch (e) {
    console.error('Sale batch/movement cleanup failed:', e);
  }

  return json({ detail: 'Bill deleted' });
});
