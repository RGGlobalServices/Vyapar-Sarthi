import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req, { enforceSubscription: false });
  const url = new URL(req.url);
  const q = url.searchParams.get('q') || '';
  const pageStr = url.searchParams.get('page');
  const limitStr = url.searchParams.get('limit');
  const lite = url.searchParams.get('lite') === 'true'; // for fast caching

  const page = pageStr ? parseInt(pageStr, 10) : 1;
  const limit = limitStr ? parseInt(limitStr, 10) : (q ? 50 : 2000); // Max 2000 if not specified to prevent crashes
  const skip = (page - 1) * limit;

  const where: any = { 
    shopId: shop.id,
    OR: [{ archived: false }, { archived: null }]
  };

  if (q) {
    where.AND = [
      {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          // `contains` (not `equals`) so a typed/partial barcode or SKU still matches,
          // not only an exact hardware-scanner read.
          { barcode: { contains: q, mode: 'insensitive' } },
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
        name: true,
        barcode: true,
        sellingPrice: true,
        currentStock: true,
        minStock: true,
        category: true,
      },
      skip,
      take: limit,
      orderBy: { name: 'asc' }
    });
    return json({ data: products, page, limit }, 200, {
      'Cache-Control': 'public, max-age=10, stale-while-revalidate=50'
    });
  }

  // Stock added in the last 24h per product → drives the "+N newly added" badge
  // in the Products/Stock lists. One grouped query, indexed on (shop, type, created).
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
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
      where: { shopId: shop.id, quantity: { gt: 0 }, createdAt: { gte: since }, type: { in: ['in', 'opening', 'import', 'receive', 'purchase', 'adjustment'] } },
      _sum: { quantity: true },
    }).catch(() => [] as any[]),
  ]);

  const recentMap = new Map<string, number>();
  for (const r of recentAdds as any[]) {
    if (r.productId) recentMap.set(r.productId, Number(r._sum?.quantity) || 0);
  }
  const withRecent = products.map((p: any) => ({ ...p, recentlyAdded: recentMap.get(p.id) || 0 }));

  if (pageStr || limitStr) {
    return json({ data: withRecent, total, page, limit });
  }

  // Backwards compatibility for endpoints that expect an array
  return json(withRecent);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const b = await readBody(req);
  try {
    const product = await prisma.product.create({
      data: {
        shopId: shop.id,
        name: b.name,
        category: b.category,
        currentStock: b.current_stock ?? b.currentStock,
        minStock: b.min_stock ?? b.minStock,
        mrp: b.mrp,
        sellingPrice: b.selling_price ?? b.sellingPrice,
        wholesaleCost: b.wholesale_cost ?? b.wholesaleCost,
        baseUnit: b.base_unit ?? b.baseUnit,
        barcode: b.barcode,
        is_loose: b.is_loose ?? b.isLoose,
        expiryDate: b.expiry_date ?? b.expiryDate,
        batch_number: b.batch_number ?? b.batchNumber,
        drug_schedule: b.drug_schedule ?? b.drugSchedule,
        model_number: b.model_number ?? b.modelNumber,
        warranty_months: b.warranty_months ?? b.warrantyMonths,
        gender: b.gender,
        shade: b.shade,
        size_variants: b.size_variants ?? b.sizeVariants,
        metadata: b.metadata,
        variants: b.variants,
        brand: b.brand,
        hsnCode: b.hsnCode ?? b.hsn_code,
        productType: b.productType ?? b.product_type,
        gstPercent: b.gstPercent ?? b.gst_percent,
        categoryId: b.categoryId ?? b.category_id,
        brandId: b.brandId ?? b.brand_id,
        baseUnitId: b.baseUnitId ?? b.base_unit_id,
        defaultSaleUnitId: b.defaultSaleUnitId ?? b.default_sale_unit_id,
        defaultPurchaseUnitId: b.defaultPurchaseUnitId ?? b.default_purchase_unit_id,
        maxStock: b.maxStock ?? b.max_stock,
        wholesaleMoq: b.wholesaleMoq ?? b.wholesale_moq,
        conversionFactor: b.conversionFactor ?? b.conversion_factor,
      },
    });
    // Record the opening stock as a stock-in movement so the Products/Stock lists
    // can surface a "+N newly added" badge (and for the audit trail).
    const openingQty = Number(product.currentStock) || 0;
    if (openingQty > 0) {
      await prisma.stockLog.create({
        data: { shopId: shop.id, productId: product.id, type: 'in', quantity: openingQty, note: 'Opening stock' },
      }).catch((e) => console.error('Failed to write opening StockLog:', e));
    }
    return json(product, 201);
  } catch (error: any) {
    if (error.code === 'P2002' && error.meta?.target?.includes('barcode')) {
      throw new ApiError(400, 'A product with this Barcode/SKU already exists.');
    }
    throw error;
  }
});
