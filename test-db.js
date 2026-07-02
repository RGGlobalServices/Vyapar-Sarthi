const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const sales = await prisma.sale.findMany({ orderBy: { createdAt: 'desc' }, take: 2 });
  const txs = await prisma.customer_transactions.findMany({ orderBy: { created_at: 'desc' }, take: 2 });
  const custs = await prisma.customer.findMany({ include: { customer_transactions: true }, orderBy: { name: 'asc' } });
  console.log(JSON.stringify({ sales, txs, custs }, null, 2));
}
main().finally(() => prisma.$disconnect());
