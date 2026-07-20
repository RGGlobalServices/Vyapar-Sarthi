require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const shop = await prisma.shop.findFirst({ where: { name: { contains: 'Fasttrack', mode: 'insensitive' } } });
  const sid = shop.id;
  const start = new Date('2026-07-20T00:00:00'); const end = new Date('2026-07-20T23:59:59');
  const sp = await prisma.sale.aggregate({ where: { shopId: sid, createdAt: { gte: start, lte: end } }, _sum: { totalAmount: true, totalProfit: true } });
  const ret = await prisma.materialReturn.aggregate({ where: { shopId: sid, date: { gte: start, lte: end } }, _sum: { amount: true } });
  const gross = sp._sum.totalAmount || 0;
  const returns = ret._sum.amount || 0;
  console.log(`Gross sales today: ₹${gross}`);
  console.log(`Returns today:     ₹${returns} (own card)`);
  console.log(`OLD today_sales = gross - returns = ₹${gross - returns}  <-- was negative`);
  console.log(`NEW today_sales = gross           = ₹${gross}          <-- fixed`);
})().catch(e=>console.error(e.message)).finally(()=>process.exit(0));
