const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const shop = await prisma.shop.findFirst({
      include: { owner: true }
    });
    console.log("Shop ownerId:", shop?.ownerId);
    
    // Check if godowns table exists
    const tables = await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='godowns'`;
    console.log("Godowns table exists:", tables.length > 0);
    
    if (tables.length > 0) {
        const godowns = await prisma.$queryRaw`SELECT * FROM godowns LIMIT 1`;
        console.log("Godowns:", godowns);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}
main();
