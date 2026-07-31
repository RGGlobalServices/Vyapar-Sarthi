require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const rows = await prisma.$queryRaw`SELECT id, name, barcode FROM products WHERE id::text LIKE '64f4e74d%'`;
  console.log(rows);
})().catch(e=>console.error(e.message)).finally(()=>process.exit(0));
