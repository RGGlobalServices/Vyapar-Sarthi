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
          { barcode: { equals: q } }
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

  const [products, total] = await Promise.all([
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
    pageStr || limitStr ? prisma.product.count({ where }) : Promise.resolve(0)
  ]);
  
  if (pageStr || limitStr) {
    return json({ data: products, total, page, limit });
  }
  
  // Backwards compatibility for endpoints that expect an array
  return json(products);
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
      },
    });
    return json(product, 201);
  } catch (error: any) {
    if (error.code === 'P2002' && error.meta?.target?.includes('barcode')) {
      throw new ApiError(400, 'A product with this Barcode/SKU already exists.');
    }
    throw error;
  }
});
