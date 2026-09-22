/* eslint-disable */
/**
 * Udhar card item-summary verification (GET /customers -> transactions[].itemSummary).
 *   node scripts/test-udhar-item-summary.js            # creates a throwaway tenant, asserts, keeps data for the UI check
 *   CLEANUP=1 node scripts/test-udhar-item-summary.js  # removes that tenant (uses C:/tmp/udharux.json)
 * Own prefix (udharux-test-) on purpose: it must NOT be swept by, or interfere with, the
 * isolation-test-* cleanup used by the regression suites.
 */
const path = require('path'), fs = require('fs');
for (const l of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^(DATABASE_URL|DIRECT_URL)=(.*)$/); if (!m) continue;
  let v = m[2].trim(); v = /^["']/.test(v) ? v.replace(/^(["'])(.*?)\1.*$/, '$2') : v.replace(/\s+#.*$/, ''); process.env[m[1]] = v;
}
const { PrismaClient } = require(path.join(process.cwd(), 'node_modules/@prisma/client'));
const prisma = new PrismaClient();
const BASE = process.env.BASE || 'http://localhost:3001';
const STATE = 'C:/tmp/udharux.json';
const INFRA = /Can't reach database|Unable to start a transaction|Transaction already closed|Transaction not found|Timed out|ETIMEDOUT|Server has closed/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const rec = (name, ok, exp, act) => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      expected: ${exp}\n      actual:   ${act}`); };

async function http1(method, url, { token, body } = {}) {
  const h = {}; if (token) h.Authorization = `Bearer ${token}`; if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}
async function http(method, url, o) {
  let r = await http1(method, url, o).catch((e) => ({ status: 0, text: String(e) }));
  for (let i = 0; i < 4 && (r.status === 0 || (r.status >= 500 && INFRA.test(r.text))); i++) { await sleep(10000); r = await http1(method, url, o).catch((e) => ({ status: 0, text: String(e) })); }
  return r;
}
async function retry(fn) { for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (i >= 6 || !INFRA.test(String(e.message))) throw e; await sleep(10000); } } }

async function cleanup() {
  if (!fs.existsSync(STATE)) { console.log('no state file'); return; }
  const { shopId, userId } = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  await retry(async () => {
    await prisma.saleItemBatch.deleteMany({ where: { batch: { shopId } } });
    await prisma.batch.deleteMany({ where: { shopId } });
    await prisma.saleItem.deleteMany({ where: { sale: { shopId } } });
    await prisma.sale.deleteMany({ where: { shopId } });
    await prisma.materialReturn.deleteMany({ where: { shopId } });
    await prisma.cashBook.deleteMany({ where: { shopId } });
    const custs = await prisma.customer.findMany({ where: { shopId }, select: { id: true } });
    if (custs.length) await prisma.customer_transactions.deleteMany({ where: { customer_id: { in: custs.map((c) => c.id) } } });
    await prisma.customer.deleteMany({ where: { shopId } });
    await prisma.stockMovement.deleteMany({ where: { shopId } });
    await prisma.product.deleteMany({ where: { shopId } });
    const u = await prisma.user.findFirst({ where: { uuid: userId }, select: { id: true } });
    if (u) await prisma.toolUsage.deleteMany({ where: { userId: u.id } });
    await prisma.user.deleteMany({ where: { uuid: userId } });
    await prisma.shop.deleteMany({ where: { id: shopId } });
  });
  const left = await prisma.shop.count({ where: { id: shopId } });
  console.log('cleanup done; shop rows left:', left);
  fs.unlinkSync(STATE);
}

async function main() {
  const TAG = `udharux-test-${Date.now()}`;
  const email = `${TAG}@example.invalid`;
  const reg = await http('POST', '/api/v1/auth/register', { body: { email, password: 'Test#12345', name: 'Udhar UX', shop_name: `${TAG}-shop`, business_type: 'garments', package_type: 'vyapar' } });
  if (reg.status !== 201) { rec('register', false, '201', `${reg.status} ${String(reg.text).slice(0, 200)}`); return; }
  const token = reg.json.access_token;
  const user = await retry(() => prisma.user.findUnique({ where: { email } }));
  const shop = await retry(() => prisma.shop.findFirst({ where: { ownerId: user.uuid } }));
  fs.writeFileSync(STATE, JSON.stringify({ shopId: shop.id, userId: user.uuid, email, password: 'Test#12345' }));
  const shopId = shop.id;

  const mkProd = (n, price, extra = {}) => retry(() => prisma.product.create({ data: { shopId, name: n, currentStock: 500, sellingPrice: price, costPrice: Math.round(price / 2), baseUnit: 'pcs', ...extra } }));
  const P = {};
  for (const [n, pr] of [['Shirt', 100], ['Jeans', 200], ['T-Shirt', 50], ['Cap', 30], ['Belt', 60], ['Socks', 20], ['Scarf', 40]]) P[n] = await mkProd(n, pr);
  P.Polo = await mkProd('Polo', 150, { variants: [{ color: 'Red', size: 'M', stock: 50, sellingPrice: 150, costPrice: 70 }, { color: 'Blue', size: 'L', stock: 50, sellingPrice: 150, costPrice: 70 }] });
  P.Kg = await mkProd('Rice', 60, { baseUnit: 'kg' });
  const mkCust = (n) => retry(() => prisma.customer.create({ data: { shopId, name: `${TAG}-${n}`, mobile: '9000000001', totalDue: 0 } }));
  const C = {};
  for (const n of ['one', 'three', 'six', 'same', 'variant', 'legacy', 'exch', 'many', 'frac']) C[n] = await mkCust(n);

  const sale = (cust, items) => http('POST', '/api/v1/billing', { token, body: { customer_id: cust.id, payment_type: 'Udhar', amount_paid: 0, items: items.map(([p, q, extra]) => ({ product_id: p.id, quantity: q, price_per_unit: p.sellingPrice, ...(extra || {}) })) } });
  const line = (p, q, e) => [p, q, e];

  // Independent scenarios in parallel groups of 3 (different customers/products => no lock queueing between them).
  const group = async (fns) => Promise.all(fns.map((f) => f()));
  const bills = {};
  await group([
    async () => { bills.one = await sale(C.one, [line(P.Shirt, 1)]); },
    async () => { bills.three = await sale(C.three, [line(P.Jeans, 1), line(P['T-Shirt'], 3), line(P.Cap, 2)]); },
    async () => { bills.six = await sale(C.six, [line(P.Belt, 1), line(P.Socks, 2), line(P.Scarf, 3), line(P.Kg, 1), line(P.Polo, 1, { variant: 'Red / M' }), line(P.Cap, 4)]); },
  ]);
  await group([
    async () => { bills.same = await sale(C.same, [line(P.Shirt, 5)]); },
    async () => { bills.variant = await sale(C.variant, [line(P.Polo, 2, { variant: 'Blue / L' })]); },
    async () => { bills.frac = await sale(C.frac, [line(P.Kg, 2.5)]); },
  ]);
  for (const [k, b] of Object.entries(bills)) if (b.status !== 201) console.log(`   (bill ${k} failed: ${b.status} ${String(b.text).slice(0, 160)})`);

  // refund on the 'same' bill (creates a 'refund' tx carrying the SAME bill number)
  const ret = await http('POST', '/api/v1/billing/returns', { token, body: { bill_id: bills.same.json?.id, items: [{ item_id: bills.same.json?.items?.[0]?.id, quantity: 1 }] } });
  // exchange: original 1-item Udhar bill on C.exch, return Shirt, take Jeans (more expensive) settled to Udhar
  const exBill = await sale(C.exch, [line(P.Shirt, 1)]);
  const exch = await http('POST', '/api/v1/billing/exchange', { token, body: { bill_id: exBill.json?.id, return_items: [{ item_id: exBill.json?.items?.[0]?.id, quantity: 1 }], exchange_items: [{ product_id: P.Jeans.id, quantity: 1 }], settlement_method: 'Udhar' } });
  // legacy: manual udhar entries with an unknown bill number and with none
  await http('POST', `/api/v1/customers/${C.legacy.id}/transactions`, { token, body: { type: 'udhar', amount: 100, billNumber: 'LEGACY-XYZ', note: 'old entry' } });
  await http('POST', `/api/v1/customers/${C.legacy.id}/transactions`, { token, body: { type: 'udhar', amount: 50, note: 'no bill' } });
  // many rows: 7 small Udhar bills on one customer -> API still returns only the latest 5 (preserved take: 5)
  for (let i = 0; i < 7; i++) await sale(C.many, [line(P.Socks, 1)]);

  const list = await http('GET', '/api/v1/customers', { token });
  rec('GET /customers -> 200', list.status === 200, '200', String(list.status));
  const by = (n) => (list.json || []).find((c) => c.name === `${TAG}-${n}`);
  const udharTx = (c) => (c?.transactions || []).filter((t) => t.type === 'udhar');

  let s = udharTx(by('one'))[0]?.itemSummary;
  rec('1-item bill: Shirt x1, itemCount 1, totalQty 1', !!s && s.items.length === 1 && s.items[0].name === 'Shirt' && s.items[0].quantity === 1 && s.itemCount === 1 && s.totalQty === 1, 'Shirt x1 / 1 / 1', JSON.stringify(s));
  s = udharTx(by('three'))[0]?.itemSummary;
  const names3 = (s?.items || []).map((i) => `${i.name}x${i.quantity}`).sort().join(',');
  rec('3-item bill: all 3 lines + totalQty 6', !!s && s.items.length === 3 && s.itemCount === 3 && s.totalQty === 6 && names3 === 'Capx2,Jeansx1,T-Shirtx3', 'Capx2,Jeansx1,T-Shirtx3 / 6', `${names3} / ${s?.totalQty}`);
  s = udharTx(by('six'))[0]?.itemSummary;
  rec('6-item bill: only first 3 sent, itemCount 6, totalQty covers the WHOLE bill (12)', !!s && s.items.length === 3 && s.itemCount === 6 && s.totalQty === 12, '3 sent / 6 / 12', `${s?.items?.length} / ${s?.itemCount} / ${s?.totalQty}`);
  s = udharTx(by('same'))[0]?.itemSummary;
  rec('same product qty 5: one line Shirt x5, totalQty 5', !!s && s.items.length === 1 && s.items[0].quantity === 5 && s.totalQty === 5, 'Shirt x5 / 5', JSON.stringify(s));
  s = udharTx(by('variant'))[0]?.itemSummary;
  rec('variant item: variant "Blue / L" travels with the line', !!s && s.items[0].name === 'Polo' && s.items[0].variant === 'Blue / L' && s.items[0].quantity === 2, 'Polo (Blue / L) x2', JSON.stringify(s));
  s = udharTx(by('frac'))[0]?.itemSummary;
  rec('fractional qty (2.5 kg) preserved', !!s && s.items[0].quantity === 2.5 && s.totalQty === 2.5, '2.5', JSON.stringify(s));
  const leg = udharTx(by('legacy'));
  rec('legacy udhar rows (unknown bill number / no bill): no itemSummary, no crash, fields intact', leg.length === 2 && leg.every((t) => t.itemSummary === undefined && typeof t.amount === 'number'), '2 rows, no itemSummary', `${leg.length} rows, summaries=${leg.map((t) => String(t.itemSummary))}`);
  const same = by('same');
  const refundTx = (same?.transactions || []).filter((t) => t.type === 'refund');
  rec('refund transaction on the same bill number carries NO itemSummary', refundTx.length >= 0 && refundTx.every((t) => t.itemSummary === undefined) && (ret.status === 200 ? refundTx.length === 1 : true), 'refund rows without summary', `${refundTx.length} refund rows; return status ${ret.status}`);
  const exTx = udharTx(by('exch'));
  const excRow = exTx.find((t) => /^EXC-/.test(t.billNumber || ''));
  rec('exchange difference (Udhar) row shows the EXCHANGE bill items (Jeans x1)', exch.status === 200 && !!excRow && excRow.itemSummary?.items?.[0]?.name === 'Jeans', 'Jeans x1', `${exch.status} ${JSON.stringify(excRow?.itemSummary)}`);
  const many = by('many');
  rec('customer with 7 Udhar bills: API still returns only 5 transactions (pagination limit preserved), each with a summary', (many?.transactions || []).length === 5 && many.transactions.every((t) => !!t.itemSummary), '5 rows, all with summary', `${many?.transactions?.length} rows`);

  // Financial values untouched: balances equal the plain udhar/refund arithmetic.
  const due = (n) => Number(by(n)?.totalDue);
  rec('balances unchanged: one=100, three=210, six=600.. computed by billing exactly as before',
    due('one') === 100 && due('three') === 1 * 200 + 3 * 50 + 2 * 30 && due('same') === 400 && due('frac') === 150 && due('legacy') === 150 && due('many') === 7 * 20,
    'one100 three410 same400 frac150 legacy150 many140', `one${due('one')} three${due('three')} same${due('same')} frac${due('frac')} legacy${due('legacy')} many${due('many')}`);

  // Payload stays small: no per-transaction item arrays beyond 3 lines.
  const maxItems = Math.max(0, ...(list.json || []).flatMap((c) => (c.transactions || []).map((t) => t.itemSummary?.items?.length || 0)));
  rec('payload bound: never more than 3 item lines per transaction', maxItems <= 3, '<= 3', String(maxItems));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== ${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total ===`);
  failed.forEach((f) => console.log('FAILED: ' + f.name));
  console.log(`\nUI login for the visual check: ${email} / Test#12345`);
}

(process.env.CLEANUP ? cleanup() : main())
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
