const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const shop = await prisma.shop.findFirst();
    if (!shop) return console.log('no shop');
    console.log('Shop ID:', shop.id);
    const products = await prisma.product.findMany({ where: { shopId: shop.id } });
    console.log('Products:', products.length);
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    await prisma.$disconnect();
  }
}
run();
