const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE products ADD COLUMN IF NOT EXISTS location VARCHAR`);
    const check = await prisma.$queryRaw`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'products' AND column_name = 'location'
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
