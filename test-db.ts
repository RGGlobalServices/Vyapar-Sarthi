import prisma from './lib/server/prisma';

async function main() {
  try {
    const shop = await prisma.shop.findFirst({ where: { subscriptionPlan: 'wholesale' } });
    if (!shop) {
      console.log('No shop found');
      return;
    }
    const name = 'Warehouse Direct Test';
    const location = null;
    const godownCode = 'GDN-TEST-' + Math.floor(Math.random() * 1000);
    const godownOwnerId = shop.ownerId || '00000000-0000-0000-0000-000000000000';

    console.log('Testing connection to godowns...');
    const rows = (await prisma.$queryRaw`
      INSERT INTO godowns (shop_id, owner_id, name, location, godown_code)
      VALUES (${shop.id}::uuid, ${godownOwnerId}::uuid, ${name}, ${location}::varchar, ${godownCode})
      RETURNING *
    `) as any[];
    console.log('Success:', rows[0]);
  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}
main();
