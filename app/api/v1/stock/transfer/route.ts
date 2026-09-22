import { NextResponse } from 'next/server';
import { requireShop } from '@/lib/server/auth';
import { assertOwned } from '@/lib/server/ownership';
import { apiErrorResponse } from '@/lib/server/http';
import prisma from '@/lib/server/prisma';
import { ensureWholesaleTables } from '@/lib/server/wholesale';

export async function POST(req: Request) {
  try {
    const auth = await requireShop(req);
    await ensureWholesaleTables();



    const data = await req.json();
    const { productId, fromWarehouseId, toWarehouseId, quantity, reason, notes } = data;

    if (!productId || !fromWarehouseId || !toWarehouseId || !quantity || quantity <= 0) {
      return NextResponse.json({ error: 'Invalid transfer details.' }, { status: 400 });
    }

    if (fromWarehouseId === toWarehouseId) {
      return NextResponse.json({ error: 'Source and destination warehouse cannot be the same.' }, { status: 400 });
    }

    // Product and BOTH warehouses must belong to this shop. Checked before the
    // transaction so a foreign id fails with nothing written.
    await assertOwned(auth.shop.id, { productId, godownId: [fromWarehouseId, toWarehouseId] });

    const result = await prisma.$transaction(async (tx) => {
      // Lock the product row first (same order as godowns/transfer, stock/adjust and sales) so
      // opposite-direction transfers queue per product instead of deadlocking on godown_products.
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid AND shop_id = ${auth.shop.id}::uuid FOR UPDATE`;

      // Deduct from Source Warehouse atomically with stock guard
      const deducted = await tx.$executeRaw`
        UPDATE godown_products 
        SET quantity = quantity - ${quantity}, updated_at = NOW()
        WHERE godown_id = ${fromWarehouseId}::uuid AND product_id = ${productId}::uuid
          AND quantity >= ${quantity}
          AND godown_id IN (SELECT id FROM godowns WHERE shop_id = ${auth.shop.id}::uuid)
      `;
      if (deducted === 0) {
        throw new Error('Insufficient stock in source warehouse.');
      }

      // Add to Destination Warehouse
      await tx.$executeRaw`
        INSERT INTO godown_products (id, godown_id, product_id, quantity, updated_at)
        SELECT gen_random_uuid(), ${toWarehouseId}::uuid, ${productId}::uuid, ${quantity}, NOW()
        WHERE EXISTS (SELECT 1 FROM godowns WHERE id = ${toWarehouseId}::uuid AND shop_id = ${auth.shop.id}::uuid)
        ON CONFLICT (godown_id, product_id)
        DO UPDATE SET 
          quantity = godown_products.quantity + ${quantity},
          updated_at = NOW()
      `;

      // Log Transfer Out
      await tx.stockMovement.create({
        data: {
          shopId: auth.shop.id,
          productId,
          warehouseId: fromWarehouseId,
          type: 'transfer_out',
          quantity: quantity,
          referenceId: null, // Could be a Transfer ID if we had a Transfer table
        },
      });

      // Log Transfer In
      await tx.stockMovement.create({
        data: {
          shopId: auth.shop.id,
          productId,
          warehouseId: toWarehouseId,
          type: 'transfer_in',
          quantity: quantity,
          referenceId: null,
        },
      });

      return { success: true };
    }, { maxWait: 30000, timeout: 60000 });

    return NextResponse.json(result);
  } catch (error: any) {
    const known = apiErrorResponse(error);
    if (known) return known;
    console.error('[API] Error processing stock transfer:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
