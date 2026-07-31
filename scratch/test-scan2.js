require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const p = await prisma.product.findFirst({ where: { barcode: 'BAR-1784359892461' }, select: { name: true, barcode: true, currentStock: true, shopId: true } });
  console.log('DB lookup real barcode:', p ? `FOUND "${p.name}"` : 'FAIL');
  const products = [p];
  const scan = (bc) => { const s = String(bc).trim().toLowerCase(); return products.find(x => (x.barcode||'').toLowerCase() === s); };
  console.log('Scanner exact:', scan('BAR-1784359892461') ? 'MATCH' : 'FAIL');
  console.log('Scanner lowercase:', scan('bar-1784359892461') ? 'MATCH' : 'FAIL');
  const q = '1784359892'; // partial typed
  console.log('Local typed partial:', products.filter(x => (x.barcode||'').toLowerCase().includes(q)).length ? 'MATCH' : 'FAIL');
  const server = await prisma.product.findMany({ where: { shopId: p.shopId, barcode: { contains: q, mode: 'insensitive' } }, select: { name: true } });
  console.log('Server partial search:', server.length ? `MATCH (${server.map(x=>x.name)})` : 'FAIL');
})().catch(e=>console.error(e.message)).finally(()=>process.exit(0));
