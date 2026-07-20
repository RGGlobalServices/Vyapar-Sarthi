// Non-destructive proof of the rebuilt sales-import parsing logic.
const { parseFlexibleDate } = require('./_dates.js');
const parseNum = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return NaN;
  const n = parseFloat(String(v).replace(/[₹,\s]/g, ''));
  return isFinite(n) ? n : NaN;
};
function reconcile(row) {
  let quantity = parseNum(row.qty);
  if (!isFinite(quantity) || quantity <= 0) quantity = 1;
  let price = parseNum(row.price);
  const lineTotal = parseNum(row.amount);
  if (!isFinite(price) && isFinite(lineTotal)) price = lineTotal / quantity;
  if (!isFinite(price)) price = 0;
  let totalAmount = isFinite(lineTotal) ? lineTotal : quantity * price;
  if (!isFinite(totalAmount)) totalAmount = 0;
  return { quantity, price, totalAmount };
}
const rows = [
  { name:'per-unit price + qty',        qty:3,  price:'199',    amount:'' },
  { name:'line-total only (no price)',  qty:2,  price:'',       amount:'1000' },
  { name:'₹ formatted total, no qty',   qty:'', price:'',       amount:'₹1,46,958' },
  { name:'both present (total wins)',   qty:5,  price:'100',    amount:'480' },
  { name:'nothing (would be ₹0 before)',qty:'', price:'',       amount:'' },
];
console.log('AMOUNT RECONCILIATION:');
for (const r of rows) console.log(`  ${r.name.padEnd(30)} -> qty=${reconcile(r).quantity} price=${reconcile(r).price} total=₹${reconcile(r).totalAmount}`);

console.log('\nDEDUPE (idempotent re-import):');
const existing = new Set(['inv-1001']); const seen = new Set(); let dup=0, created=0;
for (const inv of ['INV-1001','INV-1002','INV-1002','INV-1003']) {
  const k = inv.toLowerCase();
  if (existing.has(k) || seen.has(k)) { dup++; console.log(`  ${inv} -> SKIP (duplicate)`); continue; }
  seen.add(k); created++; console.log(`  ${inv} -> CREATE`);
}
console.log(`  => created=${created} duplicatesSkipped=${dup}`);

console.log('\nDATE preferPast (sales history):');
for (const d of ['06-08-2026','06-10-2026','2026-05-06','15-03-2025']) {
  const r = parseFlexibleDate(d, { preferPast:true });
  console.log(`  ${d.padEnd(12)} -> ${r ? r.toISOString().slice(0,10) : 'undefined'}`);
}
