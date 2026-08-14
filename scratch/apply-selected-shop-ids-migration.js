const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_shop_ids TEXT[] DEFAULT '{}'`);
    const check = await prisma.$queryRaw`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'selected_shop_ids'
    `;
    console.log('Column present:', check);
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
main();
