import prisma from './lib/server/prisma';

async function fix() {
  await prisma.shop.updateMany({
    where: { name: 'Fasttrack-cloth' },
    data: { businessType: 'clothes' }
  });
  console.log('Updated Fasttrack-cloth to clothes');
}

fix().catch(console.error).finally(() => process.exit(0));
