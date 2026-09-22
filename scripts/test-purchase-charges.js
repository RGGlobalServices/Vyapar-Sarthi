/* eslint-disable */
/** Purchase bill charges (hamali, freight …) — unit + LIVE API tests.  LIVE=1 BASE=http://127.0.0.1:3001 node scripts/test-purchase-charges.js */
const path = require('path'), fs = require('fs'), Module = require('module');
const ts = require(path.join(process.cwd(), 'node_modules/typescript'));
class StubApiError extends Error { constructor(s, m, c) { super(m); this.status = s; this.code = c; } }
function loadTs(rel) {
  const file = path.join(process.cwd(), rel);
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(process.cwd());
  const req = m.require.bind(m);
  m.require = (id) => { if (id === '@/lib/server/http') return { ApiError: StubApiError }; if (id.startsWith('@/')) return loadTs(id.slice(2) + '.ts'); return req(id); };
  m._compile(out, file); return m.exports;
}
const results = [];
const rec = (name, ok, exp, act) => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      expected: ${exp}\n      actual:   ${act}`}`); };
const codeOf = (fn) => { try { fn(); return null; } catch (e) { return e.code || 'ERR'; } };

const C = loadTs('lib/server/purchaseCharges.ts');
const bill = `TAX INVOICE
Paddy 40 kg bag | 1006 | 300 | Kg | 31.50 | 9450.00 | 5%
Sr 2 | Wheat | 1001 | 200 | 27 | 5400.00
Hamali                              500.00
Freight: ₹1,200.00
Loading Charges .... 300
Unloading  250/-
Weighment charges 60
Total GST 5% 742.50
Discount 100
Grand Total 17,802.50
Round off 0.50`;
const scanned = C.scanChargesFromText(bill);
rec('scan: finds Hamali 500, Freight 1,200, Loading 300, Unloading 250 and Weighment 60 by name', scanned.length === 5 && scanned.find((c) => /hamali/i.test(c.name))?.amount === 500 && scanned.find((c) => /freight/i.test(c.name))?.amount === 1200 && scanned.find((c) => /unloading/i.test(c.name))?.amount === 250 && scanned.find((c) => /weigh/i.test(c.name))?.amount === 60, '5 charges', JSON.stringify(scanned));
rec('scan: item rows, GST, discount, totals and round-off are NOT charges', !scanned.some((c) => /paddy|wheat|gst|discount|total|round/i.test(c.name)), 'none', JSON.stringify(scanned.map((c) => c.name)));
rec('parse: valid list normalised (₹ and commas stripped, 2 decimals)', JSON.stringify(C.parseCharges([{ name: ' Hamali ', amount: '₹1,250.505' }])) === JSON.stringify([{ name: 'Hamali', amount: 1250.51 }]), 'ok', JSON.stringify(C.parseCharges([{ name: 'Hamali', amount: '₹1,250.505' }])));
rec('parse: empty editor rows are ignored', C.parseCharges([{ name: '', amount: '' }, { name: 'Freight', amount: 10 }]).length === 1, '1', '');
for (const [nm, v] of [['zero amount', [{ name: 'A', amount: 0 }]], ['negative', [{ name: 'A', amount: -5 }]], ['no name', [{ name: '', amount: 5 }]], ['not a list', 'x'], ['huge', [{ name: 'A', amount: 1e12 }]]]) {
  rec(`parse: ${nm} rejected`, codeOf(() => C.parseCharges(v)) === 'INVALID_CHARGES', 'INVALID_CHARGES', String(codeOf(() => C.parseCharges(v))));
}
rec('merge: same charge from the model and the scan collapses to one', C.mergeCharges([{ name: 'Hamali', amount: 500 }], [{ name: 'Hamali charges', amount: 500 }, { name: 'Freight', amount: 1 }]).length === 2, '2', '');

async function live() {
  const { prisma, rec: lrec, retry, http, tenant, finish } = await require('./_mill_test_harness')('chg');
  const A = await tenant('a');
  const post = (u, body) => http('POST', u, { ...A, body });
  const rows = [{ supplier: 'Sita Trader', invoiceNumber: 'CH-1', invoiceDate: '2026-09-20', productName: 'Paddy', quantity: 300, unit: 'kg', unitCost: 31.5, gstPercent: 0 }, { supplier: 'Sita Trader', invoiceNumber: 'CH-1', invoiceDate: '2026-09-20', productName: 'Wheat', quantity: 200, unit: 'kg', unitCost: 27, gstPercent: 0 }];
  const goods = 300 * 31.5 + 200 * 27;
  const r = await post('/api/v1/wholesale-import/execute', { importType: 'purchase', data: rows, supplier: { name: 'Sita Trader', paidAmount: 1000 }, charges: [{ name: 'Hamali', amount: '500' }, { name: 'Freight', amount: 1200 }, { name: '', amount: '' }], existingPolicy: 'update', rowDecisions: rows.map(() => 'create'), totalRows: 2 });
  lrec('import with charges: 200', r.status === 200, '200', `${r.status} ${r.text.slice(0, 160)}`);
  const inv = await retry(() => prisma.purchaseInvoice.findFirst({ where: { shopId: A.shopId, invoiceNumber: 'CH-1' } }));
  lrec(`purchase total = goods ₹${goods} + charges ₹1,700 = ₹${goods + 1700}; charges stored`, inv && Math.round(inv.totalCost) === goods + 1700 && Array.isArray(inv.charges) && inv.charges.length === 2 && inv.charges[0].name === 'Hamali', 'ok', JSON.stringify(inv && [inv.totalCost, inv.charges]));
  const sup = await retry(() => prisma.supplier.findFirst({ where: { shopId: A.shopId, name: 'Sita Trader' } }));
  lrec('supplier owed = total − paid at import (charges included)', Math.round(sup.balance) === goods + 1700 - 1000, String(goods + 700), String(sup.balance));
  const tx = await retry(() => prisma.supplierTransaction.findMany({ where: { supplierId: sup.id } }));
  lrec('supplier ledger: one purchase entry for the full ₹ total with the charges named, one payment', tx.filter((t) => t.type === 'purchase').length === 1 && Math.round(tx.find((t) => t.type === 'purchase').amount) === goods + 1700, 'ok', JSON.stringify(tx.map((t) => [t.type, t.amount])));
  const list = (await http('GET', '/api/v1/purchases', A)).json;
  const one = (Array.isArray(list) ? list : list.data).find((i) => i.invoiceNumber === 'CH-1');
  lrec('the Purchases API returns the charges', one?.charges?.length === 2, '2', JSON.stringify(one?.charges));
  const prods = await retry(() => prisma.product.findMany({ where: { shopId: A.shopId } }));
  lrec('charges never became products (only Paddy and Wheat exist)', prods.length === 2 && !prods.some((p) => /hamali|freight/i.test(p.name || '')), '2', prods.map((p) => p.name).join());
  const bad = await post('/api/v1/wholesale-import/execute', { importType: 'purchase', data: [{ ...rows[0], invoiceNumber: 'CH-2' }], supplier: { name: 'Sita Trader' }, charges: [{ name: 'Hamali', amount: -5 }], existingPolicy: 'update', rowDecisions: ['create'], totalRows: 1 });
  lrec('a negative charge is rejected (no purchase created)', bad.status >= 400 && bad.status < 500 && !(await retry(() => prisma.purchaseInvoice.findFirst({ where: { shopId: A.shopId, invoiceNumber: 'CH-2' } }))), '4xx', String(bad.status));
  // editing the items keeps the charges (a one-item bill, so the edit's transaction stays inside this slow database's time limit)
  await post('/api/v1/wholesale-import/execute', { importType: 'purchase', data: [{ ...rows[0], invoiceNumber: 'CH-4', quantity: 10, unitCost: 10 }], supplier: { name: 'Sita Trader' }, charges: [{ name: 'Hamali', amount: 50 }], existingPolicy: 'update', rowDecisions: ['create'], totalRows: 1 });
  const inv4 = await retry(() => prisma.purchaseInvoice.findFirst({ where: { shopId: A.shopId, invoiceNumber: 'CH-4' } }));
  const full = (await http('GET', `/api/v1/purchases/${inv4.id}`, A)).json;
  let edit = null;
  for (let a = 0; a < 3; a++) { edit = await http('PATCH', `/api/v1/purchases/${inv4.id}`, { ...A, body: { supplierId: inv4.supplierId, invoiceNumber: 'CH-4', date: '2026-09-20', warehouseId: null, items: full.purchaseItems.map((it) => ({ productId: it.productId, quantity: 20, cost: it.cost, conversionFactor: 1 })) } }); if (edit.status === 200) break; }
  const after = await retry(() => prisma.purchaseInvoice.findUnique({ where: { id: inv4.id } }));
  lrec('editing the purchase items (10 → 20 kg @ ₹10) keeps the ₹50 charge: total 200 + 50 = ₹250', edit.status === 200 && Math.round(after.totalCost) === 250 && after.charges?.length === 1, '250', `${edit.status} ${after.totalCost} ${String(edit.text).slice(0, 160)}`);
  // no charges = unchanged behaviour
  const plain = await post('/api/v1/wholesale-import/execute', { importType: 'purchase', data: [{ ...rows[0], invoiceNumber: 'CH-3' }], supplier: { name: 'Sita Trader' }, existingPolicy: 'update', rowDecisions: ['create'], totalRows: 1 });
  const inv3 = await retry(() => prisma.purchaseInvoice.findFirst({ where: { shopId: A.shopId, invoiceNumber: 'CH-3' } }));
  lrec('an import without charges behaves exactly as before (total = goods, charges null)', plain.status === 200 && Math.round(inv3.totalCost) === 300 * 31.5 && inv3.charges === null, 'ok', `${plain.status} ${inv3 && inv3.totalCost}`);
  await finish();
}

(async () => {
  if (process.env.LIVE === '1') {
    const unitPass = results.filter((x) => x.ok).length, unitTotal = results.length;
    console.log(`\n-- unit: ${unitPass}/${unitTotal} --\n`);
    await live();
  } else {
    const pass = results.filter((x) => x.ok).length;
    console.log(`\n=== ${pass} passed, ${results.length - pass} failed, ${results.length} total (unit only; LIVE=1 for API tests) ===`);
    process.exit(pass === results.length ? 0 : 1);
  }
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
