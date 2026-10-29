import prisma from '@/lib/server/prisma';
import { normalizeVariants } from '@/lib/variants';
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

    const reqType = b.productType ?? b.product_type;
    const isExplicitSingleOrLoose = reqType === 'single' || reqType === 'loose';

    // Did the caller deliberately send new variants or size_variants?
    const hasIncomingVariants = Array.isArray(b.variants);
    const hasIncomingSizeVariants = b.size_variants !== undefined || b.sizeVariants !== undefined;
    const variantsExplicitlyEdited = hasIncomingVariants || hasIncomingSizeVariants;

    const clearingVariants = (hasIncomingVariants && b.variants.length === 0 && isExplicitSingleOrLoose)
      || (hasIncomingSizeVariants && (!b.size_variants || b.size_variants === '{}') && isExplicitSingleOrLoose);

    // A product is treated as a variant product ONLY if:
    // 1) The caller explicitly specified reqType === 'variant', OR
    // 2) The caller sent variant rows / size_variants to convert it, OR
    // 3) The existing product was already 'variant' AND the caller did not set it to single/loose.
    const isVariantProduct = !isExplicitSingleOrLoose && (
      reqType === 'variant'
      || (hasIncomingVariants && b.variants.length > 0)
      || (hasIncomingSizeVariants && typeof b.size_variants === 'object' && Object.keys(b.size_variants || {}).length > 0)
      || (product.productType === 'variant')
    );

    let nv: ReturnType<typeof normalizeVariants>;
    if (isVariantProduct && variantsExplicitlyEdited && !clearingVariants) {
      nv = normalizeVariants({
        variants: b.variants,
        sizeVariants: finalSizeVariants,
        existingVariants: product.variants,
      });
    } else if (isVariantProduct && (b.current_stock === undefined && b.currentStock === undefined)) {
      // Existing variant product where no flat stock was sent — preserve existing variant sum
      nv = normalizeVariants({
        variants: product.variants,
        sizeVariants: product.size_variants,
        existingVariants: product.variants,
      });
    } else {
      // Single/loose product, or caller didn't provide variants: do not auto-synthesize variants
      nv = { variants: [], sizeVariants: {}, sizeVariantsJson: null, currentStock: null, hasVariants: false };
    }

    // Flat stock provided by caller takes priority when product is single/loose or when variants were not explicitly edited:
    const flatStockRaw = b.current_stock ?? b.currentStock;
    const nextStockRaw = (isVariantProduct && nv.hasVariants && variantsExplicitlyEdited)
      ? nv.currentStock
      : (flatStockRaw !== undefined && flatStockRaw !== null && flatStockRaw !== '' ? flatStockRaw : (isVariantProduct && nv.hasVariants ? nv.currentStock : product.currentStock));

    const stockProvided = nextStockRaw !== undefined && nextStockRaw !== null && nextStockRaw !== '';
    const nextStock = stockProvided ? Number(nextStockRaw) : null;
    const prevStock = product.currentStock ?? 0;
    const stockDelta = stockProvided && Number.isFinite(nextStock as number)
      ? (nextStock as number) - prevStock
      : 0;

    const resolvedProductType = isExplicitSingleOrLoose
      ? reqType
      : (isVariantProduct && nv.hasVariants ? 'variant' : (reqType || product.productType || 'single'));

    const updateData = {
      name: b.name,
      category: b.category,
      currentStock: nextStock,
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
      size_variants: isExplicitSingleOrLoose ? null : (isVariantProduct && nv.hasVariants ? nv.sizeVariantsJson : (clearingVariants ? null : undefined)),
      metadata: b.metadata !== undefined ? b.metadata : undefined,
      variants: isExplicitSingleOrLoose ? [] : (isVariantProduct && nv.hasVariants ? (nv.variants as any) : (clearingVariants ? [] : undefined)),
      brand: b.brand,
      hsnCode: b.hsnCode ?? b.hsn_code,
      productType: resolvedProductType,
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
      // Whether the saved Selling Price is GST-inclusive or -exclusive.
      // null = the shopkeeper never explicitly picked one (left it
      // "unedited") — must stay null, not get forced to false/true, or the
      // Edit modal's toggle falsely shows "Excluding" as chosen next time.
      // Written here (not a separate post-transaction raw UPDATE) so it's
      // atomic with the rest of the save and can never silently fail.
      gstInclusive: (b.gstInclusive !== undefined || b.gst_inclusive !== undefined)
        ? ((b.gstInclusive ?? b.gst_inclusive) === null ? null : Boolean(b.gstInclusive ?? b.gst_inclusive))
        : undefined,
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
    return json(updated);
  } catch (error: any) {
    if (error.code === 'P2002' && error.meta?.target?.includes('barcode')) {
      throw new ApiError(400, 'A product with this Barcode/SKU already exists.');
    }
    throw error;
  }
});

// Lightweight PATCH for spreadsheet-style inline cell edits.
// Only touches the specific fields sent — no variant renormalization needed.
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { productId } = await params;
  const { shop } = await requireShop(req);
  const b = await readBody(req);

  const product = await prisma.product.findFirst({ where: { id: productId, shopId: shop.id } });
  if (!product) throw new ApiError(404, 'Product not found');

  const updateData: Record<string, unknown> = {};
  if (b.mrp !== undefined) updateData.mrp = Math.max(0, Number(b.mrp) || 0);
  if (b.sellingPrice !== undefined) updateData.sellingPrice = Math.max(0, Number(b.sellingPrice) || 0);
  if (b.costPrice !== undefined) updateData.costPrice = Math.max(0, Number(b.costPrice) || 0);
  if (b.minStock !== undefined) updateData.minStock = Math.max(0, Number(b.minStock) || 0);
  if (b.location !== undefined) updateData.location = String(b.location).trim();

  if (Object.keys(updateData).length === 0) throw new ApiError(400, 'No fields to update');

  const updated = await prisma.product.update({ where: { id: productId }, data: updateData });
  return json(updated);
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
