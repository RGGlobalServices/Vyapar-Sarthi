import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { assertOwned } from '@/lib/server/ownership';
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
  if (!Number.isFinite(qty) || qty <= 0) throw new ApiError(400, 'quantity must be a positive number');

  // Godowns were already shop-filtered below; the product was not.
  await assertOwned(shop.id, { productId, godownId: [fromGodownId, toGodownId] });

  const result = await prisma.$transaction(async (tx) => {
    // Lock the product row FIRST (same order as stock/adjust and sales). Without it, two opposite
    // transfers (A->B and B->A) take the two godown_products rows in opposite order and deadlock
    // (Postgres 40P01); with it they simply queue per product.
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid AND shop_id = ${shop.id}::uuid FOR UPDATE`;

    const destGodown = (await tx.$queryRaw`SELECT name FROM godowns WHERE id = ${toGodownId}::uuid AND shop_id = ${shop.id}::uuid LIMIT 1`) as Array<{ name: string }>;
    if (!destGodown || destGodown.length === 0) throw new ApiError(404, 'Destination godown not found');

    const sourceNameRows = (await tx.$queryRaw`SELECT name FROM godowns WHERE id = ${fromGodownId}::uuid AND shop_id = ${shop.id}::uuid LIMIT 1`) as Array<{ name: string }>;
    if (!sourceNameRows || sourceNameRows.length === 0) throw new ApiError(404, 'Source godown not found');

    const deducted = await tx.$executeRaw`
      UPDATE godown_products
      SET quantity = quantity - ${qty}, updated_at = NOW()
      WHERE godown_id = ${fromGodownId}::uuid AND product_id = ${productId}::uuid
        AND quantity >= ${qty}
        AND godown_id IN (SELECT id FROM godowns WHERE shop_id = ${shop.id}::uuid)
    `;
    if (deducted === 0) {
      const sourceStock = (await tx.$queryRaw`
        SELECT quantity FROM godown_products
        WHERE godown_id = ${fromGodownId}::uuid AND product_id = ${productId}::uuid
      `) as Array<{ quantity: number }>;
      const avail = sourceStock?.[0]?.quantity ?? 0;
      throw new ApiError(400, `Insufficient stock in source godown (available: ${avail})`);
    }

    await tx.$executeRaw`
      INSERT INTO godown_products (id, godown_id, product_id, quantity, updated_at)
      VALUES (gen_random_uuid(), ${toGodownId}::uuid, ${productId}::uuid, ${qty}, NOW())
      ON CONFLICT (godown_id, product_id) DO UPDATE SET quantity = godown_products.quantity + ${qty}, updated_at = NOW()
    `;

    // Audit rows are part of the SAME transaction: source decrement, destination
    // increment and both movement records commit together or not at all.
    await tx.$executeRaw`
      INSERT INTO stock_movements (id, shop_id, product_id, warehouse_id, type, quantity, reference_id)
      VALUES (gen_random_uuid(), ${shop.id}::uuid, ${productId}::uuid, ${fromGodownId}::uuid, 'transfer_out', ${qty}, ${toGodownId}::uuid)
    `;
    await tx.$executeRaw`
      INSERT INTO stock_movements (id, shop_id, product_id, warehouse_id, type, quantity, reference_id)
      VALUES (gen_random_uuid(), ${shop.id}::uuid, ${productId}::uuid, ${toGodownId}::uuid, 'transfer_in', ${qty}, ${fromGodownId}::uuid)
    `;

    return { fromName: sourceNameRows[0].name, toName: destGodown[0].name };
  }, { maxWait: 30000, timeout: 60000 });

  return json({ detail: `Transferred ${qty} units from ${result.fromName} to ${result.toName}` });
});
