import { isMillBillingPackage } from '@/lib/config/packageConfig';

/**
 * Keeps the godown (warehouse) stock in step with the product's total stock — Bada Udyog (mill) only.
 *
 * Purchases, production and manual adjustments already write godown_products. Bills, challans, dispatches, returns, by-product sales and
 * job-work only changed products.current_stock, so the godown figures drifted away from the product total. These two helpers are the missing
 * half: call the one that matches whatever you just did to the product's stock, in the same transaction (or the same $transaction array).
 *
 *  - debitGodown: stock went OUT — taken from the godown(s) holding the most of that product first, never below zero in any godown.
 *    If the godowns hold less than the product total says (an old mismatch), they simply reach 0; the product total stays the truth.
 *  - creditGodown: stock came IN — added to the godown that already holds the product (the one with the most), else the shop's first godown.
 *    A shop without a godown is left alone.
 *
 * Each is ONE statement, so it works inside an interactive transaction (`tx`) and inside a `prisma.$transaction([...])` array alike.
 */
export const syncsGodownStock = (shop: { packageType?: string | null } | null | undefined) => isMillBillingPackage((shop as any)?.packageType);

export function debitGodown(db: any, shopId: string, productId: string, qty: number) {
  return db.$executeRawUnsafe(
    `WITH rows AS (
       SELECT gp.id, gp.quantity,
              COALESCE(SUM(gp.quantity) OVER (ORDER BY gp.quantity DESC, gp.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS before
         FROM godown_products gp JOIN godowns g ON g.id = gp.godown_id
        WHERE g.shop_id = $1::uuid AND gp.product_id = $2::uuid AND gp.quantity > 0)
     UPDATE godown_products gp
        SET quantity = gp.quantity - LEAST(r.quantity, GREATEST($3::float8 - r.before, 0)), updated_at = now()
       FROM rows r
      WHERE gp.id = r.id AND GREATEST($3::float8 - r.before, 0) > 0`,
    shopId, productId, qty);
}

export function creditGodown(db: any, shopId: string, productId: string, qty: number) {
  return db.$executeRawUnsafe(
    `INSERT INTO godown_products (id, godown_id, product_id, quantity, updated_at)
     SELECT gen_random_uuid(), g.id, $2::uuid, $3::float8, now()
       FROM godowns g
      WHERE g.shop_id = $1::uuid
      ORDER BY COALESCE((SELECT x.quantity FROM godown_products x WHERE x.godown_id = g.id AND x.product_id = $2::uuid), -1) DESC, g.created_at ASC
      LIMIT 1
     ON CONFLICT (godown_id, product_id) DO UPDATE SET quantity = godown_products.quantity + $3::float8, updated_at = now()`,
    shopId, productId, qty);
}
