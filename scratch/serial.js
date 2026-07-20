require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const shop = await prisma.shop.findFirst({ where: { name: { contains: 'Fasttrack', mode: 'insensitive' } } });
  const products = await prisma.product.findMany({
    where: { shopId: shop.id, OR:[{archived:false},{archived:null}] },
    include: { godownProducts: true, _count: { select: { godownProducts: { where: { quantity: { gt: 0 } } } } } },
    take: 2000, orderBy: { name: 'asc' }
  });
  // Round-trip through JSON exactly like the HTTP response would
  const json = JSON.parse(JSON.stringify(products));
  const br = json.find(p => p.name === 'Baby Romper');
  console.log('Total products in array:', json.length);
  console.log('Baby Romper serialized currentStock:', br?.currentStock, '(type:', typeof br?.currentStock + ')');
  console.log('Baby Romper keys with "stock":', Object.keys(br||{}).filter(k=>/stock/i.test(k)).join(', '));
  const zeros = json.filter(p => !(Number(p.currentStock)>0)).length;
  console.log('Products where currentStock not > 0:', zeros, '/', json.length);
})().catch(e=>console.error(e.message)).finally(()=>process.exit(0));
