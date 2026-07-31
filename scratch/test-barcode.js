require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const shop = await prisma.shop.findFirst({ where: { name: { contains: 'Fasttrack', mode: 'insensitive' } } });
  const sid = shop.id;
  // Sample barcodes
  const prods = await prisma.product.findMany({ where: { shopId: sid, OR:[{archived:false},{archived:null}] }, select: { name: true, barcode: true }, take: 12, orderBy: { name: 'asc' } });
  console.log('Sample product barcodes:');
  prods.forEach(p => console.log(`  ${p.name.padEnd(28)} barcode=${JSON.stringify(p.barcode)}`));
  const withBc = prods.find(p => p.barcode);
  if (!withBc) { console.log('\nNo barcodes found!'); return; }
  const bc = withBc.barcode;
  console.log(`\nTesting search for barcode: "${bc}"`);
  // Replicate lite search: name contains q OR barcode equals q
  const lite = await prisma.product.findMany({
    where: { shopId: sid, OR:[{archived:false},{archived:null}], AND:[{ OR:[{ name:{contains:bc,mode:'insensitive'}},{ barcode:{equals:bc}}] }] },
    select: { name: true, barcode: true, currentStock: true }, take: 15
  });
  console.log(`Lite search (barcode equals) → ${lite.length} result(s):`, lite.map(p=>p.name));
  // Count how many products have null/empty barcode
  const nullBc = await prisma.product.count({ where: { shopId: sid, OR:[{barcode:null},{barcode:''}] } });
  const total = await prisma.product.count({ where: { shopId: sid } });
  console.log(`\nProducts with null/empty barcode: ${nullBc} / ${total}`);
})().catch(e=>console.error(e.message)).finally(()=>process.exit(0));
