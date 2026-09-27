require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    console.log('--- Step 1: Renaming Conflicting Lots ---');
    await prisma.$transaction(async (tx) => {
      // Rename first lot
      const lot1 = await tx.rawMaterialLot.update({
        where: { id: 'ea4e806c-8923-4af1-8d24-147c667b9cf1' },
        data: { lotNumber: '001-2' }
      });
      console.log(`Renamed ea4e806c... to ${lot1.lotNumber}`);

      // Rename second lot
      const lot2 = await tx.rawMaterialLot.update({
        where: { id: '413db125-917d-447b-a04e-0c47f8691f82' },
        data: { lotNumber: 'PADDY-2026-A-2' }
      });
      console.log(`Renamed 413db125... to ${lot2.lotNumber}`);
    });

    console.log('\n--- Step 2: Verifying Duplicate Resolution ---');
    const duplicates = await prisma.$queryRaw`
      SELECT shop_id, lot_number, COUNT(*) as count 
      FROM raw_material_lots 
      WHERE lot_number IS NOT NULL
      GROUP BY shop_id, lot_number 
      HAVING COUNT(*) > 1
    `;
    
    if (duplicates.length > 0) {
      console.log('FAIL: Duplicates still exist!', duplicates);
    } else {
      console.log('SUCCESS: ZERO rows. No duplicate (shopId, lotNumber) combinations exist.');
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}
run();
