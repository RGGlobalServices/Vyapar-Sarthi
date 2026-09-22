/* eslint-disable */
/**
 * Phase 2A tests: server-side money validation + return/refund security.
 *   node scripts/test-phase2a.js                                     # unit tests only
 *   LIVE=1 BASE=http://localhost:3001 node scripts/test-phase2a.js   # + API tests (throwaway isolation-test-2a-* tenant)
 * Cleanup afterwards: CLEANUP_ONLY=1 node scripts/test-isolation.js
 */
const path = require('path'), fs = require('fs'), Module = require('module');
const ts = require(path.join(process.cwd(), 'node_modules/typescript'));
const { PrismaClient } = require(path.join(process.cwd(), 'node_modules/@prisma/client'));
(function loadEnv() {
  let txt = ''; try { txt = fs.readFileSync('.env.local', 'utf8'); } catch {}
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^(DATABASE_URL|DIRECT_URL)=(.*)$/); if (!m || process.env[m[1]]) continue;
    let v = m[2].trim(); if (/^["']/.test(v)) v = v.replace(/^(["'])(.*?)\1.*$/, '$2'); else v = v.replace(/\s+#.*$/, ''); process.env[m[1]] = v;
  }
})();
const BASE = process.env.BASE || 'http://localhost:3001', LIVE = process.env.LIVE === '1';
const prisma = new PrismaClient();
const TAG = `isolation-test-2a-${Date.now()}`;
const results = [];
const rec = (name, ok, exp, act) => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      expected: ${exp}\n      actual:   ${act}`); };
class StubApiError extends Error { constructor(s, m, c) { super(m); this.status = s; this.code = c; } }
function loadTs(rel) {
  const file = path.join(process.cwd(), rel);
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(process.cwd());
  const req = m.require.bind(m);
  m.require = (id) => {
    if (id === '@/lib/server/http') return { ApiError: StubApiError };
    if (id.startsWith('@/')) return loadTs(id.slice(2) + '.ts');
    return req(id);
  };
  m._compile(out, file); return m.exports;
}
const err = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const INFRA = /Can't reach database|Unable to start a transaction|Transaction already closed|Transaction not found|Timed out fetching|ETIMEDOUT|Server has closed/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function http1(method, url, { token, body } = {}) {
  const h = {}; if (token) h.Authorization = `Bearer ${token}`; if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {} return { status: res.status, json, text };
}
async function http(method, url, o) {
  let r = await http1(method, url, o).catch((e) => ({ status: 0, text: String(e) }));
  for (let i = 0; i < 4 && (r.status === 0 || (r.status === 500 && INFRA.test(r.text))); i++) { await sleep(15000); r = await http1(method, url, o).catch((e) => ({ status: 0, text: String(e) })); }
  return r;
}
async function retry(fn) { for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (i >= 6 || !INFRA.test(String(e.message))) throw e; await sleep(15000); } } }

async function unit() {
  const mv = loadTs('lib/server/moneyValidation.ts');
  const rf = loadTs('lib/server/refunds.ts');
  const bad = [-5, NaN, Infinity, -Infinity, 'abc', '', {}, true, 1001];
  for (const b of bad) rec(`amount_paid ${typeof b === 'object' ? 'object' : String(b)} rejected`, !!err(() => mv.resolveAmountPaid(b, 1000, 'Cash')), 'throws', String(err(() => mv.resolveAmountPaid(b, 1000, 'Cash'))));
  rec('amount_paid 0 -> 0 (Udhar)', mv.resolveAmountPaid(0, 1000, 'Udhar') === 0, '0', String(mv.resolveAmountPaid(0, 1000, 'Udhar')));
  rec('amount_paid == total ok', mv.resolveAmountPaid(1000, 1000, 'Cash') === 1000, '1000', '');
  rec('amount_paid "400" string ok', mv.resolveAmountPaid('400', 1000, 'Cash') === 400, '400', '');
  rec('amount_paid absent -> total (Cash) / 0 (Udhar)', mv.resolveAmountPaid(undefined, 1000, 'Cash') === 1000 && mv.resolveAmountPaid(undefined, 1000, 'Udhar') === 0, '1000 / 0', '');
  const s = (d, ap) => err(() => mv.validatePaymentDetails(d, 'Split', ap));
  const ok = mv.validatePaymentDetails({ cash: 300, upi: 700 }, 'Split', 1000);
  rec('split 300 cash + 700 UPI valid, cash-book cash = 300', ok.cash === 300, '300', String(ok.cash));
  rec('split 900 + 900 vs paid 1000 rejected', !!s({ cash: 900, upi: 900 }, 1000), 'throws', String(s({ cash: 900, upi: 900 }, 1000)));
  rec('split mismatched total (300+600 vs 1000) rejected', !!s({ cash: 300, upi: 600 }, 1000), 'throws', '');
  rec('split negative component rejected', !!s({ cash: -100, upi: 1100 }, 1000), 'throws', '');
  rec('split NaN component rejected', !!s({ cash: NaN, upi: 1000 }, 1000), 'throws', '');
  rec('split Infinity component rejected', !!s({ cash: Infinity, upi: 1000 }, 1000), 'throws', '');
  rec('split huge cash rejected', !!s({ cash: 99999999, upi: 0 }, 1000), 'throws', '');
  rec('split component "abc" rejected', !!s({ cash: 'abc', upi: 1000 }, 1000), 'throws', '');
  rec('split cash+upi+card+bank all counted', !s({ cash: 100, upi: 200, card: 300, bank: 400 }, 1000), 'ok', String(s({ cash: 100, upi: 200, card: 300, bank: 400 }, 1000)));
  rec('split udhar echo not counted as money', !s({ cash: 300, upi: 300, udhar: 400 }, 600), 'ok', String(s({ cash: 300, upi: 300, udhar: 400 }, 600)));
  rec('Cash type: forged huge cash component rejected', !!err(() => mv.validatePaymentDetails({ cash: 99999 }, 'Cash', 100)), 'throws', '');
  rec('Cash type cash-book = amount_paid', mv.validatePaymentDetails({}, 'Cash', 250).cash === 250, '250', '');
  rec('UPI type never hits cash book', mv.validatePaymentDetails({ upiApp: 'x' }, 'UPI', 250).cash === 0, '0', '');
  const prod = { costPrice: 60, wholesaleCost: 0, variants: [{ color: 'Red', size: 'M', costPrice: 70 }] };
  rec('purchase_price 99999 ignored for product line', mv.resolveLineCost({ purchase_price: 99999 }, prod, 100) === 60, '60 (server cost)', String(mv.resolveLineCost({ purchase_price: 99999 }, prod, 100)));
  rec('purchase_price 0 / -5 / NaN ignored -> server cost', [0, -5, NaN].every((v) => mv.resolveLineCost({ purchase_price: v }, prod, 100) === 60), '60', '');
  rec('variant cost used for variant line', mv.resolveLineCost({ variant: 'Red / M', purchase_price: 1 }, prod, 100) === 70, '70', '');
  rec('free-form line: client cost capped to price', mv.resolveLineCost({ purchase_price: 500 }, null, 100) === 100 && mv.resolveLineCost({ purchase_price: NaN }, null, 100) === 0 && mv.resolveLineCost({ purchase_price: -3 }, null, 100) === 0, '100/0/0', '');
  const item = (id, q, p, m = 0) => ({ id, quantity: q, pricePerUnit: p, marginPerUnit: m, itemName: 'x' });
  const plan = (items, total, prior, reqs) => rf.planReturn({ saleItems: items, saleTotal: total, priorReturns: prior, requests: reqs });
  let r = plan([item('a', 2, 100)], 200, [], [{ item_id: 'a', quantity: 1 }]);
  rec('return 1 of 2 @100 = 100 (client has no say)', r.totalRefund === 100, '100', String(r.totalRefund));
  r = plan([item('a', 2, 100)], 180, [], [{ item_id: 'a', quantity: 2 }]);
  rec('discounted bill 2x100 total 180, full return -> 180', r.totalRefund === 180, '180', String(r.totalRefund));
  r = plan([item('a', 2, 100)], 180, [], [{ item_id: 'a', quantity: 1 }]);
  const r2 = plan([item('a', 2, 100)], 90, [{ saleItemId: 'a', quantity: 1, amount: r.totalRefund, settled: true }], [{ item_id: 'a', quantity: 1 }]);
  rec('discounted: two 1-unit returns total 180 (90+90)', r.totalRefund === 90 && r2.totalRefund === 90, '90+90', `${r.totalRefund}+${r2.totalRefund}`);
  rec('quantity above sold rejected', !!err(() => plan([item('a', 2, 100)], 200, [], [{ item_id: 'a', quantity: 3 }])), 'throws', '');
  rec('duplicate ids 2+2 of 3 rejected', !!err(() => plan([item('a', 3, 100)], 300, [], [{ item_id: 'a', quantity: 2 }, { item_id: 'a', quantity: 2 }])), 'throws', '');
  rec('duplicate ids 1+1 of 2 accepted = 200', plan([item('a', 2, 100)], 200, [], [{ item_id: 'a', quantity: 1 }, { item_id: 'a', quantity: 1 }]).totalRefund === 200, '200', '');
  rec('duplicate ids 2+1 of 2 rejected', !!err(() => plan([item('a', 2, 100)], 200, [], [{ item_id: 'a', quantity: 2 }, { item_id: 'a', quantity: 1 }])), 'throws', '');
  rec('already-returned counted', !!err(() => plan([item('a', 2, 100)], 100, [{ saleItemId: 'a', quantity: 1, amount: 100, settled: true }], [{ item_id: 'a', quantity: 2 }])), 'throws', '');
  rec('negative / NaN / string return qty rejected', [-1, NaN, 'x'].every((q) => !!err(() => plan([item('a', 2, 100)], 200, [], [{ item_id: 'a', quantity: q }]))), 'throws', '');
  rec('unknown item_id rejected', !!err(() => plan([item('a', 2, 100)], 200, [], [{ item_id: 'zzz', quantity: 1 }])), 'throws', '');
  r = plan([item('a', 3, 100)], 100, [], [{ item_id: 'a', quantity: 3 }]);
  rec('thirds: full return refunds exactly the bill total (100)', r.totalRefund === 100, '100', String(r.totalRefund));
  let sp = rf.splitRefund(300, 600, 600);
  rec('bill 1000 paid 400 udhar 600, return 300 -> udhar 300 cash 0', sp.udharCleared === 300 && sp.cashRefunded === 0, '300/0', JSON.stringify(sp));
  sp = rf.splitRefund(300, 100, 100);
  rec('bill 1000 paid 900 udhar 100, return 300 -> udhar 100 cash 200', sp.udharCleared === 100 && sp.cashRefunded === 200, '100/200', JSON.stringify(sp));
  sp = rf.splitRefund(300, 600, 50);
  rec('customer balance lower than bill outstanding: never negative (udhar 50, cash 250)', sp.udharCleared === 50 && sp.cashRefunded === 250, '50/250', JSON.stringify(sp));
  sp = rf.splitRefund(300, 0, 0);
  rec('fully paid bill -> all cash', sp.udharCleared === 0 && sp.cashRefunded === 300, '0/300', JSON.stringify(sp));
}

async function api() {
  const email = `${TAG}@example.invalid`;
  let r = await http('POST', '/api/v1/auth/register', { body: { email, password: 'Test#12345', name: 'P2A', shop_name: `${TAG}-shop`, business_type: 'kirana', package_type: 'vyapar' } });
  if (r.status !== 201) { rec('API setup', false, '201', `${r.status} ${String(r.text).slice(0, 200)}`); return; }
  const token = r.json.access_token;
  const u = await retry(() => prisma.user.findUnique({ where: { email } }));
  const shop = await retry(() => prisma.shop.findFirst({ where: { ownerId: u.uuid } }));
  const shopId = shop.id;
  const prodA = await retry(() => prisma.product.create({ data: { shopId, name: `${TAG}-A`, currentStock: 100, sellingPrice: 100, costPrice: 60, baseUnit: 'pcs' } }));
  const prodZ = await retry(() => prisma.product.create({ data: { shopId, name: `${TAG}-Z`, currentStock: 0, sellingPrice: 50, costPrice: 20, baseUnit: 'pcs' } }));
  const prodX = await retry(() => prisma.product.create({ data: { shopId, name: `${TAG}-X`, currentStock: 50, sellingPrice: 700, costPrice: 400, baseUnit: 'pcs' } }));
  const mkCust = (due) => retry(() => prisma.customer.create({ data: { shopId, name: `${TAG}-c${Math.random()}`, mobile: '9000000009', totalDue: due } }));
  const sale = (b) => http('POST', '/api/v1/billing', { token, body: { payment_type: 'Cash', ...b } });
  const line = (p, q, pr, extra = {}) => ({ product_id: p.id, quantity: q, price_per_unit: pr, ...extra });
  const cash = () => retry(() => prisma.cashBook.findMany({ where: { shopId } }));
  const due = async (c) => Number((await retry(() => prisma.customer.findUnique({ where: { id: c.id } }))).totalDue);
  const salesN = () => retry(() => prisma.sale.count({ where: { shopId } }));

  let n0 = await salesN();
  for (const [label, v] of [['negative', -5], ['greater than total', 999999], ['NaN string', 'abc'], ['Infinity string', 'Infinity']]) {
    const x = await sale({ items: [line(prodA, 1, 100)], amount_paid: v });
    rec(`billing amount_paid ${label} -> 400`, x.status === 400, '400', String(x.status));
  }
  rec('rejected requests created no sale', (await salesN()) === n0, String(n0), String(await salesN()));
  const cU = await mkCust(0);
  let x = await sale({ items: [line(prodA, 1, 100)], payment_type: 'Udhar', amount_paid: 0, customer_id: cU.id });
  rec('zero amount_paid = Udhar preserved', x.status === 201 && Number(x.json.amountPaid) === 0, '201, amountPaid 0', `${x.status} ${x.json && x.json.amountPaid}`);
  x = await sale({ items: [line(prodA, 10, 100)], payment_type: 'Split', amount_paid: 1000, payment_details: { cash: 300, upi: 700 } });
  const cb1 = (await cash()).filter((c) => c.referenceId === (x.json && x.json.id));
  rec('split 300+700 accepted; cash book = 300 only', x.status === 201 && cb1.length === 1 && Number(cb1[0].amount) === 300, '201, cashbook 300', `${x.status} ${JSON.stringify(cb1.map((c) => c.amount))}`);
  const cbBefore = (await cash()).length;
  x = await sale({ items: [line(prodA, 10, 100)], payment_type: 'Split', amount_paid: 1000, payment_details: { cash: 900, upi: 900 } });
  rec('split 900+900 vs 1000 -> 400, no cash-book row', x.status === 400 && (await cash()).length === cbBefore, '400', String(x.status));
  x = await sale({ items: [line(prodA, 1, 100)], payment_type: 'Split', amount_paid: 100, payment_details: { cash: 99999999 } });
  rec('huge forged cash -> 400', x.status === 400, '400', String(x.status));
  x = await sale({ items: [line(prodA, 1, 100, { purchase_price: 99999 })] });
  const si = x.json && await retry(() => prisma.saleItem.findFirst({ where: { saleId: x.json.id } }));
  rec('purchase_price 99999 ignored: margin = 40', x.status === 201 && si && Number(si.marginPerUnit) === 40, 'margin 40', String(si && si.marginPerUnit));
  x = await sale({ items: [line(prodA, 1, 100, { purchase_price: 0 })] });
  const si0 = x.json && await retry(() => prisma.saleItem.findFirst({ where: { saleId: x.json.id } }));
  rec('purchase_price 0 ignored: margin 40', si0 && Number(si0.marginPerUnit) === 40, '40', String(si0 && si0.marginPerUnit));
  x = await sale({ items: [line(prodZ, 1, 50)], allowNegativeStock: true, allow_negative_stock: true });
  const pz = await retry(() => prisma.product.findUnique({ where: { id: prodZ.id } }));
  rec('client allowNegativeStock ignored on 0-stock item, stock still 0', [400, 409].includes(x.status) && pz.currentStock === 0, '4xx, stock 0', `${x.status} stock=${pz.currentStock}`);
  await retry(() => prisma.shop.update({ where: { id: shopId }, data: { allowNegativeStock: true } }));
  x = await sale({ items: [line(prodZ, 1, 50)] });
  rec('shop-level allowNegativeStock=true still honoured', x.status === 201, '201', String(x.status));
  await retry(() => prisma.shop.update({ where: { id: shopId }, data: { allowNegativeStock: false } }));

  const retReq = (bill, items) => http('POST', '/api/v1/billing/returns', { token, body: { bill_id: bill, items } });
  x = await sale({ items: [line(prodA, 2, 100)] });
  const b1 = x.json, b1i = b1.items[0];
  r = await retReq(b1.id, [{ item_id: b1i.id, quantity: 1, price: 5000 }]);
  rec('return price 5000 ignored -> refund 100', r.status === 200 && Number(r.json.totalRefund) === 100, '100', `${r.status} ${r.json && r.json.totalRefund}`);
  r = await retReq(b1.id, [{ item_id: b1i.id, quantity: 1, price: -5 }]);
  rec('return price -5 ignored -> refund 100', r.status === 200 && Number(r.json.totalRefund) === 100, '100', `${r.status} ${r.json && r.json.totalRefund}`);
  r = await retReq(b1.id, [{ item_id: b1i.id, quantity: 1 }]);
  rec('third unit (only 2 sold) rejected', r.status === 400, '400', String(r.status));
  x = await sale({ items: [line(prodA, 3, 100)] });
  r = await retReq(x.json.id, [{ item_id: x.json.items[0].id, quantity: 2 }, { item_id: x.json.items[0].id, quantity: 2 }]);
  const mrs = await retry(() => prisma.materialReturn.count({ where: { shopId, note: { contains: x.json.id } } }));
  rec('duplicate item_ids 2+2 of 3 -> 400, no MaterialReturn', r.status === 400 && mrs === 0, '400, 0 rows', `${r.status} rows=${mrs}`);
  r = await retReq(x.json.id, [{ item_id: x.json.items[0].id, quantity: -1 }]);
  rec('negative return quantity -> 400', r.status === 400, '400', String(r.status));
  x = await sale({ items: [line(prodA, 2, 100)], discount: 20 });
  rec('discounted bill total is 180', Number(x.json.totalAmount) === 180, '180', String(x.json.totalAmount));
  r = await retReq(x.json.id, [{ item_id: x.json.items[0].id, quantity: 2 }]);
  rec('discounted full return refunds 180 (not 200)', r.status === 200 && Number(r.json.totalRefund) === 180 && Number(r.json.cashRefunded) === 180, '180/180', `${r.status} ${r.json && r.json.totalRefund}`);
  const sAfter = await retry(() => prisma.sale.findUnique({ where: { id: x.json.id } }));
  rec('sale total after full return = 0', Number(sAfter.totalAmount) === 0, '0', String(sAfter.totalAmount));
  x = await sale({ items: [line(prodA, 2, 100)], discount: 20 });
  const ra = await retReq(x.json.id, [{ item_id: x.json.items[0].id, quantity: 1 }]);
  const rb = await retReq(x.json.id, [{ item_id: x.json.items[0].id, quantity: 1 }]);
  rec('discounted, two calls total exactly 180', Number(ra.json.totalRefund) + Number(rb.json.totalRefund) === 180, '90+90', `${ra.json && ra.json.totalRefund}+${rb.json && rb.json.totalRefund}`);
  const c4 = await mkCust(0);
  x = await sale({ items: [line(prodA, 10, 100)], payment_type: 'Udhar', amount_paid: 400, customer_id: c4.id });
  rec('partial bill created, customer due = 600', x.status === 201 && (await due(c4)) === 600, '600', String(await due(c4)));
  const cbP = (await cash()).length;
  r = await retReq(x.json.id, [{ item_id: x.json.items[0].id, quantity: 3 }]);
  rec('return 300 on paid-400 bill -> udhar 300, cash 0, due 300', r.status === 200 && Number(r.json.udharCleared) === 300 && Number(r.json.cashRefunded) === 0 && (await due(c4)) === 300 && (await cash()).length === cbP, 'udhar300 cash0 due300', `${r.status} ${JSON.stringify(r.json && [r.json.udharCleared, r.json.cashRefunded])} due=${await due(c4)}`);
  const c5 = await mkCust(0);
  x = await sale({ items: [line(prodA, 10, 100)], payment_type: 'Udhar', amount_paid: 900, customer_id: c5.id });
  r = await retReq(x.json.id, [{ item_id: x.json.items[0].id, quantity: 3 }]);
  rec('return 300 on paid-900 bill -> udhar 100, cash 200, due 0', r.status === 200 && Number(r.json.udharCleared) === 100 && Number(r.json.cashRefunded) === 200 && (await due(c5)) === 0, 'udhar100 cash200 due0', `${r.status} ${JSON.stringify(r.json && [r.json.udharCleared, r.json.cashRefunded])} due=${await due(c5)}`);
  const c6 = await mkCust(0);
  x = await sale({ items: [line(prodA, 10, 100)], payment_type: 'Udhar', amount_paid: 400, customer_id: c6.id });
  await retry(() => prisma.customer.update({ where: { id: c6.id }, data: { totalDue: 50 } }));
  r = await retReq(x.json.id, [{ item_id: x.json.items[0].id, quantity: 3 }]);
  rec('customer due lower than bill outstanding: never negative', r.status === 200 && (await due(c6)) === 0 && Number(r.json.cashRefunded) === 250, 'due 0, cash 250', `${r.status} due=${await due(c6)} cash=${r.json && r.json.cashRefunded}`);

  const exReq = (bill, ri, ei, sm) => http('POST', '/api/v1/billing/exchange', { token, body: { bill_id: bill, return_items: ri, exchange_items: ei, settlement_method: sm } });
  x = await sale({ items: [line(prodA, 1, 100)] });
  r = await exReq(x.json.id, [{ item_id: x.json.items[0].id, quantity: 1, price: 99999 }], [{ product_id: prodX.id, quantity: 1, price: 1 }], 'Cash');
  rec('exchange: client prices ignored -> 700 / 100 / 600', r.status === 200 && Number(r.json.exchangeValue) === 700 && Number(r.json.returnValue) === 100 && Number(r.json.difference) === 600, '700/100/600', `${r.status} ${r.json && [r.json.exchangeValue, r.json.returnValue, r.json.difference]}`);
  x = await sale({ items: [line(prodA, 1, 100)] });
  r = await exReq(x.json.id, [{ item_id: x.json.items[0].id, quantity: 1 }], [{ product_id: prodX.id, quantity: 1, price: 0 }], 'Cash');
  rec('exchange price 0 ignored (charged 700)', r.status === 200 && Number(r.json.exchangeValue) === 700, '700', `${r.status} ${r.json && r.json.exchangeValue}`);
  x = await sale({ items: [line(prodA, 3, 100)] });
  r = await exReq(x.json.id, [{ item_id: x.json.items[0].id, quantity: 2 }, { item_id: x.json.items[0].id, quantity: 2 }], [{ product_id: prodX.id, quantity: 1 }], 'Cash');
  rec('exchange duplicate ids 2+2 of 3 rejected', r.status === 400, '400', String(r.status));
  x = await sale({ items: [line(prodA, 1, 100)] });
  r = await exReq(x.json.id, [{ item_id: x.json.items[0].id, quantity: 1 }], [{ product_id: prodX.id, quantity: -2 }], 'Cash');
  rec('exchange negative quantity rejected', r.status === 400, '400', String(r.status));

  const cP = await mkCust(500);
  const pay = (amount) => http('POST', `/api/v1/customers/${cP.id}/transactions`, { token, body: { type: 'payment', amount } });
  r = await pay(600);
  rec('payment 600 on due 500 rejected, due unchanged', r.status === 400 && (await due(cP)) === 500, '400, 500', `${r.status} ${await due(cP)}`);
  r = await pay('abc');
  rec('payment "abc" rejected', r.status === 400, '400', String(r.status));
  r = await http('POST', '/api/v1/crm/payments', { token, body: { entityType: 'customer', entityId: cP.id, amount: 501, paymentMode: 'Cash' } });
  rec('crm/payments overpayment 501 rejected', r.status === 400 && (await due(cP)) === 500, '400', `${r.status}`);
  r = await pay(200);
  rec('normal payment 200 ok -> due 300', [200, 201].includes(r.status) && (await due(cP)) === 300, 'due 300', `${r.status} ${await due(cP)}`);
  r = await http('POST', '/api/v1/crm/payments', { token, body: { entityType: 'customer', entityId: cP.id, amount: 300, paymentMode: 'Cash' } });
  rec('exact-clear payment 300 ok -> due 0', r.status === 200 && (await due(cP)) === 0, 'due 0', `${r.status} ${await due(cP)}`);
  const all = await retry(() => prisma.sale.findMany({ where: { shopId } }));
  rec('invariant: 0 <= amountPaid <= total on every non-exchanged sale (exchange originals keep amountPaid: pre-existing, Phase 2B)', all.filter((s) => Number(s.totalAmount) > 0).every((s) => Number(s.amountPaid) >= -0.001 && Number(s.amountPaid) <= Number(s.totalAmount) + 0.01), 'all valid', `${all.length} sales`);
  const custs = await retry(() => prisma.customer.findMany({ where: { shopId } }));
  rec('invariant: no customer balance negative', custs.every((c) => Number(c.totalDue) >= -0.001), 'all >= 0', '');
}

(async () => {
  await unit();
  if (LIVE) await api();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== ${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total ===`);
  failed.forEach((f) => console.log('FAILED: ' + f.name));
  await prisma.$disconnect();
  process.exit(failed.length ? 1 : 0);
})();
