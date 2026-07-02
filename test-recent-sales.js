const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const shop = await prisma.shop.findFirst();
    if (!shop) return;
    
    // Let's get ALL sales ordered by createdAt desc
    const sales = await prisma.sale.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    console.log("Recent sales:", sales.map(s => ({
      id: s.id,
      amt: s.totalAmount,
      date: s.createdAt,
      invoice: s.invoice_number
    })));
    
  } finally {
    await prisma.$disconnect();
  }
}

main();
