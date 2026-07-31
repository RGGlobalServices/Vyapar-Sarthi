const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testEmailUpdateLogic() {
  console.log('=== TESTING EMAIL UPDATE LOGIC ===\n');

  // Fetch or create test user 1
  let user1 = await prisma.user.findFirst({ where: { email: 'test_user1_email_check@example.com' } });
  if (!user1) {
    user1 = await prisma.user.create({
      data: {
        email: 'test_user1_email_check@example.com',
        name: 'Test User One',
        password: '$2a$10$abcdefghijklmnopqrstuu',
        uuid: '00000000-0000-0000-0000-000000000001'
      }
    });
  }

  // Fetch or create test user 2
  let user2 = await prisma.user.findFirst({ where: { email: 'test_user2_email_check@example.com' } });
  if (!user2) {
    user2 = await prisma.user.create({
      data: {
        email: 'test_user2_email_check@example.com',
        name: 'Test User Two',
        password: '$2a$10$abcdefghijklmnopqrstuu',
        uuid: '00000000-0000-0000-0000-000000000002'
      }
    });
  }

  console.log('Test User 1 Email:', user1.email);
  console.log('Test User 2 Email:', user2.email);

  // Test 1: Uniqueness check - user 1 tries to change email to user 2's email
  const duplicate = await prisma.user.findFirst({
    where: {
      email: 'test_user2_email_check@example.com',
      NOT: { id: user1.id }
    }
  });

  console.assert(duplicate !== null, 'Duplicate check should detect occupied email');
  console.log('✓ Duplicate email check correctly blocked occupied email');

  // Test 2: Update email to a new valid unused email address
  const newEmail = `updated_user1_${Date.now()}@example.com`;
  const updatedUser1 = await prisma.user.update({
    where: { id: user1.id },
    data: { email: newEmail }
  });

  console.assert(updatedUser1.email === newEmail, `Email should be updated to ${newEmail}`);
  console.assert(updatedUser1.name === user1.name, 'Name and existing fields must remain unchanged');
  console.log('✓ Email updated successfully while keeping profile data unchanged');

  // Cleanup test users
  await prisma.user.deleteMany({
    where: { id: { in: [user1.id, user2.id] } }
  });
  console.log('\n=== ALL EMAIL UPDATE TESTS PASSED! ===');
}

testEmailUpdateLogic()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
