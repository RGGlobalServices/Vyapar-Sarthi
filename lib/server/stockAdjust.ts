import type { Prisma } from '@prisma/client';
import { ApiError } from '@/lib/server/http';

// The two writes behind a manual stock adjustment: the warehouse (godown) row and
// the product's total. They must succeed or fail TOGETHER, and only for rows that
// belong to `shopId` — so each statement is shop-scoped and its affected-row count
// is checked. If either does not match a row of this shop it throws, which rolls
// back the surrounding transaction (including any write that already ran).
//
// The route also runs assertOwned() before opening the transaction; this is the
// in-transaction guarantee behind it.
export async function applyStockAdjustment(
  tx: Prisma.TransactionClient,
  args: { shopId: string; warehouseId: string; productId: string; difference: number }
) {
  const { shopId, warehouseId, productId, difference } = args;

  if (difference < 0) {
    const dec = Math.abs(difference);
    const updated = await tx.$executeRaw`
      UPDATE products
      SET current_stock = COALESCE(current_stock, 0) - ${dec}
      WHERE id = ${productId}::uuid AND shop_id = ${shopId}::uuid
        AND COALESCE(current_stock, 0) >= ${dec}
    `;
    if (updated === 0) {
      const p = await tx.product.findFirst({ where: { id: productId, shopId } });
      if (!p) throw new ApiError(404, 'Product not found');
      throw new ApiError(400, 'Negative stock is not allowed.');
    }

    const warehouseRows = await tx.$executeRaw`
      UPDATE godown_products
      SET quantity = quantity - ${dec}, updated_at = NOW()
      WHERE godown_id = ${warehouseId}::uuid AND product_id = ${productId}::uuid
        AND quantity >= ${dec}
        AND godown_id IN (SELECT id FROM godowns WHERE shop_id = ${shopId}::uuid)
    `;
    if (warehouseRows === 0) {
      const g = await tx.godown.findFirst({ where: { id: warehouseId, shopId } });
      if (!g) throw new ApiError(404, 'Warehouse not found');
      throw new ApiError(400, 'Negative stock is not allowed.');
    }
  } else {
    const product = await tx.product.updateMany({
      where: { id: productId, shopId },
      data: { currentStock: { increment: difference } },
    });
    if (product.count === 0) throw new ApiError(404, 'Product not found');

    const warehouseRows = await tx.$executeRaw`
      INSERT INTO godown_products (id, godown_id, product_id, quantity, updated_at)
      SELECT gen_random_uuid(), ${warehouseId}::uuid, ${productId}::uuid, ${difference}, NOW()
      WHERE EXISTS (SELECT 1 FROM godowns WHERE id = ${warehouseId}::uuid AND shop_id = ${shopId}::uuid)
      ON CONFLICT (godown_id, product_id)
      DO UPDATE SET
        quantity = godown_products.quantity + ${difference},
        updated_at = NOW()
    `;
    if (warehouseRows === 0) throw new ApiError(404, 'Warehouse not found');
  }
}
