// De-duplicate the repeatedly re-imported sales and drop broken ₹0 rows.
// Targets ONLY import-generated invoices (INV-10xx families + HIST-*), never
// manual sales (INV-<hex>). Keeps ONE best record per base invoice (highest
// amount, earliest date); deletes duplicates and any remaining ₹0 rows.
// Reverses udhar dues for deleted sales.  Run:
//   node scratch/dedupe-imported-sales.js          (dry run)
//   node scratch/dedupe-imported-sales.js --apply  (writes)
require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const IMPORTED = /^(INV-10\d{2}(-\d+)?|HIST-\d+.*)$/i;
const baseOf = (inv) => inv.replace(/-\d{10,}.*$/,'').replace(/^(INV-10\d{2}).*$/i,'$1');

async function main() {
  const shop = await prisma.shop.findFirst({ where: { name: { contains: 'Fasttrack', mode: 'insensitive' } } });
  const sid = shop.id;
  const sales = await prisma.sale.findMany({ where: { shopId: sid }, include: { items: true } });

  const imported = sales.filter(s => s.invoice_number && IMPORTED.test(s.invoice_number.trim()));
  const groups = new Map();
  for (const s of imported) {
    const b = baseOf(s.invoice_number.trim());
    if (!groups.has(b)) groups.set(b, []);
    groups.get(b).push(s);
  }

  const toDelete = [];
  let keep = 0;
  for (const [base, rows] of groups) {
    // Best = highest amount, then earliest date.
    rows.sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0) ||
      (new Date(a.createdAt) - new Date(b.createdAt)));
    const best = rows[0];
    const dups = rows.slice(1);
    toDelete.push(...dups);
    if (!best.totalAmount || best.totalAmount <= 0) { toDelete.push(best); }
    else keep++;
  }

  console.log(`Imported sales scanned: ${imported.length} across ${groups.size} base invoices`);
  console.log(`Keeping (real value): ${keep}`);
  console.log(`Deleting (duplicates + ₹0): ${toDelete.length}`);
  const sample = toDelete.slice(0, 12).map(s => `  ${s.invoice_number} | ${s.createdAt?.toISOString().slice(0,10)} | ₹${s.totalAmount}`);
  console.log('Examples to delete:\n' + sample.join('\n'));

  if (!APPLY) { console.log('\nDRY RUN — re-run with --apply to delete.'); return; }

  let dues = 0;
  for (const s of toDelete) {
    // Reverse udhar due + ledger entry for this bill.
    if (String(s.paymentType).toLowerCase() === 'udhar' && s.customerId && s.totalAmount) {
      await prisma.customer.update({ where: { id: s.customerId },
        data: { totalDue: { decrement: s.totalAmount } } }).catch(()=>{});
      await prisma.customer_transactions.deleteMany({ where: { bill_number: s.invoice_number } }).catch(()=>{});
      dues++;
    }
    await prisma.saleItem.deleteMany({ where: { saleId: s.id } });
    await prisma.sale.delete({ where: { id: s.id } });
  }
  // Floor any negative dues created by rounding.
  await prisma.customer.updateMany({ where: { shopId: sid, totalDue: { lt: 0 } }, data: { totalDue: 0 } });
  console.log(`\nAPPLIED. Deleted ${toDelete.length} sales (${dues} udhar dues reversed).`);
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
