require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const shop = await prisma.shop.findFirst({ where: { name: { contains: 'Fasttrack', mode: 'insensitive' } } });
  const sid = shop.id;
  // Sales that look imported: INV-100x / HIST- / created in June
  const imported = await prisma.sale.findMany({
    where: { shopId: sid, OR: [
      { invoice_number: { startsWith: 'INV-10' } },
      { invoice_number: { startsWith: 'HIST' } },
      { invoice_number: { contains: '-17844' } },
    ]},
    orderBy: { createdAt: 'asc' }, include: { customer: true, items: true }
  });
  console.log(`Found ${imported.length} import-looking sales:`);
  for (const s of imported) {
    console.log(`${s.invoice_number} | ${s.createdAt?.toISOString().slice(0,10)} | amt=${s.totalAmount} | cust=${s.customer?.name||'NULL'} | items=${s.items.length} | pay=${s.paymentType}`);
  }
  // How many sales fall in June (before Jun 20)?
  const early = await prisma.sale.count({ where: { shopId: sid, createdAt: { lt: new Date('2026-06-20') } } });
  console.log(`\nSales dated before 2026-06-20 (excluded from 'Last 30 days'): ${early}`);
}
main().catch(e=>console.error(e)).finally(()=>prisma.$disconnect());
