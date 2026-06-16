import prisma from './prisma';

export function generateGodownCode(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
  const suffix = Math.floor(Math.random() * 9000) + 1000;
  return `GDN-${clean}${suffix}`;
}

// ── raw-SQL helpers (work before `prisma generate` picks up new models) ──
export async function dbGodowns(shopId: string) {
  return prisma.$queryRaw`
    SELECT g.*, COALESCE(json_agg(
      json_build_object(
        'id', gp.id,
        'productId', gp.product_id,
        'quantity', gp.quantity,
        'updatedAt', gp.updated_at,
        'product', json_build_object(
          'id', p.id, 'name', p.name, 'category', p.category,
          'baseUnit', p.base_unit, 'mrp', p.mrp,
          'sellingPrice', p.selling_price, 'currentStock', p.current_stock
        )
      ) ORDER BY gp.updated_at DESC
    ) FILTER (WHERE gp.id IS NOT NULL), '[]') AS inventory
    FROM godowns g
    LEFT JOIN godown_products gp ON gp.godown_id = g.id
    LEFT JOIN products p ON p.id = gp.product_id
    WHERE g.shop_id = ${shopId}::uuid
    GROUP BY g.id
    ORDER BY g.created_at ASC
  `;
}

export async function dbGodown(id: string, shopId: string) {
  const rows = (await prisma.$queryRaw`
    SELECT g.*, COALESCE(json_agg(
      json_build_object(
        'id', gp.id,
        'productId', gp.product_id,
        'quantity', gp.quantity,
        'updatedAt', gp.updated_at,
        'product', json_build_object(
          'id', p.id, 'name', p.name, 'category', p.category,
          'baseUnit', p.base_unit, 'mrp', p.mrp,
          'sellingPrice', p.selling_price, 'currentStock', p.current_stock
        )
      ) ORDER BY gp.updated_at DESC
    ) FILTER (WHERE gp.id IS NOT NULL), '[]') AS inventory
    FROM godowns g
    LEFT JOIN godown_products gp ON gp.godown_id = g.id
    LEFT JOIN products p ON p.id = gp.product_id
    WHERE g.id = ${id}::uuid AND g.shop_id = ${shopId}::uuid
    GROUP BY g.id
  `) as unknown[];
  return rows[0] ?? null;
}
