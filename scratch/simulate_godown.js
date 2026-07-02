const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function ensureGodownTables() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS public.godowns (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shop_id      UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
      owner_id     UUID NOT NULL,
      name         VARCHAR NOT NULL,
      location     VARCHAR,
      godown_code  VARCHAR NOT NULL UNIQUE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS godowns_shop_id_idx  ON public.godowns(shop_id)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS godowns_owner_id_idx ON public.godowns(owner_id)`;
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS public.godown_products (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      godown_id   UUID NOT NULL REFERENCES public.godowns(id) ON DELETE CASCADE,
      product_id  UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
      quantity    FLOAT NOT NULL DEFAULT 0,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(godown_id, product_id)
    )
  `;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS godown_products_godown_idx  ON public.godown_products(godown_id)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS godown_products_product_idx ON public.godown_products(product_id)`;
}

async function main() {
  try {
    await ensureGodownTables();
    console.log("ensureGodownTables completed");
    
    const shop = await prisma.shop.findFirst({ include: { owner: true } });
    if (!shop) return console.log("No shop found");
    
    const name = "Test Godown";
    const godownCode = "TEST";
    
    console.log(`Inserting godown for shop ${shop.id} and owner ${shop.ownerId}`);
    
    const rows = await prisma.$queryRaw`
      INSERT INTO godowns (shop_id, owner_id, name, location, godown_code)
      VALUES (${shop.id}::uuid, ${shop.ownerId}::uuid, ${name}, null, ${godownCode})
      RETURNING *
    `;
    console.log("Godown created:", rows);
    
    // Cleanup
    if (rows && rows.length > 0) {
      await prisma.$executeRaw`DELETE FROM godowns WHERE id = ${rows[0].id}::uuid`;
    }
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}
main();
