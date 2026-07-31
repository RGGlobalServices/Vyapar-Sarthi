require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  // 1. Is the displayed barcode actually stored?
  const p = await prisma.product.findFirst({ where: { barcode: 'PRD-64F4E74D' }, select: { name: true, barcode: true, currentStock: true, sellingPrice: true, shopId: true } });
  console.log('DB lookup PRD-64F4E74D:', p ? `FOUND "${p.name}" stock=${p.currentStock} price=${p.sellingPrice}` : 'NOT FOUND');

  // 2. Simulate the scanner path (exact, case-insensitive)
  const products = [{ name: p.name, barcode: p.barcode, currentStock: p.currentStock }];
  const scan = (bc) => { const s = String(bc).trim().toLowerCase(); return products.find(x => (x.barcode||'').toLowerCase() === s); };
  console.log('Scanner "PRD-64F4E74D":', scan('PRD-64F4E74D') ? 'MATCH -> addToCart' : 'FAIL');
  console.log('Scanner "prd-64f4e74d" (lowercase read):', scan('prd-64f4e74d') ? 'MATCH -> addToCart' : 'FAIL');

  // 3. Simulate typed search (local, lowercased q)
  const q = 'prd-64f4'; // partial, lowercase typing
  const local = products.filter(x => (x.barcode||'').toLowerCase().includes(q));
  console.log(`Typed search "${q}":`, local.length ? 'MATCH in dropdown' : 'FAIL');

  // 4. Server search replication (contains, insensitive)
  const server = await prisma.product.findMany({ where: { shopId: p.shopId, AND: [{ OR: [{ name: { contains: 'prd-64f4', mode: 'insensitive' } }, { barcode: { contains: 'prd-64f4', mode: 'insensitive' } }] }] }, select: { name: true } });
  console.log('Server search "prd-64f4":', server.length ? `MATCH (${server.map(x=>x.name)})` : 'FAIL');
})().catch(e=>console.error(e.message)).finally(()=>process.exit(0));
