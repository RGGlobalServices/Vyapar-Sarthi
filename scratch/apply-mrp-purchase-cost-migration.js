const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price_mode VARCHAR DEFAULT 'manual'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_discount_percent FLOAT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS mrp FLOAT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS discount_percent FLOAT`);
    const check = await prisma.$queryRaw`
      SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE (table_name = 'products' AND column_name IN ('cost_price_mode', 'purchase_discount_percent'))
         OR (table_name = 'purchase_items' AND column_name IN ('mrp', 'discount_percent'))
    `;
    console.log('Columns present:', check);
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
main();
