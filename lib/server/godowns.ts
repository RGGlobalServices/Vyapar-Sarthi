import prisma from './prisma';

// Auto-create godowns and godown_products tables on first use so the feature
// works without a manual Supabase SQL migration step.
export async function ensureGodownTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public.godowns (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shop_id      UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
      owner_id     UUID NOT NULL,
      name         VARCHAR NOT NULL,
      location     VARCHAR,
      godown_code  VARCHAR NOT NULL UNIQUE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS godowns_shop_id_idx  ON public.godowns(shop_id)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS godowns_owner_id_idx ON public.godowns(owner_id)`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public.godown_products (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      godown_id   UUID NOT NULL REFERENCES public.godowns(id) ON DELETE CASCADE,
      product_id  UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
      quantity    FLOAT NOT NULL DEFAULT 0,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(godown_id, product_id)
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS godown_products_godown_idx  ON public.godown_products(godown_id)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS godown_products_product_idx ON public.godown_products(product_id)`);
}

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
          'sellingPrice', p.selling_price, 'currentStock', p.current_stock,
          'wholesaleCost', p.wholesale_cost, 'minStock', p.min_stock,
          'batchNumber', p.batch_number, 'expiryDate', p.expiry_date,
          'brand', p.brand, 'barcode', p.barcode
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
          'sellingPrice', p.selling_price, 'currentStock', p.current_stock,
          'wholesaleCost', p.wholesale_cost, 'minStock', p.min_stock,
          'batchNumber', p.batch_number, 'expiryDate', p.expiry_date,
          'brand', p.brand, 'barcode', p.barcode
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
