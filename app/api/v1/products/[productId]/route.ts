import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { recordDeletion } from '@/lib/server/trash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ productId: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  const { productId } = await params;
  const { shop } = await requireShop(req, { enforceSubscription: false });
  const product = await prisma.product.findFirst({ where: { id: productId, shopId: shop.id } });
  if (!product) throw new ApiError(404, 'Product not found');
  return json(product);
});

export const PUT = handle<Ctx>(async (req, { params }) => {
  const { productId } = await params;
  const { shop } = await requireShop(req);
  const b = await readBody(req);
  const product = await prisma.product.findFirst({ where: { id: productId, shopId: shop.id } });
  if (!product) throw new ApiError(404, 'Product not found');
  try {
    // Normalize size_variants to a JSON string for the DB column, but TRUST
    // whatever the caller sent for the actual values — every editor of this
    // field (Edit Product form, BarcodeQRModal generate-variants, Import)
    // ships the full intended set of {sizeKey: qty}. An earlier version of
    // this route replaced every incoming value with the pre-existing DB
    // value, so every "add stock to a new size" save silently landed as 0
    // for that size while current_stock updated correctly — reading exactly
    // as "the save button doesn't work" from the shopkeeper's side, with no
    // way to notice unless they cross-checked the individual size cells.
    let finalSizeVariants = b.size_variants ?? b.sizeVariants;
    if (finalSizeVariants !== undefined && finalSizeVariants !== null && typeof finalSizeVariants !== 'string') {
      try { finalSizeVariants = JSON.stringify(finalSizeVariants); } catch {}
    }

    // Uuid FK columns reject '' (the "-- Select --" empty option's value) —
    // only null/a real uuid is valid, so coerce the empty-string case.
    const uuidOrNull = (v: any) => (v === '' ? null : v);

    // Same lesson for the Udyog variants[] array: trust the caller. The old
    // merge replaced `quantity`/`stock` on every incoming variant with the
    // pre-existing value (or 0 if the variant was new), so adding stock to
    // a new colour+size row went through silently as a no-op — same
    // "not-working" symptom the size_variants merge above caused.
    const finalVariants = b.variants;

    // If the caller changed currentStock via product-edit, emit a matching
    // StockLog row so downstream views (Daily Register live re-baselining,
    // Stock recent-activity feed, "+N added today" badge) can see it. Without
    // this the product row updates silently and Receive/Close on the Daily
    // Register never move.
    const nextStockRaw = b.current_stock ?? b.currentStock;
    const stockProvided = nextStockRaw !== undefined && nextStockRaw !== null && nextStockRaw !== '';
    const nextStock = stockProvided ? Number(nextStockRaw) : null;
    const prevStock = product.currentStock ?? 0;
    const stockDelta = stockProvided && Number.isFinite(nextStock as number)
      ? (nextStock as number) - prevStock
      : 0;

    const updateData = {
      name: b.name,
      category: b.category,
      currentStock: b.current_stock ?? b.currentStock,
      minStock: b.min_stock ?? b.minStock,
      mrp: b.mrp,
      sellingPrice: b.selling_price ?? b.sellingPrice,
      wholesaleCost: b.wholesale_cost ?? b.wholesaleCost,
      costPrice: b.cost_price ?? b.costPrice,
      costPriceMode: (b.cost_price_mode ?? b.costPriceMode) !== undefined ? (b.cost_price_mode ?? b.costPriceMode) : undefined,
      purchaseDiscountPercent: (b.purchase_discount_percent ?? b.purchaseDiscountPercent) !== undefined ? (b.purchase_discount_percent ?? b.purchaseDiscountPercent) : undefined,
      baseUnit: b.base_unit ?? b.baseUnit,
      barcode: b.barcode,
      sku: b.sku !== undefined ? b.sku : undefined,
      otherCode: (b.otherCode ?? b.other_code) !== undefined ? (b.otherCode ?? b.other_code) : undefined,
      cartonBarcode: (b.cartonBarcode ?? b.carton_barcode) !== undefined ? (b.cartonBarcode ?? b.carton_barcode) : undefined,
      location: b.location !== undefined ? b.location : undefined,
      is_loose: b.is_loose ?? b.isLoose,
      expiryDate: b.expiry_date ?? b.expiryDate,
      batch_number: b.batch_number ?? b.batchNumber,
      drug_schedule: b.drug_schedule ?? b.drugSchedule,
      model_number: b.model_number ?? b.modelNumber,
      warranty_months: b.warranty_months ?? b.warrantyMonths,
      gender: b.gender,
      shade: b.shade,
      size_variants: finalSizeVariants,
      metadata: b.metadata !== undefined ? b.metadata : undefined,
      variants: finalVariants,
      brand: b.brand,
      hsnCode: b.hsnCode ?? b.hsn_code,
      productType: b.productType ?? b.product_type,
      gstPercent: b.gstPercent ?? b.gst_percent,
      // Mill classification + pack spec (Bada Udyog). All three nullable
      // so a shopkeeper can also *clear* a wrong pick by sending null.
      // Skipped entirely when the client doesn't send the key at all —
      // spread-guarded via ?? undefined below via defaults on the object.
      millCategory: b.millCategory ?? b.mill_category ?? undefined,
      packSize: b.packSize ?? b.pack_size ?? undefined,
      packUnit: b.packUnit ?? b.pack_unit ?? undefined,
      grade: b.grade ?? undefined,
      variety: b.variety ?? undefined,
      subcategory: b.subcategory ?? undefined,
      reorderLevel: b.reorderLevel ?? b.reorder_level ?? undefined,
      trackBatch: b.trackBatch ?? b.track_batch ?? undefined,
      trackExpiry: b.trackExpiry ?? b.track_expiry ?? undefined,
      categoryId: uuidOrNull(b.categoryId ?? b.category_id),
      brandId: uuidOrNull(b.brandId ?? b.brand_id),
      baseUnitId: uuidOrNull(b.baseUnitId ?? b.base_unit_id),
      defaultSaleUnitId: uuidOrNull(b.defaultSaleUnitId ?? b.default_sale_unit_id),
      defaultPurchaseUnitId: uuidOrNull(b.defaultPurchaseUnitId ?? b.default_purchase_unit_id),
      maxStock: b.maxStock ?? b.max_stock,
      conversionFactor: b.conversionFactor ?? b.conversion_factor,
      wholesaleMoq: b.wholesaleMoq ?? b.wholesale_moq,
    };

    const ops: any[] = [
      prisma.product.update({ where: { id: productId }, data: updateData }),
    ];
    if (stockDelta !== 0) {
      ops.push(prisma.stockLog.create({
        data: {
          shopId: shop.id,
          productId,
          type: stockDelta > 0 ? 'in' : 'out',
          quantity: Math.abs(stockDelta),
          note: `Product edit: stock ${stockDelta > 0 ? '+' : ''}${stockDelta} (${prevStock} → ${nextStock})`,
        },
      }));
    }
    const [updated] = await prisma.$transaction(ops);
    // gst_inclusive not in cached Prisma client — update via raw SQL
    if (b.gstInclusive !== undefined || b.gst_inclusive !== undefined) {
      const val = Boolean(b.gstInclusive ?? b.gst_inclusive);
      await prisma.$executeRawUnsafe(
        `UPDATE products SET gst_inclusive = $1 WHERE id = $2::uuid`,
        val, productId
      ).catch(() => {});
    }
    return json(updated);
  } catch (error: any) {
    if (error.code === 'P2002' && error.meta?.target?.includes('barcode')) {
      throw new ApiError(400, 'A product with this Barcode/SKU already exists.');
    }
    throw error;
  }
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { productId } = await params;
  const { shop, user } = await requireShop(req);
  const product = await prisma.product.findFirst({ where: { id: productId, shopId: shop.id } });
  if (!product) throw new ApiError(404, 'Product not found');

  // Snapshot before the delete attempt below — recoverable from the admin
  // trash bin even though the P2003 fallback path already archives instead
  // of destroying, since archived products still clutter search/lists forever.
  await recordDeletion({
    shopId: shop.id,
    entityType: 'product',
    entityId: product.id,
    label: product.name,
    data: product,
    deletedBy: user.email,
  });

  try {
    // Attempt hard delete. It will automatically cascade to godownProducts/stockLogs if schema allows,
    // but if it's referenced by Sales, it will throw a P2003 Foreign Key Constraint error.
    await prisma.product.delete({ where: { id: productId } });
  } catch (error: any) {
    if (error.code === 'P2003') {
      // Soft-delete by archiving if it cannot be hard deleted
      await prisma.product.update({
        where: { id: productId },
        data: { archived: true }
      });
      return json({ detail: 'Product archived because it is part of existing sales' });
    }
    console.error('[API] Product Delete Error:', error);
    throw error;
  }
  
  return json({ detail: 'Product deleted' });
});
