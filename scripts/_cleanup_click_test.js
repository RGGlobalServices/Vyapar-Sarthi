try { require('dotenv').config({ path: 'C:/current working project/kirana-manager-main/.env.local' }); } catch {}
process.chdir('C:/current working project/kirana-manager-main');
const { PrismaClient } = require('@prisma/client');
(async () => {
  const p = new PrismaClient();
  const users = await p.user.findMany({ where: { email: { contains: 'clicktest', mode: 'insensitive' } }, select: { id: true, uuid: true, email: true } });
  const users2 = await p.user.findMany({ where: { email: { contains: 'click-test', mode: 'insensitive' } }, select: { id: true, uuid: true, email: true } });
  const allUsers = [...users, ...users2];
  console.log('users to remove:', allUsers.map(u => u.email));
  const shops = await p.shop.findMany({ where: { OR: [{ name: { contains: 'Click Test', mode: 'insensitive' } }, { ownerId: { in: allUsers.map(u => u.uuid).filter(Boolean) } }] }, select: { id: true, name: true } });
  console.log('shops to remove:', shops.map(s => s.name));
  const shopIds = shops.map(s => s.id);
  if (shopIds.length) {
    const tables = (await p.$queryRaw`SELECT DISTINCT table_name FROM information_schema.columns WHERE column_name = 'shop_id' AND table_schema = 'public' AND table_name <> 'shops'`).map(r => r.table_name);
    for (const t of tables) { try { await p.$executeRawUnsafe(`DELETE FROM "${t}" WHERE shop_id = ANY($1::uuid[])`, shopIds); } catch {} }
    await p.$executeRawUnsafe(`DELETE FROM shops WHERE id = ANY($1::uuid[])`, shopIds).catch(e => console.log('shop delete err', e.message));
  }
  if (allUsers.length) {
    const ids = allUsers.map(u => u.id);
    const uuids = allUsers.map(u => u.uuid).filter(Boolean);
    await p.$executeRawUnsafe(`DELETE FROM users WHERE id = ANY($1::int[])`, ids).catch(e => console.log('user delete err', e.message));
  }
  const leftUsers = await p.user.count({ where: { OR: [{ email: { contains: 'clicktest', mode: 'insensitive' } }, { email: { contains: 'click-test', mode: 'insensitive' } }] } });
  const leftShops = await p.shop.count({ where: { name: { contains: 'Click Test', mode: 'insensitive' } } });
  console.log('left users:', leftUsers, 'left shops:', leftShops);
  await p.$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
