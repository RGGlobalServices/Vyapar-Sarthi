require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const shop = await prisma.shop.findFirst({ where: { name: { contains: 'Fasttrack', mode: 'insensitive' } } });
  console.log('Shop:', shop?.name, shop?.id);
  const sid = shop.id;
  const recentSales = await prisma.sale.findMany({ where: { shopId: sid }, orderBy: { createdAt: 'desc' }, take: 12, include: { customer: true, items: true } });
  console.log('\n=== 12 most recent sales (by createdAt) ===');
  for (const s of recentSales) {
    console.log(`${s.invoice_number} | createdAt=${s.createdAt?.toISOString().slice(0,10)} | amt=${s.totalAmount} | pay=${s.paymentType} | cust=${s.customer?.name || 'NULL'} (${s.customerId ? 'linked' : 'no cust'}) | items=${s.items.length}`);
  }
  const totalSales = await prisma.sale.count({ where: { shopId: sid } });
  const totalCust = await prisma.customer.count({ where: { shopId: sid } });
  console.log(`\nTotal sales: ${totalSales} | Total customers: ${totalCust}`);
  console.log('\n=== 12 most recent customers ===');
  const custs = await prisma.customer.findMany({ where: { shopId: sid }, orderBy: { createdAt: 'desc' }, take: 12 });
  for (const c of custs) console.log(`${c.name} | mobile=${c.mobile || 'none'} | due=${c.totalDue} | created=${c.createdAt?.toISOString().slice(0,10)}`);
}
main().catch(e=>console.error(e)).finally(()=>prisma.$disconnect());
