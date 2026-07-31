require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
(async () => {
  // ALL shops — a missing barcode makes any product unsearchable in billing.
  const missing = await prisma.product.findMany({
    where: { OR: [{ barcode: null }, { barcode: '' }] },
    select: { id: true, name: true, shopId: true },
  });
  console.log(`Products with null/empty barcode: ${missing.length}`);
  const used = new Set((await prisma.product.findMany({ where: { barcode: { not: null } }, select: { barcode: true } })).map(p => p.barcode));
  let planned = 0, applied = 0;
  for (const p of missing) {
    // Match the BarcodeQRModal fallback: PRD-<first 8 of id, upper>. Ensure unique.
    let code = `PRD-${String(p.id).replace(/-/g, '').substring(0, 8).toUpperCase()}`;
    if (used.has(code)) code = `PRD-${String(p.id).replace(/-/g, '').substring(0, 12).toUpperCase()}`;
    if (used.has(code)) code = `BAR-${Date.now()}-${planned}`;
    used.add(code);
    planned++;
    if (planned <= 8) console.log(`  ${p.name} -> ${code}`);
    if (APPLY) { await prisma.product.update({ where: { id: p.id }, data: { barcode: code } }).then(() => applied++).catch(e => console.error(`  fail ${p.name}: ${e.message}`)); }
  }
  console.log(APPLY ? `\nAPPLIED: ${applied} barcodes backfilled.` : `\nDRY RUN — ${planned} would be backfilled. Re-run with --apply.`);
})().catch(e=>console.error(e.message)).finally(()=>process.exit(0));
