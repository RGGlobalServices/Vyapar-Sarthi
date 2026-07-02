const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const shop = await prisma.shop.findFirst();
    if (!shop) return;
    
    const count = await prisma.sale.count({
      where: { shopId: shop.id }
    });
    console.log(`Total Sales in DB: ${count}`);
    
    const maySales = await prisma.sale.findMany({
      where: { shopId: shop.id, createdAt: { gte: new Date('2026-05-01'), lte: new Date('2026-05-31') } }
    });
    console.log(`May Sales: ${maySales.length}`);
    
    const juneSales = await prisma.sale.findMany({
      where: { shopId: shop.id, createdAt: { gte: new Date('2026-06-01'), lte: new Date('2026-06-30') } }
    });
    console.log(`June Sales: ${juneSales.length}`);
    
  } finally {
    await prisma.$disconnect();
  }
}

main();
