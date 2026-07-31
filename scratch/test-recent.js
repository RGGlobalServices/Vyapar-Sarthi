require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const shop = await prisma.shop.findFirst({ where: { name: { contains: 'Fasttrack', mode: 'insensitive' } } });
  const since = new Date(Date.now() - 24*60*60*1000);
  const recent = await prisma.stockLog.groupBy({
    by: ['productId'],
    where: { shopId: shop.id, quantity: { gt: 0 }, createdAt: { gte: since }, type: { in: ['in','opening','import','receive','purchase','adjustment'] } },
    _sum: { quantity: true },
  }).catch(e => { console.log('groupBy error:', e.message); return []; });
  console.log(`Products with stock added in last 24h: ${recent.length}`);
  // Simulate: create a test stock-in, re-run, then clean up
  const p = await prisma.product.findFirst({ where: { shopId: shop.id }, select: { id: true, name: true } });
  const log = await prisma.stockLog.create({ data: { shopId: shop.id, productId: p.id, type: 'in', quantity: 25, note: 'test' } });
  const after = await prisma.stockLog.groupBy({ by: ['productId'], where: { shopId: shop.id, productId: p.id, quantity: { gt: 0 }, createdAt: { gte: since }, type: { in: ['in','opening','import'] } }, _sum: { quantity: true } });
  console.log(`After test +25 on "${p.name}": recentlyAdded = ${after[0]?._sum?.quantity} ${after[0]?._sum?.quantity>=25?'PASS':'FAIL'}`);
  await prisma.stockLog.delete({ where: { id: log.id } }); // cleanup test row
  console.log('Cleaned up test log.');
})().catch(e=>console.error(e.message)).finally(()=>process.exit(0));
