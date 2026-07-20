require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const shop = await prisma.shop.findFirst({ where: { name: { contains: 'Fasttrack', mode: 'insensitive' } } });
  const sid = shop.id;
  const names = ['Baby Romper','Baby Shorts','Baby Frock','Baby Sweater'];
  for (const n of names) {
    const p = await prisma.product.findFirst({ where: { shopId: sid, name: n }, include: { godownProducts: true, productVariants: true } });
    if (!p) { console.log(`${n}: NOT FOUND`); continue; }
    const godownSum = p.godownProducts.reduce((t,g)=>t+(Number(g.quantity)||0),0);
    const variantSum = (p.productVariants||[]).reduce((t,v)=>t+(Number(v.stock)||0),0);
    console.log(`${n}: currentStock=${p.currentStock} | minStock=${p.minStock} | godowns=${p.godownProducts.length}(sum ${godownSum}) | variants=${p.productVariants?.length||0}(sum ${variantSum})`);
  }
  // Overall: how many products have currentStock=0 vs null?
  const zero = await prisma.product.count({ where: { shopId: sid, currentStock: 0 } });
  const nul = await prisma.product.count({ where: { shopId: sid, currentStock: null } });
  const pos = await prisma.product.count({ where: { shopId: sid, currentStock: { gt: 0 } } });
  console.log(`\nProducts: currentStock=0 -> ${zero} | null -> ${nul} | >0 -> ${pos}`);
})().catch(e=>console.error(e.message)).finally(()=>process.exit(0));
