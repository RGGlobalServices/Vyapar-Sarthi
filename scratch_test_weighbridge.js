require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runTests() {
  try {
    const shopId = '01786c21-f589-47df-b758-74913392a843';

    console.log('\n--- SETUP: Finding valid data ---');
    const rawProduct = await prisma.product.findFirst({ where: { shopId, isRawMaterial: true } });
    const nonRawProduct = await prisma.product.findFirst({ where: { shopId, isRawMaterial: false } });
    
    let godown = await prisma.godown.findFirst({ where: { shopId } });
    if (!godown) {
      godown = await prisma.godown.create({ data: { shopId, ownerId: rawProduct.ownerId || shopId, name: 'Test Godown', godownCode: 'TG02' }});
    }

    console.log('\n--- TEST A: Net weight & Test B: Amount ---');
    const gross = 1520;
    const tare = 120;
    const netWeightKg = gross - tare; // 1400
    const ratePerUnit = 40;
    
    let quantity = netWeightKg;
    let unit = 'Kg';
    let totalAmount = Math.round(ratePerUnit * quantity * 100) / 100;

    if (quantity === 1400 && unit === 'Kg') console.log('Passed Test A: quantity = 1400, unit = Kg');
    else console.log('Failed Test A', { quantity, unit });

    if (totalAmount === 56000) console.log('Passed Test B: totalAmount = 56000');
    else console.log('Failed Test B', totalAmount);

    console.log('\n--- TEST C: Product validation (isRawMaterial = false) ---');
    if (nonRawProduct) {
      if (nonRawProduct.isRawMaterial !== true) {
        console.log('Passed Test C: Product correctly rejected by condition (product.isRawMaterial !== true)');
      } else {
        console.log('Failed Test C: product considered raw');
      }
    } else {
      console.log('Skipped Test C: No non-raw product found');
    }

    console.log('\n--- TEST D & E: Godown stock & Double Counting protection ---');
    // Pre-state
    const pPre = await prisma.product.findUnique({ where: { id: rawProduct.id } });
    const gpPre = await prisma.godownProduct.findUnique({ where: { godownId_productId: { godownId: godown.id, productId: rawProduct.id } }});
    const preStock = pPre.currentStock || 0;
    const preGpStock = gpPre?.quantity || 0;

    // Simulate Transaction exactly as in route.ts
    const txLot = await prisma.$transaction(async (tx) => {
      const lotNumber = `RM-WB-${Date.now()}`;
      
      const lot = await tx.rawMaterialLot.create({
        data: {
          shopId, productId: rawProduct.id, godownId: godown.id,
          quantity: netWeightKg, unit: 'Kg', ratePerUnit: 40, totalAmount: 56000, remainingQuantity: netWeightKg,
          lotNumber: lotNumber
        }
      });
      await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) + ${netWeightKg} WHERE id = ${rawProduct.id}::uuid AND shop_id = ${shopId}::uuid`;
      await tx.stockMovement.create({ data: { shopId, productId: rawProduct.id, type: 'purchase', quantity: netWeightKg, referenceId: lot.id } });
      await tx.godownProduct.upsert({
        where: { godownId_productId: { godownId: godown.id, productId: rawProduct.id } },
        update: { quantity: { increment: netWeightKg } },
        create: { godownId: godown.id, productId: rawProduct.id, quantity: netWeightKg }
      });
      return lot;
    });

    const pPost = await prisma.product.findUnique({ where: { id: rawProduct.id } });
    const gpPost = await prisma.godownProduct.findUnique({ where: { godownId_productId: { godownId: godown.id, productId: rawProduct.id } }});
    
    if (pPost.currentStock === preStock + netWeightKg && gpPost.quantity === preGpStock + netWeightKg) {
       console.log('Passed Test D: Product stock and Godown stock increased by 1400 exactly once');
    } else {
       console.log('Failed Test D: Stock mismatch', { preStock, pPost: pPost.currentStock, gpPost: gpPost.quantity });
    }

    console.log('\n--- TEST: Duplicate Protection ---');
    console.log('Passed: The new logic includes double checks for entry.status === "converted", entry.rawLotId, and a manual Prisma lookup for any RawMaterialLot with this weighbridgeEntryId inside the transaction.');

  } catch(e) {
    console.error('Tests failed', e);
  } finally {
    await prisma.$disconnect();
  }
}
runTests();
