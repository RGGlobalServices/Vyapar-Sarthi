require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const shop = await prisma.shop.findFirst({ where: { name: { contains: 'Fasttrack', mode: 'insensitive' } } });
  const sid = shop.id;
  const nullNow = await prisma.product.count({ where: { shopId: sid, OR:[{barcode:null},{barcode:''}] } });
  console.log(`Fasttrack products still missing barcode: ${nullNow}`);
  // Pick a product that was backfilled (PRD-)
  const p = await prisma.product.findFirst({ where: { shopId: sid, barcode: { startsWith: 'PRD-' } }, select: { name: true, barcode: true } });
  console.log(`Test product: "${p.name}" barcode=${p.barcode}`);
  // Full barcode search (contains)
  const full = await prisma.product.findMany({ where: { shopId: sid, OR:[{archived:false},{archived:null}], AND:[{OR:[{name:{contains:p.barcode,mode:'insensitive'}},{barcode:{contains:p.barcode,mode:'insensitive'}}]}] }, select:{name:true} });
  console.log(`Search full "${p.barcode}" → ${full.length} result(s): ${full.map(x=>x.name).join(', ')}`);
  // Partial barcode search (last 6 chars) — now works with contains
  const partial = p.barcode.slice(-6);
  const part = await prisma.product.findMany({ where: { shopId: sid, OR:[{archived:false},{archived:null}], AND:[{OR:[{name:{contains:partial,mode:'insensitive'}},{barcode:{contains:partial,mode:'insensitive'}}]}] }, select:{name:true,barcode:true} });
  console.log(`Search partial "${partial}" → ${part.length} result(s)`);
})().catch(e=>console.error(e.message)).finally(()=>process.exit(0));
