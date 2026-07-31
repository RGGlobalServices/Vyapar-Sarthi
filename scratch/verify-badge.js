require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const shop = await prisma.shop.findFirst({ where: { name: { contains: 'Fasttrack', mode: 'insensitive' } } });
  const since = new Date(Date.now() - 24*60*60*1000);
  // Recent stock-in logs
  const logs = await prisma.stockLog.findMany({ where: { shopId: shop.id, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 10, include: { products: { select: { name: true } } } });
  console.log(`Stock logs in last 24h: ${logs.length}`);
  logs.forEach(l => console.log(`  ${l.products?.name || l.productId?.slice(0,8)} | type=${l.type} qty=${l.quantity} | ${l.createdAt.toISOString()}`));
  // What recentlyAdded would compute
  const recent = await prisma.stockLog.groupBy({ by: ['productId'], where: { shopId: shop.id, quantity: { gt: 0 }, createdAt: { gte: since }, type: { in: ['in','opening','import','receive','purchase','adjustment'] } }, _sum: { quantity: true } });
  console.log(`\nProducts that would show a badge: ${recent.length}`);
  for (const r of recent) { const p = await prisma.product.findUnique({ where: { id: r.productId }, select: { name: true } }); console.log(`  ${p?.name}: +${r._sum.quantity}`); }
  const tshirt = await prisma.product.findFirst({ where: { shopId: shop.id, name: { contains: 'Black Sport', mode: 'insensitive' } }, select: { id: true, name: true, currentStock: true, createdAt: true } });
  console.log(`\n"${tshirt?.name}" createdAt=${tshirt?.createdAt?.toISOString()} stock=${tshirt?.currentStock}`);
})().catch(e=>console.error(e.message)).finally(()=>process.exit(0));
