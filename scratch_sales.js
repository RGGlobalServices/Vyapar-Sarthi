const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const startDate = new Date('2026-07-21T18:30:00.000Z');
  const endDate = new Date('2026-07-22T18:29:59.999Z');
  const shopId = '768dd941-620d-45a8-a94b-90ddae19b9ce';
  const sales = await prisma.sale.aggregate({
    where: { shopId, createdAt: { gte: startDate, lte: endDate } },
    _sum: { totalAmount: true, totalProfit: true, amountPaid: true }
  });
  console.log('Gross Sales:', sales);
}
main().finally(() => prisma.$disconnect());
