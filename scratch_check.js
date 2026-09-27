require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    console.log('--- Duplicate Lot Numbers Check ---');
    const duplicates = await prisma.$queryRaw`
      SELECT shop_id, lot_number, COUNT(*) as count 
      FROM raw_material_lots 
      WHERE lot_number IS NOT NULL
      GROUP BY shop_id, lot_number 
      HAVING COUNT(*) > 1
    `;
    
    if (duplicates.length > 0) {
      console.log('FOUND DUPLICATES:', duplicates);
    } else {
      console.log('No duplicate (shop_id, lot_number) combinations found.');
    }

    console.log('\n--- Raw Material Products Check ---');
    const targetProducts = await prisma.$queryRaw`
      SELECT id, name, category, shop_id
      FROM products
      WHERE 
        category ILIKE '%raw material%' OR 
        id IN (SELECT product_id FROM raw_material_lots WHERE product_id IS NOT NULL)
    `;

    console.log(`Found ${targetProducts.length} products that will be marked as is_raw_material = true:`);
    targetProducts.forEach((p, i) => {
      console.log(`  ${i+1}. [${p.id}] ${p.name} (Category: ${p.category})`);
    });

  } catch (err) {
    console.error('Error during checks:', err);
  } finally {
    await prisma.$disconnect();
  }
}

check();
