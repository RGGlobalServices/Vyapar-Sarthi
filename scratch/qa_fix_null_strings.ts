import prisma from '../lib/server/prisma';

async function main() {
  const result = await (prisma as any).batchStage.updateMany({
    where: { operatorName: 'null' },
    data: { operatorName: null },
  });
  const result2 = await (prisma as any).batchStage.updateMany({
    where: { notes: 'null' },
    data: { notes: null },
  });
  console.log('cleared operatorName "null" strings:', result.count);
  console.log('cleared notes "null" strings:', result2.count);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
