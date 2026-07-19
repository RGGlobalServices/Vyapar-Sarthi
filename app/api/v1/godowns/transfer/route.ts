import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /godowns/transfer — move stock between two godowns
export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);

  const { fromGodownId, toGodownId, productId, quantity } = await readBody(req);
  if (!fromGodownId || !toGodownId || !productId || !quantity) {
    throw new ApiError(400, 'fromGodownId, toGodownId, productId, quantity required');
  }
  if (fromGodownId === toGodownId) {
    throw new ApiError(400, 'Source and destination godown must be different');
  }

  const qty = parseFloat(quantity);
  if (qty <= 0) throw new ApiError(400, 'quantity must be positive');

  const source = (await prisma.$queryRaw`
    SELECT gp.quantity, g.name FROM godown_products gp
    JOIN godowns g ON g.id = gp.godown_id
    WHERE gp.godown_id = ${fromGodownId}::uuid AND gp.product_id = ${productId}::uuid
      AND g.shop_id = ${shop.id}::uuid
    LIMIT 1
  `) as Array<{ quantity: number; name: string }>;
  if (!source || source.length === 0 || source[0].quantity < qty) {
    throw new ApiError(400, `Insufficient stock in source godown (available: ${source?.[0]?.quantity ?? 0})`);
  }

  const destGodown = (await prisma.$queryRaw`SELECT name FROM godowns WHERE id = ${toGodownId}::uuid AND shop_id = ${shop.id}::uuid LIMIT 1`) as Array<{ name: string }>;
  if (!destGodown || destGodown.length === 0) throw new ApiError(404, 'Destination godown not found');

  await prisma.$executeRaw`UPDATE godown_products SET quantity = quantity - ${qty}, updated_at = NOW() WHERE godown_id = ${fromGodownId}::uuid AND product_id = ${productId}::uuid`;
  await prisma.$executeRaw`
    INSERT INTO godown_products (godown_id, product_id, quantity, updated_at)
    VALUES (${toGodownId}::uuid, ${productId}::uuid, ${qty}, NOW())
    ON CONFLICT (godown_id, product_id) DO UPDATE SET quantity = godown_products.quantity + ${qty}, updated_at = NOW()
  `;

  // Log stock movements
  await prisma.$executeRaw`
    INSERT INTO stock_movements (shop_id, product_id, warehouse_id, type, quantity, reference_id)
    VALUES (${shop.id}::uuid, ${productId}::uuid, ${fromGodownId}::uuid, 'transfer_out', ${qty}, ${toGodownId}::uuid)
  `;
  await prisma.$executeRaw`
    INSERT INTO stock_movements (shop_id, product_id, warehouse_id, type, quantity, reference_id)
    VALUES (${shop.id}::uuid, ${productId}::uuid, ${toGodownId}::uuid, 'transfer_in', ${qty}, ${fromGodownId}::uuid)
  `;

  return json({ detail: `Transferred ${qty} units from ${source[0].name} to ${destGodown[0].name}` });
});
