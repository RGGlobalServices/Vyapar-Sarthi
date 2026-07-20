require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const shop = await prisma.shop.findFirst({ where: { name: { contains: 'Fasttrack', mode: 'insensitive' } } });
  const sid = shop.id;
  const rows = await prisma.product.findMany({ where: { shopId: sid, name: { contains: 'Baby Romper', mode: 'insensitive' } } });
  console.log(`Baby Romper matches: ${rows.length}`);
  for (const p of rows) {
    console.log(`  id=${p.id.slice(0,8)} currentStock=${p.currentStock} archived=${p.archived} size_variants=${JSON.stringify(p.size_variants)} `);
  }
  // Replicate what the plain /products array returns for a few products
  const sample = await prisma.product.findMany({ where: { shopId: sid, OR:[{archived:false},{archived:null}] }, include: { godownProducts: true }, take: 3, orderBy: { name: 'asc' } });
  console.log('\nSample of /products array (first 3), keys of [0]:');
  console.log(Object.keys(sample[0]).filter(k=>/stock/i.test(k)).map(k=>`${k}=${sample[0][k]}`).join(', '));
  console.log('names+stock:', sample.map(p=>`${p.name}:${p.currentStock}`).join(' | '));
})().catch(e=>console.error(e.message)).finally(()=>process.exit(0));
