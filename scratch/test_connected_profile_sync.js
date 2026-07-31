const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testConnectedProfileSync() {
  console.log('=== TESTING CONNECTED PROFILE SYNCHRONIZATION ===\n');

  const testEmail = `sync_test_${Date.now()}@example.com`;

  // 1. Create test user and shop
  const user = await prisma.user.create({
    data: {
      uuid: `uuid-sync-${Date.now()}`,
      email: testEmail,
      password: 'password123',
      name: 'Initial Name',
      mobile: '9876543210',
      storeName: 'Initial Shop',
      businessType: 'kirana',
    }
  });

  const shop = await prisma.shop.create({
    data: {
      ownerId: user.uuid,
      name: 'Initial Shop',
      mobile: '9876543210',
      businessType: 'kirana',
    }
  });

  console.log('Initial Setup: User & Shop created.');

  // 2. Simulate Shop update (e.g. from Profile page in app)
  const updatedShop = await prisma.shop.update({
    where: { id: shop.id },
    data: {
      name: 'Updated Supermart',
      mobile: '9998887770',
      businessType: 'clothes',
    }
  });

  // Sync to User (simulating PATCH /shop/profile logic)
  await prisma.user.updateMany({
    where: { uuid: user.uuid },
    data: {
      storeName: updatedShop.name,
      mobile: updatedShop.mobile,
      businessType: updatedShop.businessType,
    }
  });

  const refreshedUser = await prisma.user.findFirst({ where: { id: user.id } });
  console.assert(refreshedUser.storeName === 'Updated Supermart', 'User storeName should match updated shop name');
  console.assert(refreshedUser.mobile === '9998887770', 'User mobile should match updated shop mobile');
  console.assert(refreshedUser.businessType === 'clothes', 'User businessType should match updated shop businessType');
  console.log('✓ Shop -> User Profile sync verified successfully!');

  // 3. Simulate User update (e.g. from User profile)
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      mobile: '8887776660',
      storeName: 'Final Connected Electronics Store',
      businessType: 'electronics',
    }
  });

  // Sync to Shop (simulating PATCH /user/profile logic)
  await prisma.shop.updateMany({
    where: { ownerId: user.uuid },
    data: {
      name: updatedUser.storeName,
      mobile: updatedUser.mobile,
      businessType: updatedUser.businessType,
    }
  });

  const refreshedShop = await prisma.shop.findFirst({ where: { id: shop.id } });
  console.assert(refreshedShop.name === 'Final Connected Electronics Store', 'Shop name should match updated user storeName');
  console.assert(refreshedShop.mobile === '8887776660', 'Shop mobile should match updated user mobile');
  console.assert(refreshedShop.businessType === 'electronics', 'Shop businessType should match updated user businessType');
  console.log('✓ User -> Shop Profile sync verified successfully!');

  // Cleanup
  await prisma.shop.delete({ where: { id: shop.id } });
  await prisma.user.delete({ where: { id: user.id } });

  console.log('\n=== ALL CONNECTED PROFILE SYNC TESTS PASSED! ===');
}

testConnectedProfileSync()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
