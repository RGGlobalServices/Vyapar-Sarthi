import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req, { enforceSubscription: false });
  const products = await prisma.product.findMany({ where: { shopId: shop.id } });
  return json(products);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const b = await readBody(req);
  const product = await prisma.product.create({
    data: {
      shopId: shop.id,
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
  return json(product, 201);
});
