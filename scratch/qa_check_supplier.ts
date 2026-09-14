import prisma from '../lib/server/prisma';

async function main() {
  const suppliers = await prisma.supplier.findMany({
    where: { shopId: '75c851d6-9631-4a0f-b7a3-72db1e44afe1' },
  });
  console.log('supplier count', suppliers.length);
  for (const s of suppliers) console.log(s.id, s.name, s.createdAt);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
