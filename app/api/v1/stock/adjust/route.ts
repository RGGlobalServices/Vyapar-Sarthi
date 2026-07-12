import { NextResponse } from 'next/server';
import { requireShop } from '@/lib/server/auth';
import prisma from '@/lib/server/prisma';
import { ensureWholesaleTables } from '@/lib/server/wholesale';
import { checkLowStockAlerts } from '@/lib/server/notificationsEngine';

export async function POST(req: Request) {
  try {
    const auth = await requireShop(req);
    await ensureWholesaleTables();

    const data = await req.json();
    const { productId, warehouseId, difference, reason, notes } = data;

    if (!productId || !warehouseId || typeof difference !== 'number') {
      return NextResponse.json({ error: 'Invalid adjustment details.' }, { status: 400 });
    }

    if (difference === 0) {
      return NextResponse.json({ error: 'Difference cannot be zero.' }, { status: 400 });
    }

    if (difference < 0) {
      const current = await prisma.godownProduct.findUnique({
        where: { godownId_productId: { godownId: warehouseId, productId } }
      });
      if (!current || current.quantity + difference < 0) {
        return NextResponse.json({ error: 'Negative stock is not allowed.' }, { status: 400 });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Update Warehouse Stock
      await tx.$executeRaw`
        INSERT INTO godown_products (id, godown_id, product_id, quantity, updated_at)
        VALUES (gen_random_uuid(), ${warehouseId}::uuid, ${productId}::uuid, ${difference}, NOW())
        ON CONFLICT (godown_id, product_id)
        DO UPDATE SET 
          quantity = godown_products.quantity + ${difference},
          updated_at = NOW()
      `;

      // Update Global Product Stock
      await tx.product.update({
        where: { id: productId },
        data: {
          currentStock: { increment: difference }
        }
      });

      // Log Adjustment
      await tx.stockMovement.create({
        data: {
          shopId: auth.shop.id,
          productId,
          warehouseId,
          type: 'adjustment',
          quantity: Math.abs(difference),
          referenceId: null,
        },
      });

      await tx.activityLog.create({
        data: {
          shopId: auth.shop.id,
          action: 'stock_adjusted',
          entityId: productId,
          details: { productId, difference, warehouseId, reason: reason || 'Manual adjustment' }
        }
      });

      return { success: true };
    });

    try {
      await prisma.$transaction(async (tx) => {
        await checkLowStockAlerts(tx, auth.shop.id, [productId]);
      });
    } catch(e) { console.error('Low stock alert failed', e); }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] Error processing stock adjustment:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
