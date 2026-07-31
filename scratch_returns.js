const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const returns = await prisma.materialReturn.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log(JSON.stringify(returns, null, 2));
}
main().finally(() => prisma.$disconnect());
