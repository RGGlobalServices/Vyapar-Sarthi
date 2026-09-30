import prisma from '@/lib/server/prisma';
import { normalizeVariants } from '@/lib/variants';
import { createOpeningLots } from '@/lib/server/lotCreate';
import { requireShop, requireShopScope } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { startOfDay } from '@/lib/server/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const scope = await requireShopScope(req, { enforceSubscription: false });
  const { shop, shopIds, allShopAccess, ownedShops } = scope;
  const shopNameById = new Map(ownedShops.map(s => [s.id, s.name]));
  // Each shop can be a different business type (a footwear shop vs a
  // clothing shop) — sent alongside shopName so a pooled list can render
  // each shop's own column set instead of blindly using the active shop's.
  const shopBusinessTypeById = new Map(ownedShops.map(s => [s.id, s.businessType]));
  const url = new URL(req.url);
  const q = url.searchParams.get('q') || '';
  const pageStr = url.searchParams.get('page');
  const limitStr = url.searchParams.get('limit');
  const lite = url.searchParams.get('lite') === 'true'; // for fast caching
  const isRawMaterialStr = url.searchParams.get('isRawMaterial');

  const page = pageStr ? parseInt(pageStr, 10) : 1;
  const limit = limitStr ? parseInt(limitStr, 10) : (q ? 50 : 2000); // Max 2000 if not specified to prevent crashes
  const skip = (page - 1) * limit;

  const where: any = {
    shopId: { in: shopIds },
    OR: [{ archived: false }, { archived: null }]
  };

  if (isRawMaterialStr === 'true') {
    where.isRawMaterial = true;
  } else if (isRawMaterialStr === 'false') {
    where.isRawMaterial = false;
  }

  if (q) {
    // Token-based name search: every word in the query must appear somewhere
    // in the product name (any order, any position). This lets "TODDLER ZONE 16"
    // match "TODDLER ZONE 528 16X20 PINK" even though "TODDLER ZONE 16" is not
    // a contiguous substring of that name.
    // Barcode/SKU/HSN still match as a single substring (scanner reads).
    const tokens = q.trim().split(/\s+/).filter(Boolean);
    const nameCondition = tokens.length > 1
      ? { AND: tokens.map(t => ({ name: { contains: t, mode: 'insensitive' as const } })) }
      : { name: { contains: q, mode: 'insensitive' as const } };

    where.AND = [
      {
        OR: [
          nameCondition,
          // `contains` (not `equals`) so a typed/partial code still matches,
          // not only an exact hardware-scanner read. Covers every identifier a
          // shop might key an item by: company barcode, SKU, carton barcode, HSN.
          { barcode: { contains: q, mode: 'insensitive' } },
          { sku: { contains: q, mode: 'insensitive' } },
          { cartonBarcode: { contains: q, mode: 'insensitive' } },
          { hsnCode: { contains: q, mode: 'insensitive' } },
        ]
      }
    ];
  }

  // If lite is requested, only fetch essential fields (for offline barcode cache)
  if (lite) {
    const products = await prisma.product.findMany({
      where,
      select: {
        id: true,
        shopId: true,
        name: true,
        barcode: true,
        sku: true,
        otherCode: true,
        cartonBarcode: true,
        hsnCode: true,
        sellingPrice: true,
        currentStock: true,
        minStock: true,
        category: true,
        baseUnit: true,
        mrp: true,
        createdAt: true,
        // Billing's product search (`GET /products?lite=true`) reads these off each result when adding to the cart — missing here
        // meant every line added through search silently carried gstPercent=0, so a GST invoice's CGST/SGST/IGST always came out
        // ₹0 no matter what rate the product actually had. gender/is_loose were the same gap for their own cart fields.
        gstPercent: true,
        gender: true,
        is_loose: true,
        wholesaleCost: true,
        costPrice: true,
        isRawMaterial: true,
      },
      skip,
      take: limit,
      orderBy: { name: 'asc' }
    });
    // gst_inclusive is a new column — the cached Prisma client may not know it
    // yet, so fetch it via raw SQL and merge in rather than selecting it above.
    let gstInclusiveMap = new Map<string, boolean>();
    if (products.length > 0) {
      try {
        const ids = products.map(p => p.id);
        const rows = await prisma.$queryRawUnsafe<{ id: string; gst_inclusive: boolean | null }[]>(
          `SELECT id, gst_inclusive FROM products WHERE id = ANY($1::uuid[])`,
          ids
        );
        for (const row of rows) gstInclusiveMap.set(row.id, row.gst_inclusive ?? false);
      } catch { /* ignore if column doesn't exist yet */ }
    }
    const liteData = (allShopAccess
      ? products.map(p => ({ ...p, shopName: p.shopId ? shopNameById.get(p.shopId) : undefined, shopBusinessType: p.shopId ? shopBusinessTypeById.get(p.shopId) : undefined }))
      : products
    ).map(p => ({ ...p, gstInclusive: gstInclusiveMap.get(p.id as string) ?? false }));
    return json({ data: liteData, page, limit }, 200, {
      'Cache-Control': 'public, max-age=10, stale-while-revalidate=50'
    });
  }

  // Stock added TODAY per product → drives the "+N newly added" badge in the
  // Products/Stock lists. Anchored to today's midnight in the SHOP's timezone
  // (Asia/Kolkata) so the badge resets at the shopkeeper's start-of-day, not
  // the server's UTC midnight — otherwise a Hostinger host would carry the
  // previous evening's arrivals over until 05:30 IST, looking like a rolling
  // 24h window. One grouped query, indexed on (shop, type, created).
  const since = startOfDay();
  const [products, total, recentAdds] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        godownProducts: true,
        _count: {
          select: {
            godownProducts: { where: { quantity: { gt: 0 } } }
          }
        }
      },
      skip,
      take: limit,
      orderBy: { name: 'asc' }
    }),
    pageStr || limitStr ? prisma.product.count({ where }) : Promise.resolve(0),
    prisma.stockLog.groupBy({
      by: ['productId'],
      where: { shopId: { in: shopIds }, quantity: { gt: 0 }, createdAt: { gte: since }, type: { in: ['in', 'opening', 'import', 'receive', 'purchase', 'adjustment', 'daily_register_receive'] } },
      _sum: { quantity: true },
    }).catch(() => [] as any[]),
  ]);

  const recentMap = new Map<string, number>();
  for (const r of recentAdds as any[]) {
    if (r.productId) recentMap.set(r.productId, Number(r._sum?.quantity) || 0);
  }
  const withRecent = products.map((p: any) => ({
    ...p,
    recentlyAdded: recentMap.get(p.id) || 0,
    ...(allShopAccess ? { shopName: shopNameById.get(p.shopId), shopBusinessType: shopBusinessTypeById.get(p.shopId) } : {}),
  }));

  if (pageStr || limitStr) {
    return json({ data: withRecent, total, page, limit });
  }

  // Backwards compatibility for endpoints that expect an array
  return json(withRecent);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const b = await readBody(req);
  // Uuid FK columns reject '' (the "-- Select --" empty option's value) —
  // only null/a real uuid is valid, so coerce the empty-string case.
  const uuidOrNull = (v: any) => (v === '' ? null : v);
  // One consistent write of the three variant stores (variants[], size_variants, currentStock).
  const nv = normalizeVariants({ variants: b.variants, sizeVariants: b.size_variants ?? b.sizeVariants });
  try {
    const product = await prisma.product.create({
      data: {
        shopId: shop.id,
        name: b.name,
        category: b.category,
        currentStock: nv.hasVariants ? nv.currentStock : (b.current_stock ?? b.currentStock),
        minStock: b.min_stock ?? b.minStock,
        mrp: b.mrp,
        sellingPrice: b.selling_price ?? b.sellingPrice,
        wholesaleCost: b.wholesale_cost ?? b.wholesaleCost,
        costPrice: b.cost_price ?? b.costPrice,
        costPriceMode: b.cost_price_mode ?? b.costPriceMode ?? 'manual',
        purchaseDiscountPercent: b.purchase_discount_percent ?? b.purchaseDiscountPercent ?? null,
        baseUnit: b.base_unit ?? b.baseUnit,
        barcode: b.barcode,
        sku: b.sku ?? null,
        otherCode: b.otherCode ?? b.other_code ?? null,
        cartonBarcode: b.cartonBarcode ?? b.carton_barcode ?? null,
        location: b.location ?? null,
        is_loose: b.is_loose ?? b.isLoose,
        isRawMaterial: b.isRawMaterial ?? b.is_raw_material ?? false,
        expiryDate: b.expiry_date ?? b.expiryDate,
        batch_number: b.batch_number ?? b.batchNumber,
        drug_schedule: b.drug_schedule ?? b.drugSchedule,
        model_number: b.model_number ?? b.modelNumber,
        warranty_months: b.warranty_months ?? b.warrantyMonths,
        gender: b.gender,
        shade: b.shade,
        size_variants: nv.hasVariants ? nv.sizeVariantsJson : (b.size_variants ?? b.sizeVariants),
        metadata: b.metadata,
        variants: nv.hasVariants ? (nv.variants as any) : b.variants,
        brand: b.brand,
        hsnCode: b.hsnCode ?? b.hsn_code,
        productType: nv.hasVariants && (!(b.productType ?? b.product_type) || (b.productType ?? b.product_type) === 'single') ? 'variant' : (b.productType ?? b.product_type),
        gstPercent: b.gstPercent ?? b.gst_percent,
        // Bada Udyog / mill classification + bag-packaging spec — all
        // nullable so non-mill shops POST products exactly as before.
        millCategory: b.millCategory ?? b.mill_category ?? null,
        packSize: b.packSize ?? b.pack_size ?? null,
        packUnit: b.packUnit ?? b.pack_unit ?? null,
        grade: b.grade ?? null,
        variety: b.variety ?? null,
        subcategory: b.subcategory ?? null,
        reorderLevel: b.reorderLevel ?? b.reorder_level ?? null,
        trackBatch: b.trackBatch ?? b.track_batch ?? null,
        trackExpiry: b.trackExpiry ?? b.track_expiry ?? null,
        categoryId: uuidOrNull(b.categoryId ?? b.category_id),
        brandId: uuidOrNull(b.brandId ?? b.brand_id),
        baseUnitId: uuidOrNull(b.baseUnitId ?? b.base_unit_id),
        defaultSaleUnitId: uuidOrNull(b.defaultSaleUnitId ?? b.default_sale_unit_id),
        defaultPurchaseUnitId: uuidOrNull(b.defaultPurchaseUnitId ?? b.default_purchase_unit_id),
        maxStock: b.maxStock ?? b.max_stock,
        wholesaleMoq: b.wholesaleMoq ?? b.wholesale_moq,
        conversionFactor: b.conversionFactor ?? b.conversion_factor,
      },
    });
    // gst_inclusive not in cached Prisma client — update via raw SQL
    const gstInclusiveVal = b.gstInclusive ?? b.gst_inclusive ?? false;
    await prisma.$executeRawUnsafe(
      `UPDATE products SET gst_inclusive = $1 WHERE id = $2::uuid`,
      Boolean(gstInclusiveVal), product.id
    ).catch(() => {});
    // Record the opening stock as a stock-in movement so the Products/Stock lists
    // can surface a "+N newly added" badge (and for the audit trail).
    const openingQty = Number(product.currentStock) || 0;
    if (openingQty > 0) {
      await prisma.stockLog.create({
        data: { shopId: shop.id, productId: product.id, type: 'in', quantity: openingQty, note: 'Opening stock' },
      }).catch((e) => console.error('Failed to write opening StockLog:', e));
    }
    // Opening stock with a lot number ("Lot A31, 10 pcs @ ₹150") -> record it as a real lot, so billing can list
    // this lot by number with its own price once newer lots arrive. Nothing is created when no lot number is given.
    const lotNumber = String(b.lot_number ?? b.lotNumber ?? '').trim();
    if (lotNumber && (Number(product.currentStock) || 0) > 0) {
      try {
        await createOpeningLots(prisma, {
          shopId: shop.id,
          product: product as any,
          batchNumber: lotNumber,
          expiryDate: b.lot_expiry ?? b.lotExpiry ?? b.expiry_date ?? b.expiryDate,
        });
      } catch (e) { console.error('Failed to record opening lot:', e); }
    }
    return json(product, 201);
  } catch (error: any) {
    if (error.code === 'P2002' && error.meta?.target?.includes('barcode')) {
      throw new ApiError(400, 'A product with this Barcode/SKU already exists.');
    }
    throw error;
  }
});
