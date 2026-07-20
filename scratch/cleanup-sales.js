// One-time cleanup for imported sales:
//  (1) totalAmount / totalProfit == null  -> recompute from sale items (else 0)
//  (2) createdAt in the future (day/month swapped by old parser) -> swap back to the past
// Run: node scratch/cleanup-sales.js         (dry run, reports only)
//      node scratch/cleanup-sales.js --apply  (writes changes)
require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const TOMORROW = Date.now() + 86400 * 1000;

async function main() {
  const sales = await prisma.sale.findMany({ include: { items: true } });
  let nullFixed = 0, dateFixed = 0;
  const dateExamples = [];

  for (const s of sales) {
    const data = {};

    // (1) null amounts
    if (s.totalAmount == null || !isFinite(s.totalAmount)) {
      const amt = s.items.reduce((t, it) => t + (Number(it.quantity) || 0) * (Number(it.pricePerUnit) || 0), 0);
      data.totalAmount = isFinite(amt) ? amt : 0;
      nullFixed++;
    }
    if (s.totalProfit == null || !isFinite(s.totalProfit)) {
      const prof = s.items.reduce((t, it) => t + (Number(it.quantity) || 0) * (Number(it.marginPerUnit) || 0), 0);
      data.totalProfit = isFinite(prof) ? prof : 0;
    }

    // (2) future-dated sale where swapping day<->month yields a past date
    if (s.createdAt && s.createdAt.getTime() > TOMORROW) {
      const d = s.createdAt;
      const day = d.getUTCDate(), month = d.getUTCMonth() + 1, year = d.getUTCFullYear();
      if (day <= 12 && month <= 12) {
        const swapped = new Date(Date.UTC(year, day - 1, month, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
        if (swapped.getTime() <= TOMORROW) {
          data.createdAt = swapped;
          dateFixed++;
          if (dateExamples.length < 8) dateExamples.push(`${s.invoice_number}: ${d.toISOString().slice(0,10)} -> ${swapped.toISOString().slice(0,10)}`);
        }
      }
    }

    if (APPLY && Object.keys(data).length) {
      await prisma.sale.update({ where: { id: s.id }, data });
    }
  }

  console.log(`Total sales scanned: ${sales.length}`);
  console.log(`Null amount/profit rows ${APPLY ? 'fixed' : 'to fix'}: ${nullFixed}`);
  console.log(`Future-dated rows ${APPLY ? 'fixed' : 'to fix'}: ${dateFixed}`);
  console.log('Date fix examples:'); dateExamples.forEach(e => console.log('  ' + e));
  console.log(APPLY ? 'APPLIED.' : 'DRY RUN — re-run with --apply to write.');
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
