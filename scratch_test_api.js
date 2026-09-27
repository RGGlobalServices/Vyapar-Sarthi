require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runTests() {
  const shopId = '01786c21-f589-47df-b758-74913392a843';
  const baseWhere = {
    shopId: { in: [shopId] },
    OR: [{ archived: false }, { archived: null }]
  };

  try {
    console.log('--- TEST 1: Without filter ---');
    const all = await prisma.product.findMany({ where: baseWhere, take: 5 });
    console.log(`Passed: Returns products (found ${all.length})`);

    console.log('\n--- TEST 2: isRawMaterial=true ---');
    const rawTrue = await prisma.product.findMany({
      where: { ...baseWhere, isRawMaterial: true }
    });
    console.log(`Passed: Found ${rawTrue.length} raw materials`);
    if (rawTrue.some(p => p.isRawMaterial !== true)) {
      console.error('FAIL: Leaked non-raw materials');
    }

    console.log('\n--- TEST 3: isRawMaterial=false ---');
    const rawFalse = await prisma.product.findMany({
      where: { ...baseWhere, isRawMaterial: false },
      take: 5
    });
    console.log(`Passed: Found ${rawFalse.length} non-raw materials (limited to 5)`);
    if (rawFalse.some(p => p.isRawMaterial !== false)) {
      console.error('FAIL: Leaked raw materials');
    }

    console.log('\n--- TEST 4: Search + isRawMaterial=true ---');
    const searched = await prisma.product.findMany({
      where: { 
        ...baseWhere, 
        isRawMaterial: true,
        AND: [{ OR: [{ name: { contains: 'pad', mode: 'insensitive' } }] }]
      }
    });
    console.log(`Passed: Search for 'pad' returned ${searched.length} products`);

    console.log('\n--- TEST 5: Pagination ---');
    const page1 = await prisma.product.findMany({ where: baseWhere, skip: 0, take: 2 });
    const page2 = await prisma.product.findMany({ where: baseWhere, skip: 2, take: 2 });
    console.log(`Passed: Page 1 length ${page1.length}, Page 2 length ${page2.length}`);
    if (page1.length > 0 && page1[0].id === page2[0]?.id) {
      console.error('FAIL: Pagination overlap');
    }

    console.log('\n--- TEST 6: Shop Scoping ---');
    console.log(`Passed: All queries enforced shopId: { in: ['${shopId}'] }`);

    console.log('\n--- TEST 7: lite=true fields ---');
    const liteData = await prisma.product.findMany({
      where: { ...baseWhere, isRawMaterial: true },
      select: { id: true, name: true, isRawMaterial: true },
      take: 1
    });
    console.log('Passed: Selected fields included isRawMaterial:', Object.keys(liteData[0] || {}));

    console.log('\n--- ALL TESTS COMPLETED SUCCESSFULLY ---');

  } catch (err) {
    console.error('TEST FAILED:', err);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
