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
  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      name: b.name,
      category: b.category,
      currentStock: b.current_stock,
      minStock: b.min_stock,
      mrp: b.mrp,
      sellingPrice: b.selling_price,
      wholesaleCost: b.wholesale_cost,
      baseUnit: b.base_unit,
      barcode: b.barcode,
      is_loose: b.is_loose,
      expiryDate: b.expiry_date,
      batch_number: b.batch_number,
      drug_schedule: b.drug_schedule,
      model_number: b.model_number,
      warranty_months: b.warranty_months,
      gender: b.gender,
      shade: b.shade,
      size_variants: b.size_variants,
    },
  });
  return json(updated);
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { productId } = await params;
  const { shop } = await requireShop(req);
  const product = await prisma.product.findFirst({ where: { id: productId, shopId: shop.id } });
  if (!product) throw new ApiError(404, 'Product not found');
  await prisma.product.delete({ where: { id: productId } });
  return json({ detail: 'Product deleted' });
});
