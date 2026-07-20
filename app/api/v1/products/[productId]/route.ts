import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

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
    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
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
        metadata: b.metadata !== undefined ? b.metadata : undefined,
        variants: b.variants !== undefined ? b.variants : undefined,
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
        conversionFactor: b.conversionFactor ?? b.conversion_factor,
        wholesaleMoq: b.wholesaleMoq ?? b.wholesale_moq,
      },
    });
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
  const { shop } = await requireShop(req);
  const product = await prisma.product.findFirst({ where: { id: productId, shopId: shop.id } });
  if (!product) throw new ApiError(404, 'Product not found');
  
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
