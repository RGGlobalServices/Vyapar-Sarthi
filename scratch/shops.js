require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const shops = await prisma.shop.findMany({ select: { id: true, name: true, subscriptionPlan: true } });
  console.log(`Total shops: ${shops.length}`);
  for (const s of shops) {
    const total = await prisma.product.count({ where: { shopId: s.id, OR:[{archived:false},{archived:null}] } });
    const withStock = await prisma.product.count({ where: { shopId: s.id, currentStock: { gt: 0 } } });
    const br = await prisma.product.findFirst({ where: { shopId: s.id, name: { contains: 'Baby Romper', mode:'insensitive' } }, select: { currentStock: true } });
    console.log(`  ${s.name.padEnd(20)} id=${s.id.slice(0,8)} plan=${s.subscriptionPlan} | products=${total} withStock=${withStock} | BabyRomper=${br ? br.currentStock : 'n/a'}`);
  }
})().catch(e=>console.error(e.message)).finally(()=>process.exit(0));
