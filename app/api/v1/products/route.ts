import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req, { enforceSubscription: false });
  const products = await prisma.product.findMany({ 
    where: { 
      shopId: shop.id,
      OR: [{ archived: false }, { archived: null }]
    },
    include: {
      _count: {
        select: {
          godownProducts: { where: { quantity: { gt: 0 } } }
        }
      }
    }
  });
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
