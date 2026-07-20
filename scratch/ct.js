require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const shop = await prisma.shop.findFirst({ where: { name: { contains: 'Fasttrack', mode: 'insensitive' } } });
  const all = await prisma.customer.groupBy({ by: ['customerType'], where: { shopId: shop.id }, _count: true });
  console.log(JSON.stringify(all, null, 2));
})().catch(e=>console.error(e.message)).finally(()=>process.exit(0));
