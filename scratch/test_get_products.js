const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const shop = await prisma.shop.findFirst({});
    if (!shop) return console.log("No shop");
    const products = await prisma.product.findMany({ where: { shopId: shop.id } });
    console.log("Success! Products count:", products.length);
  } catch (err) {
    console.error("Prisma error:", err);
  } finally {
    await prisma.$disconnect();
  }
}
main();
