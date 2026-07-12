const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    // Find a shop to test
    const shop = await prisma.shop.findFirst({
      where: { name: 'Gosavi Hardwares' } // from screenshot
    });
    if (!shop) {
      console.log('Shop not found');
      return;
    }
    console.log('Found shop:', shop.id, shop.name, 'ownerId:', shop.ownerId);

    // Try setting ownerId to null
    await prisma.shop.update({
      where: { id: shop.id },
      data: { ownerId: null }
    });
    console.log('SUCCESS');
  } catch (e) {
    console.error('ERROR OCCURRED:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
