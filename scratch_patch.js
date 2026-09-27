require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    console.log('--- Step 4: Applying Data Patch ---');
    const targetProducts = await prisma.$queryRaw`
      SELECT id, name, category, shop_id
      FROM products
      WHERE 
        category ILIKE '%raw material%' OR 
        id IN (SELECT product_id FROM raw_material_lots WHERE product_id IS NOT NULL)
    `;

    console.log(`Found ${targetProducts.length} matched products.`);
    
    // Check how many are already true (if column exists)
    let alreadyTrue = 0;
    let updated = 0;
    let remainFalse = 0;

    for (const p of targetProducts) {
      // In PostgreSQL, execute raw update
      const res = await prisma.$executeRaw`UPDATE products SET is_raw_material = true WHERE id = ${p.id}`;
      updated += res;
    }

    console.log(`Updated: ${updated}`);
  } catch (err) {
    console.error('Error applying data patch:', err);
  } finally {
    await prisma.$disconnect();
  }
}
run();
