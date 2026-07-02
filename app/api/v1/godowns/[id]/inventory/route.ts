import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { ensureGodownTables } from '@/lib/server/godowns';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// POST /godowns/:id/inventory — upsert product stock in this godown
export const POST = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const { productId, quantity } = await readBody(req);
  if (!productId) throw new ApiError(400, 'productId required');
  if (quantity === undefined || quantity < 0) throw new ApiError(400, 'quantity must be >= 0');
  await ensureGodownTables();

  const godown = (await prisma.$queryRaw`SELECT id FROM godowns WHERE id = ${id}::uuid AND shop_id = ${shop.id}::uuid LIMIT 1`) as unknown[];
  if (!godown || godown.length === 0) throw new ApiError(404, 'Godown not found');

  const product = (await prisma.$queryRaw`SELECT id, name, base_unit FROM products WHERE id = ${productId}::uuid AND shop_id = ${shop.id}::uuid LIMIT 1`) as unknown[];
  if (!product || product.length === 0) throw new ApiError(404, 'Product not found in this shop');

  const rows = (await prisma.$queryRaw`
    INSERT INTO godown_products (godown_id, product_id, quantity, updated_at)
    VALUES (${id}::uuid, ${productId}::uuid, ${parseFloat(quantity)}, NOW())
    ON CONFLICT (godown_id, product_id) DO UPDATE
      SET quantity = ${parseFloat(quantity)}, updated_at = NOW()
    RETURNING *
  `) as Array<Record<string, unknown>>;
  return json({ ...rows[0], product: product[0] });
});
