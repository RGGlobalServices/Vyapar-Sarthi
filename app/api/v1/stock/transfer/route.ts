import { NextResponse } from 'next/server';
import { requireShop } from '@/lib/server/auth';
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

    const result = await prisma.$transaction(async (tx) => {
      // Deduct from Source Warehouse
      await tx.$executeRaw`
        UPDATE godown_products 
        SET quantity = quantity - ${quantity}, updated_at = NOW()
        WHERE godown_id = ${fromWarehouseId}::uuid AND product_id = ${productId}::uuid
      `;

      // Add to Destination Warehouse
      await tx.$executeRaw`
        INSERT INTO godown_products (id, godown_id, product_id, quantity, updated_at)
        VALUES (gen_random_uuid(), ${toWarehouseId}::uuid, ${productId}::uuid, ${quantity}, NOW())
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
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] Error processing stock transfer:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
