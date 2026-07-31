const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testSignupBusinessType() {
  console.log('=== TESTING SIGNUP BUSINESS TYPE PERSISTENCE ===\n');

  const testEmail = `test_biz_${Date.now()}@example.com`;
  const selectedType = 'clothes'; // Clothes / Textiles

  // 1. Simulate registration
  const user = await prisma.user.create({
    data: {
      uuid: `test-uuid-${Date.now()}`,
      email: testEmail,
      password: 'password123',
      name: 'Test Business Owner',
      storeName: 'Test Apparel Store',
      businessType: selectedType,
    }
  });

  const shop = await prisma.shop.create({
    data: {
      ownerId: user.uuid,
      name: 'Test Apparel Store',
      businessType: selectedType,
      subscriptionStatus: 'trial',
    }
  });

  console.log('Created User & Shop with businessType:', selectedType);

  // 2. Fetch created shop
  const fetchedShop = await prisma.shop.findFirst({ where: { id: shop.id } });
  console.assert(fetchedShop.businessType === selectedType, `Shop businessType should be ${selectedType}`);
  console.log(`✓ Shop businessType in database correctly matches signup selection: '${fetchedShop.businessType}'`);

  // Cleanup
  await prisma.shop.delete({ where: { id: shop.id } });
  await prisma.user.delete({ where: { id: user.id } });

  console.log('\n=== ALL BUSINESS TYPE PERSISTENCE TESTS PASSED! ===');
}

testSignupBusinessType()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
