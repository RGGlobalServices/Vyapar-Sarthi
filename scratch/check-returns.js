require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const shop = await prisma.shop.findFirst({ where: { name: { contains: 'Fasttrack', mode: 'insensitive' } } });
  const sid = shop.id;
  const today0 = new Date('2026-07-20T00:00:00');
  const today1 = new Date('2026-07-20T23:59:59');
  const salesToday = await prisma.sale.findMany({ where: { shopId: sid, createdAt: { gte: today0, lte: today1 } }, select: { invoice_number: true, totalAmount: true, createdAt: true } });
  console.log(`Sales dated 2026-07-20: ${salesToday.length}`);
  salesToday.forEach(s => console.log(`  ${s.invoice_number} ₹${s.totalAmount}`));

  const returns = await prisma.materialReturn.findMany({ where: { shopId: sid }, orderBy: { date: 'desc' }, take: 15 });
  console.log(`\nAll material returns (recent ${returns.length}):`);
  returns.forEach(r => console.log(`  id=${r.id.slice(0,8)} date=${r.date?.toISOString().slice(0,10)} amount=₹${r.amount} qty=${r.quantity} reason=${r.reason} product=${r.productId?.slice(0,8)||'none'}`));
  const agg = await prisma.materialReturn.aggregate({ where: { shopId: sid, date: { gte: today0, lte: today1 } }, _sum: { amount: true }, _count: { id: true } });
  console.log(`\nReturns dated TODAY (07-20): count=${agg._count.id} sum=₹${agg._sum.amount}`);
})().catch(e=>console.error(e.message)).finally(()=>process.exit(0));
