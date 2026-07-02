import prisma from './lib/server/prisma';

async function check() {
  const shops = await prisma.shop.findMany({
    select: { name: true, businessType: true }
  });
  console.log(shops);
}

check().catch(console.error).finally(() => process.exit(0));
