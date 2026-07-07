import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'Admin@gbro.com';
  const password = await bcrypt.hash('Admin123', 10);
  
  const user = await prisma.user.upsert({
    where: { email },
    update: { password },
    create: {
      email,
      password,
      name: 'Admin',
      fullName: 'System Admin',
      mobile: '9999999999',
      subscriptionPlan: 'vyapar',
      planExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    }
  });

  console.log('Test user created:', user.email);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
