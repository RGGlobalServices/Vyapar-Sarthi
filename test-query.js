const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const shop = await prisma.shop.findFirst();
    if (!shop) {
       console.log('no shop');
       return;
    }
    const startDate = new Date('2026-06-17');
    const endDate = new Date('2026-06-23');
    
    console.log('Executing Category Query...');
    const resCat = await prisma.$queryRaw`
      SELECT COALESCE(p.category, 'Other') as name, SUM(si.price_per_unit * si.quantity) as value
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN products p ON si.product_id = p.id
      WHERE s.shop_id = ${shop.id}::uuid AND s.created_at >= ${startDate} AND s.created_at <= ${endDate}
      GROUP BY p.category
      ORDER BY value DESC
    `;
    console.log('Category Result:', resCat);

    console.log('Executing Quantity Query...');
    const resQty = await prisma.$queryRaw`
      SELECT COALESCE(p.name, 'Other Sales') as name, SUM(si.quantity) as value
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN products p ON si.product_id = p.id
      WHERE s.shop_id = ${shop.id}::uuid AND s.created_at >= ${startDate} AND s.created_at <= ${endDate}
      GROUP BY p.id, p.name
      ORDER BY value DESC
    `;
    console.log('Quantity Result:', resQty);

  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
