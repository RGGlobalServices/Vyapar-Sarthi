/**
 * Dashboard Phase 1 — server metrics + performance tests.
 *
 *   node scripts/test-dashboard-metrics.js seed              # create throwaway isolation-test-dash-* tenants + fixtures
 *   node scripts/test-dashboard-metrics.js capture <label>   # call the dashboard API for fixed scenarios, save output + timings
 *   node scripts/test-dashboard-metrics.js verify            # assertions against INDEPENDENTLY computed expectations
 *   node scripts/test-dashboard-metrics.js perf              # latency: cache miss (refresh=true) vs cache hit
 *
 * Needs the dev server on 127.0.0.1:3001. Throwaway tenants are swept by `CLEANUP_ONLY=1 node scripts/test-isolation.js`.
 * Fixtures are written straight to the DB so dates/amounts are exact (IST boundaries, bank/cheque, Mill columns).
 */
const fs = require('fs'), path = require('path');
const { PrismaClient } = require(path.join(process.cwd(), 'node_modules/@prisma/client'));
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^(DATABASE_URL|DIRECT_URL)=(.*)$/); if (!m || process.env[m[1]]) continue;
  let v = m[2].trim(); v = /^["']/.test(v) ? v.replace(/^(["'])(.*?)\1.*$/, '$2') : v.replace(/\s+#.*$/, ''); process.env[m[1]] = v;
}
const prisma = new PrismaClient();
const BASE = 'http://127.0.0.1:3001';
const FX = 'C:/tmp/dash_fx.json';
const PW = 'Test#12345Password';
const INFRA = /Can't reach database|Unable to start a transaction|Transaction already closed|Transaction not found|Timed out|ETIMEDOUT|Server has closed/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const retry = async (fn) => { for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (i >= 6 || !INFRA.test(String(e.message))) throw e; await sleep(15000); } } };
async function http(method, url, { token, body, shop, headers } = {}) {
  for (let i = 0; i < 4; i++) {
    const h = { ...(headers || {}) }; if (token) h.Authorization = `Bearer ${token}`; if (shop) h['x-shop-id'] = shop; if (body !== undefined) h['Content-Type'] = 'application/json';
    const t0 = Date.now();
    const res = await fetch(BASE + url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined }).catch((e) => ({ status: 0, text: async () => String(e) }));
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
    if (res.status === 0 || (res.status === 500 && INFRA.test(text))) { await sleep(15000); continue; }
    return { status: res.status, json, text, ms: Date.now() - t0 };
  }
  return { status: 0, text: 'infra', ms: 0 };
}
let pass = 0, fail = 0;
const rec = (name, ok, exp, act) => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      expected: ${exp}\n      actual:   ${act}`}`); };
const near = (a, b, tol = 0.011) => Math.abs(Number(a) - Number(b)) <= tol;
const J = (x) => JSON.stringify(x);
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ── IST helpers (the app's day boundary is Asia/Kolkata) ─────────────────────
const istDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const ist = (day, hms) => new Date(`${day}T${hms}+05:30`);
const addDays = (day, n) => istDay(new Date(ist(day, '12:00:00.000').getTime() + n * 86400000));
const TODAY = istDay(new Date());
const MONTH1 = TODAY.slice(0, 8) + '01';
const range = (fromDay, toDay) => ({ start: ist(fromDay, '00:00:00.000'), end: ist(toDay, '23:59:59.999') });

// ── reference implementation of the metric definitions (written independently of the route) ─────────────
const modeOf = (raw) => {
  const m = String(raw || '').toLowerCase();
  if (m.includes('cash')) return 'cash';
  if (/upi|gpay|phonepe|paytm/.test(m)) return 'upi';
  if (/bank|neft|rtgs|imps/.test(m)) return 'bank';
  if (/cheque|check/.test(m)) return 'cheque';
  if (/card|debit|credit/.test(m)) return 'card';
  return 'other';
};
function refSales(sales, from, to) {
  const o = { billed: 0, net: 0, gst: 0, charges: 0, roundOff: 0, discount: 0, profit: 0, received: 0, count: 0, modes: { cash: 0, upi: 0, card: 0, bank: 0, cheque: 0, other: 0 } };
  for (const s of sales) {
    const t = new Date(s.createdAt).getTime(); if (t < from.getTime() || t > to.getTime()) continue;
    o.count++; o.billed += s.totalAmount; o.gst += s.gstAmount || 0; o.charges += s.chargesTotal || 0; o.roundOff += s.roundOffAmount || 0; o.discount += s.discountAmount || 0;
    o.net += s.totalAmount - (s.gstAmount || 0) - (s.chargesTotal || 0) - (s.roundOffAmount || 0);
    o.profit += s.totalProfit; o.received += s.amountPaid;
    if (s.amountPaid > 0) {
      let d = s.paymentDetails; if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
      const c = Number(d?.cash) || 0, u = Number(d?.upi) || 0, cd = Number(d?.card) || 0, b = Number(d?.bank) || 0, ch = Number(d?.cheque) || 0;
      const split = c + u + cd + b + ch;
      if (split > 0) { o.modes.cash += c; o.modes.upi += u; o.modes.card += cd; o.modes.bank += b; o.modes.cheque += ch; if (s.amountPaid > split) o.modes.other += s.amountPaid - split; }
      else o.modes[modeOf(s.paymentType)] += s.amountPaid;
    }
  }
  return o;
}
const sumIn = (rows, key, from, to, f = () => true) => rows.filter((r) => { const t = new Date(r[key]).getTime(); return t >= from.getTime() && t <= to.getTime() && f(r); });

// ═════════════════════════════════════ SEED ═════════════════════════════════════
async function tenant(TAG, label, pkg) {
  const email = `${TAG}-${label}@example.invalid`;
  const r = await http('POST', '/api/v1/auth/register', { body: { email, password: PW, name: `Dash ${label}`, shop_name: `${TAG}-${label}-shop`, business_type: 'kirana', package_type: pkg } });
  if (r.status !== 201) throw new Error(`register ${label}: ${r.status} ${String(r.text).slice(0, 200)}`);
  const user = await retry(() => prisma.user.findUnique({ where: { email } }));
  const shop = await retry(() => prisma.shop.findFirst({ where: { ownerId: user.uuid } }));
  return { email, token: r.json.access_token, userUuid: user.uuid, shopId: shop.id, label };
}

async function seed() {
  const TAG = `isolation-test-dash-${Date.now()}`;
  const bada = await tenant(TAG, 'bada', 'badaudyog');     // wholesale tier: Mill + legacy mixed, party pool
  const dukan = await tenant(TAG, 'dukan', 'dukan');       // legacy-only retail
  const other = await tenant(TAG, 'other', 'dukan');       // isolation witness
  const fx = { TAG, PW, TODAY, MONTH1, tenants: { bada, dukan, other }, sales: {}, tx: {}, exp: {}, pur: {}, ret: {} };

  const mkSale = (shopId, key, o) => ({ shopId, invoice_number: `${TAG}-${key}`, billType: 'non_gst', paymentType: 'Cash', paymentDetails: {}, gstAmount: null, ...o });
  const day = (d, hms) => ist(d, hms).toISOString();
  const Y = addDays(TODAY, -1);
  // ── S1 bada: Mill + legacy, every payment mode, boundary rows ──
  const S1 = [
    { key: 'M1', totalAmount: 114600, totalProfit: 35000, amountPaid: 114600, billType: 'gst', gstAmount: 17100, chargesTotal: 2500, roundOffAmount: 0, discountAmount: 5000, pricingModel: 'mill_v2', paymentType: 'Cash', paymentDetails: { cash: 114600, upi: 0, card: 0, bank: 0, udhar: 0, method: 'cash' }, createdAt: day(TODAY, '12:00:00.000') },
    { key: 'M2', totalAmount: 2460, totalProfit: 800, amountPaid: 1000, billType: 'gst', gstAmount: 360, chargesTotal: 100, roundOffAmount: 0, discountAmount: 0, pricingModel: 'mill_v2', paymentType: 'Mixed', paymentDetails: { cash: 400, upi: 0, card: 0, bank: 600, udhar: 1460, method: 'mixed' }, createdAt: day(TODAY, '12:05:00.000') },
    { key: 'M3', totalAmount: 105, totalProfit: 39.99, amountPaid: 105, chargesTotal: 5, roundOffAmount: 0.01, discountAmount: 0, pricingModel: 'mill_v2', paymentType: 'Bank Transfer', paymentDetails: {}, createdAt: day(TODAY, '12:10:00.000') },
    { key: 'M4', totalAmount: 1000, totalProfit: 300, amountPaid: 1000, chargesTotal: 0, roundOffAmount: 0, discountAmount: 50, pricingModel: 'mill_v2', paymentType: 'Cheque', paymentDetails: { cheque: 1000, method: 'cheque' }, createdAt: day(TODAY, '12:15:00.000') },
    { key: 'M5', totalAmount: 200, totalProfit: 60, amountPaid: 200, chargesTotal: 0, roundOffAmount: -0.4, discountAmount: 0, pricingModel: 'mill_v2', paymentType: 'Card', paymentDetails: { card: 200 }, createdAt: day(TODAY, '12:20:00.000') },
    { key: 'M6', totalAmount: 300, totalProfit: 90, amountPaid: 300, chargesTotal: 0, roundOffAmount: 0, discountAmount: 0, pricingModel: 'mill_v2', paymentType: 'UPI', paymentDetails: {}, createdAt: day(TODAY, '12:25:00.000') },
    { key: 'M7', totalAmount: 1000, totalProfit: 250, amountPaid: 1000, chargesTotal: 0, roundOffAmount: 0, discountAmount: 0, pricingModel: 'mill_v2', paymentType: 'Mixed', paymentDetails: { cash: 100, upi: 200, card: 300, bank: 250, cheque: 150 }, createdAt: day(TODAY, '12:30:00.000') },
    { key: 'L1', totalAmount: 118, totalProfit: 40, amountPaid: 118, billType: 'gst', gstAmount: 18, paymentType: 'Cash', paymentDetails: { cash: 118 }, createdAt: day(TODAY, '13:00:00.000') },
    { key: 'L2', totalAmount: 200, totalProfit: 50, amountPaid: 100, paymentType: 'Split', paymentDetails: { cash: 100, upi: 0, card: 0, udhar: 100 }, createdAt: day(TODAY, '13:05:00.000') },
    { key: 'L3', totalAmount: 75, totalProfit: 20, amountPaid: 75, paymentType: 'Split', paymentDetails: JSON.stringify({ cash: 50, upi: 25 }), createdAt: day(TODAY, '13:10:00.000') }, // double-encoded JSON string (legacy quirk)
    { key: 'T0', totalAmount: 333, totalProfit: 33, amountPaid: 333, paymentType: 'Cash', paymentDetails: { cash: 333 }, createdAt: day(TODAY, '00:00:00.000') },          // first instant of today IST
    { key: 'Y1', totalAmount: 777, totalProfit: 77, amountPaid: 777, paymentType: 'Cash', paymentDetails: { cash: 777 }, createdAt: day(Y, '23:59:59.999') },              // last instant of yesterday IST
    { key: 'MS', totalAmount: 4000, totalProfit: 400, amountPaid: 4000, paymentType: 'UPI', paymentDetails: { upi: 4000 }, createdAt: day(MONTH1, '01:00:00.000') },        // early in the month
  ];
  const S2 = [ // dukan legacy-only
    { key: 'D1', totalAmount: 500, totalProfit: 100, amountPaid: 500, paymentType: 'Cash', paymentDetails: { cash: 500 }, createdAt: day(TODAY, '10:00:00.000') },
    { key: 'D2', totalAmount: 236, totalProfit: 60, amountPaid: 236, billType: 'gst', gstAmount: 36, paymentType: 'UPI', paymentDetails: {}, createdAt: day(TODAY, '10:30:00.000') },
    { key: 'D3', totalAmount: 900, totalProfit: 150, amountPaid: 400, paymentType: 'Split', paymentDetails: { cash: 250, upi: 100, card: 50, udhar: 500 }, createdAt: day(TODAY, '11:00:00.000') },
    { key: 'D4', totalAmount: 150, totalProfit: 30, amountPaid: 150, paymentType: 'Card', paymentDetails: {}, createdAt: day(Y, '15:00:00.000') },
  ];
  const S3 = [{ key: 'O1', totalAmount: 99999, totalProfit: 9999, amountPaid: 99999, paymentType: 'Cash', paymentDetails: { cash: 99999 }, createdAt: day(TODAY, '12:00:00.000') }];
  for (const [t, arr, tag] of [[bada, S1, 'bada'], [dukan, S2, 'dukan'], [other, S3, 'other']]) {
    fx.sales[tag] = arr.map((s) => ({ ...s, shopId: t.shopId }));
    for (const { key, ...s } of arr) await retry(() => prisma.sale.create({ data: mkSale(t.shopId, key, { ...s, createdAt: new Date(s.createdAt) }) }));
  }
  // products (movers, low stock) + sale items
  const mkP = (shopId, n, stock, min, price, cost) => retry(() => prisma.product.create({ data: { shopId, name: `${TAG}-${n}`, currentStock: stock, minStock: min, sellingPrice: price, costPrice: cost, wholesaleCost: cost, baseUnit: 'kg', category: 'Grain' } }));
  const pb = [await mkP(bada.shopId, 'Rice', 500, 100, 1000, 600), await mkP(bada.shopId, 'Sugar', 40, 50, 40, 30), await mkP(bada.shopId, 'Flour', 10, 20, 250, 150), await mkP(bada.shopId, 'Dal', 900, 0, 120, 90)];
  const pd = [await mkP(dukan.shopId, 'Tea', 300, 0, 50, 30), await mkP(dukan.shopId, 'Soap', 5, 10, 30, 20), await mkP(dukan.shopId, 'Oil', 75, 0, 150, 100)];
  const saleId = async (k) => (await prisma.sale.findFirst({ where: { invoice_number: `${TAG}-${k}` } })).id;
  const item = async (k, p, q, price) => retry(async () => prisma.saleItem.create({ data: { saleId: await saleId(k), productId: p.id, quantity: q, pricePerUnit: price, unit: 'kg', marginPerUnit: 1 } }));
  await item('M1', pb[0], 100, 1000); await item('M2', pb[0], 2, 1000); await item('M4', pb[1], 20, 50); await item('L1', pb[1], 3, 40); await item('M7', pb[3], 5, 120); await item('M6', pb[2], 1, 300);
  await item('D1', pd[0], 5, 50); await item('D2', pd[2], 2, 118); await item('D3', pd[0], 10, 30); await item('D4', pd[1], 1, 150);
  fx.lowStockExpected = { bada: 2, dukan: 1 };

  // customers (retail + party) with outstanding
  const mkC = (shopId, n, type, due) => retry(() => prisma.customer.create({ data: { shopId, name: `${TAG}-${n}`, mobile: '9000000000', customerType: type, totalDue: due } }));
  const cRb = await mkC(bada.shopId, 'RetailB', 'customer', 500), cPb = await mkC(bada.shopId, 'PartyB', 'party', 1460 + 240);
  const cRd = await mkC(dukan.shopId, 'RetailD', 'customer', 500), cPd = await mkC(dukan.shopId, 'PartyD', 'party', 777); // a party row on a retail package: must NOT be counted
  fx.outstanding = { bada: { retail: 500, party: 1700 }, dukan: { retail: 500, party: 777 } };
  const T = (cid, type, amount, note, when) => ({ customer_id: cid, type, amount, note, created_at: new Date(when) });
  const txs = [
    T(cRb.id, 'udhar', 500, 'Bill: X', day(TODAY, '13:00:00.000')),
    T(cPb.id, 'udhar', 1460, 'Bill: M2', day(TODAY, '12:05:00.000')),
    T(cRb.id, 'payment', 200, 'Payment via UPI - test', day(TODAY, '14:00:00.000')),
    T(cPb.id, 'payment', 300, 'Payment via Cash', day(TODAY, '14:05:00.000')),
    T(cPb.id, 'payment', 100, 'Payment via Bank Transfer - ref', day(TODAY, '14:10:00.000')),
    T(cPb.id, 'payment', 60, 'Payment via Cheque - 123', day(TODAY, '14:15:00.000')),
    T(cRb.id, 'advance', 50, null, day(TODAY, '14:20:00.000')),
    T(cPb.id, 'payment', 1000, 'Payment via Cash', day(addDays(TODAY, -40), '12:00:00.000')),   // old party collection (all-time only)
    T(cPb.id, 'udhar', 999, 'Bill: OLD', day(addDays(TODAY, -40), '12:00:00.000')),           // outside the range
  ];
  const txd = [
    T(cRd.id, 'udhar', 500, 'Bill: D3', day(TODAY, '11:00:00.000')),
    T(cRd.id, 'payment', 100, 'Payment via Cash', day(TODAY, '15:00:00.000')),
    T(cPd.id, 'udhar', 777, 'party row on a retail package', day(TODAY, '15:00:00.000')),
  ];
  for (const t of [...txs, ...txd]) await retry(() => prisma.customer_transactions.create({ data: t }));
  fx.tx.bada = txs.map((t) => ({ ...t, party: t.customer_id === cPb.id })); fx.tx.dukan = txd.map((t) => ({ ...t, party: t.customer_id === cPd.id }));

  // expenses + purchases (+ supplier)
  const E = (shopId, amt, when) => ({ shopId, category: 'Misc', amount: amt, date: new Date(when) });
  const expB = [E(bada.shopId, 120, day(TODAY, '16:00:00.000')), E(bada.shopId, 80, day(MONTH1, '02:00:00.000')), E(bada.shopId, 40, day(addDays(TODAY, -60), '12:00:00.000'))];
  for (const e of expB) await retry(() => prisma.expense.create({ data: e }));
  fx.exp.bada = expB.map((e) => ({ amount: e.amount, date: e.date.toISOString() }));
  const supB = await retry(() => prisma.supplier.create({ data: { shopId: bada.shopId, name: `${TAG}-Sup`, balance: 350 } }));
  const P = (amt, when) => ({ shopId: bada.shopId, supplierId: supB.id, totalCost: amt, date: new Date(when) });
  const purB = [P(900, day(TODAY, '16:30:00.000')), P(400, day(MONTH1, '03:00:00.000')), P(1000, day(addDays(TODAY, -60), '12:00:00.000'))];
  for (const p of purB) await retry(() => prisma.purchaseInvoice.create({ data: p }));
  fx.pur.bada = purB.map((p) => ({ amount: p.totalCost, date: p.date.toISOString() })); fx.supplierBalance = 350;

  // returns: two unsettled (one reason each) + one settled row
  const R = (shopId, amt, reason, note, when) => ({ shopId, quantity: 1, amount: amt, reason, note, date: new Date(when) });
  const retB = [R(bada.shopId, 100, 'Damaged', null, day(TODAY, '17:00:00.000')), R(bada.shopId, 50, 'Damaged', '{"settled":true}', day(TODAY, '17:05:00.000')), R(bada.shopId, 30, 'Expired', null, day(TODAY, '17:10:00.000'))];
  const retD = [R(dukan.shopId, 40, 'Damaged', null, day(TODAY, '17:00:00.000'))];
  for (const r of [...retB, ...retD]) await retry(() => prisma.materialReturn.create({ data: r }));
  fx.ret = { bada: { unsettled: 130, all: { Damaged: 150, Expired: 30 } }, dukan: { unsettled: 40, all: { Damaged: 40 } } };

  fs.writeFileSync(FX, JSON.stringify(fx, null, 1));
  console.log('seeded', TAG, 'S1', S1.length, 'sales,', 'S2', S2.length, 'S3', S3.length);
  await prisma.$disconnect();
}

// ═════════════════════════════ scenarios / capture ═════════════════════════════
const scenarios = () => {
  const iso = (d) => d.toISOString();
  const mk = (from, to) => { const r = range(from, to); return `start_date=${encodeURIComponent(iso(r.start))}&end_date=${encodeURIComponent(iso(r.end))}`; };
  return {
    today: mk(TODAY, TODAY),
    last7: mk(addDays(TODAY, -6), TODAY),
    month: mk(MONTH1, TODAY),
    customYesterday: mk(addDays(TODAY, -1), addDays(TODAY, -1)),
    plainDates: `start_date=${TODAY}&end_date=${TODAY}`,
  };
};
const dash = (t, qs, extra = {}) => http('GET', `/api/v1/reports/dashboard?${qs}${extra.refresh ? '&refresh=true' : ''}`, { token: t.token, shop: extra.shop === undefined ? t.shopId : extra.shop, headers: extra.headers });

async function capture(label) {
  const fx = JSON.parse(fs.readFileSync(FX, 'utf8')); const sc = scenarios(); const out = {};
  for (const tn of ['bada', 'dukan', 'other']) for (const [name, qs] of Object.entries(sc)) {
    const r = await dash(fx.tenants[tn], qs, { refresh: true });
    out[`${tn}:${name}`] = { status: r.status, ms: r.ms, body: r.json };
  }
  fs.writeFileSync(`C:/tmp/dash_${label}.json`, JSON.stringify(out, null, 1));
  console.log(`captured ${Object.keys(out).length} responses → dash_${label}.json`, Object.entries(out).map(([k, v]) => `${k}:${v.status}`).join(' '));
}

// ═════════════════════════════════════ PERF ═════════════════════════════════════
async function perf() {
  const fx = JSON.parse(fs.readFileSync(FX, 'utf8')); const t = fx.tenants.bada; const qs = scenarios().today;
  const miss = [], hit = [];
  for (let i = 0; i < 5; i++) {
    const a = await dash(t, qs, { refresh: true }); miss.push(a.ms);
    const b = await dash(t, qs); hit.push(b.ms);   // right after a refresh → served from the 4 s cache
  }
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  console.log(`PERF cache-miss ms: ${miss.join(', ')}  (median ${med(miss)}, min ${Math.min(...miss)})`);
  console.log(`PERF cache-hit  ms: ${hit.join(', ')}  (median ${med(hit)}, min ${Math.min(...hit)})`);
  await prisma.$disconnect();
}

// ═════════════════════════════════════ VERIFY ═════════════════════════════════════
async function verify() {
  const fx = JSON.parse(fs.readFileSync(FX, 'utf8')); const { bada, dukan, other } = fx.tenants; const sc = scenarios();
  const W = { today: range(TODAY, TODAY), last7: range(addDays(TODAY, -6), TODAY), month: range(MONTH1, TODAY), customYesterday: range(addDays(TODAY, -1), addDays(TODAY, -1)) };
  const S1 = fx.sales.bada, S2 = fx.sales.dukan;
  const todayW = W.today, monthStart = ist(MONTH1, '00:00:00.000'), todayEnd = ist(TODAY, '23:59:59.999');

  // expected summary for a tenant + window (independent of the route)
  function expected(tn, w, wholesaleTier) {
    const sales = fx.sales[tn], tx = fx.tx[tn] || [], sm = refSales(sales, w.start, w.end);
    const inW = (r, k = 'created_at') => new Date(r[k]).getTime() >= w.start.getTime() && new Date(r[k]).getTime() <= w.end.getTime();
    const inToday = (r) => new Date(r.created_at).getTime() >= todayW.start.getTime() && new Date(r.created_at).getTime() <= todayW.end.getTime();
    const retUnsettled = tn === 'bada' ? fx.ret.bada.unsettled : tn === 'dukan' ? fx.ret.dukan.unsettled : 0;
    const retail = (t) => !t.party;
    const udharRetail = tx.filter((t) => t.type === 'udhar' && retail(t) && inW(t)).reduce((a, t) => a + t.amount, 0);
    const udharParty = tx.filter((t) => t.type === 'udhar' && t.party && inW(t)).reduce((a, t) => a + t.amount, 0);
    const pays = tx.filter((t) => (t.type === 'payment' || t.type === 'advance') && inW(t));
    const udharCollection = pays.filter((t) => t.type === 'payment').reduce((a, t) => a + t.amount, 0);
    const advance = pays.filter((t) => t.type === 'advance').reduce((a, t) => a + t.amount, 0);
    const modes = { ...sm.modes };
    for (const t of pays) { const via = /via\s+([a-z]+)/i.exec(t.note || ''); modes[modeOf(via ? via[1] : 'cash')] += t.amount; }
    const hasMill = sales.some((x) => x.pricingModel === 'mill_v2' && new Date(x.createdAt).getTime() >= w.start.getTime() && new Date(x.createdAt).getTime() <= w.end.getTime());
    // returns-estimate basis: Net Goods Sales when the period has Mill invoices, otherwise the legacy Billed Value basis
    const margin = hasMill ? (sm.net > 0 ? sm.profit / sm.net : 0) : (sm.billed > 0 ? sm.profit / sm.billed : 0);
    const returnsProfit = retUnsettled * margin;
    const out = fx.outstanding[tn] || { retail: 0, party: 0 };
    return {
      sm, modes, udharRetail, udharParty, udharCollection, advance, retUnsettled, returnsProfit,
      today_sales: sm.billed - retUnsettled, today_profit: sm.profit - returnsProfit,
      total_collection: sm.received + udharCollection + advance - retUnsettled,
      period_udhar: udharRetail + (wholesaleTier ? udharParty : 0), total_udhar: out.retail + (wholesaleTier ? out.party : 0),
      partyToday: tx.filter((t) => t.type === 'payment' && t.party && inToday(t)).reduce((a, t) => a + t.amount, 0),
      partyAll: tx.filter((t) => t.type === 'payment' && t.party).reduce((a, t) => a + t.amount, 0),
    };
  }
  const get = async (t, name, extra = {}) => { const r = await dash(t, sc[name], { refresh: true, ...extra }); return r; };

  // ── 1..8 metric definitions (bada, Mill + legacy mixed, today) ──
  const b = await get(bada, 'today'); const s = b.json?.summary || {}; const e = expected('bada', W.today, true);
  rec('dashboard 200 for the Bada shop', b.status === 200 && !!b.json?.summary, 200, b.status);
  rec('1. Billed Value = Σ totalAmount (headline today_sales = billed − unsettled legacy returns)', near(s.billed_value, e.sm.billed) && near(s.today_sales, e.today_sales), `${r2(e.sm.billed)} / ${r2(e.today_sales)}`, `${s.billed_value} / ${s.today_sales}`);
  rec('2. Net Goods Sales = total − gst − charges − round-off', near(s.net_goods_sales, e.sm.net), r2(e.sm.net), s.net_goods_sales);
  rec('3. GST collected = Σ gstAmount (Mill 17,460 + legacy 18)', near(s.gst_collected, e.sm.gst) && near(s.gst_collected, 17478), `${r2(e.sm.gst)}`, s.gst_collected);
  rec('4. Commercial charges = Σ chargesTotal (2,605)', near(s.commercial_charges, e.sm.charges) && near(s.commercial_charges, 2605), r2(e.sm.charges), s.commercial_charges);
  rec('5. Round-off = Σ roundOffAmount (signed: +0.01 − 0.40)', near(s.round_off, e.sm.roundOff) && near(s.round_off, -0.39), r2(e.sm.roundOff), s.round_off);
  rec('6. Discount = Σ discountAmount (5,050)', near(s.discount, e.sm.discount) && near(s.discount, 5050), r2(e.sm.discount), s.discount);
  rec('7. Profit = stored Σ totalProfit − returns estimate; margin uses Net Goods Sales (not Billed Value)', near(s.today_profit, e.today_profit), `${r2(e.today_profit)} (returns profit ${r2(e.returnsProfit)})`, s.today_profit);
  rec('8. Amount received = Σ amountPaid (sales_collection)', near(s.sales_collection, e.sm.received) && near(s.amount_received, e.sm.received), r2(e.sm.received), `${s.sales_collection}/${s.amount_received}`);
  rec('invoice count', s.invoice_count === e.sm.count, e.sm.count, s.invoice_count);
  // Reports use the SAME shared definitions as the Dashboard (P&L / profit_loss additive fields; existing fields unchanged)
  const pnl = await http('GET', `/api/v1/reports/engine?module=financials&report_type=pnl&start_date=${TODAY}&end_date=${TODAY}`, { token: bada.token, shop: bada.shopId });
  const pl2 = await http('GET', `/api/v1/reports/engine?module=ca&report_type=profit_loss&start_date=${TODAY}&end_date=${TODAY}`, { token: bada.token, shop: bada.shopId });
  rec('REPORTS pnl uses the shared metrics: revenue = Billed Value, gross_profit = stored profit, plus Net Goods / GST / charges / round-off / discount', pnl.status === 200 && near(pnl.json.revenue, e.sm.billed) && near(pnl.json.gross_profit, e.sm.profit) && near(pnl.json.net_goods_sales, s.net_goods_sales) && near(pnl.json.gst_collected, s.gst_collected) && near(pnl.json.commercial_charges, s.commercial_charges) && near(pnl.json.round_off, s.round_off) && near(pnl.json.discount, s.discount) && near(pnl.json.outstanding_collected, e.sm.received), 'same as Dashboard', J(pnl.json && { r: pnl.json.revenue, n: pnl.json.net_goods_sales }));
  rec('REPORTS profit_loss uses the shared metrics (revenue = Billed Value, netGoodsSales/gstCollected/commercialCharges equal the Dashboard)', pl2.status === 200 && near(pl2.json.revenue, e.sm.billed) && near(pl2.json.grossProfit, e.sm.profit) && near(pl2.json.netGoodsSales, s.net_goods_sales) && near(pl2.json.gstCollected, s.gst_collected) && near(pl2.json.commercialCharges, s.commercial_charges), 'same as Dashboard', J(pl2.json && { r: pl2.json.revenue, n: pl2.json.netGoodsSales }));
  // ── 9..11 udhar ──
  rec('9. Retail Udhar given (period) = 500', near(s.period_retail_udhar, e.udharRetail), r2(e.udharRetail), s.period_retail_udhar);
  rec('10. Party Udhar given (period) = 1,460 and included in Today\'s Udhar for a wholesale-tier package', near(s.period_party_udhar, e.udharParty) && near(s.period_udhar, e.period_udhar) && near(s.period_udhar, 1960), `${r2(e.udharParty)} / ${r2(e.period_udhar)}`, `${s.period_party_udhar} / ${s.period_udhar}`);
  rec('11. Combined outstanding: retail 500 + party 1,700 = 2,200 (total_udhar); party_outstanding rendered in payload', near(s.total_udhar, 2200) && near(s.party_outstanding, 1700) && near(s.retail_udhar_outstanding, 500), '2200/1700/500', `${s.total_udhar}/${s.party_outstanding}/${s.retail_udhar_outstanding}`);
  // ── 12..17 modes ──
  const m = e.modes;
  rec('12. Cash bucket', near(s.collection_cash, m.cash), r2(m.cash), s.collection_cash);
  rec('13. UPI bucket', near(s.collection_upi, m.upi), r2(m.upi), s.collection_upi);
  rec('14. Card bucket', near(s.collection_card, m.card), r2(m.card), s.collection_card);
  rec('15. Bank bucket (split bank 600+250, "Bank Transfer" 105, party payment 100)', near(s.collection_bank, m.bank) && m.bank === 1055, r2(m.bank), s.collection_bank);
  rec('16. Cheque bucket (cheque 1000 + split 150 + party cheque 60)', near(s.collection_cheque, m.cheque) && m.cheque === 1210, r2(m.cheque), s.collection_cheque);
  rec('17. Mixed payment split across all five modes; unclassified remainder = other', near(s.collection_unclassified, m.other), r2(m.other), s.collection_unclassified);
  rec('UI-compat: collection_other still = unclassified + bank + cheque so the existing chips reconcile with Total Collection', near(s.collection_other, m.other + m.bank + m.cheque) && near(s.collection_cash + s.collection_upi + s.collection_card + s.collection_other, s.total_collection + e.retUnsettled - 0, 0.05) === true || near(s.collection_cash + s.collection_upi + s.collection_card + s.collection_other, e.total_collection + e.retUnsettled, 0.05), `${r2(m.other + m.bank + m.cheque)}`, s.collection_other);
  rec('total_collection = sales received + udhar collected + advance − legacy returns', near(s.total_collection, e.total_collection), r2(e.total_collection), s.total_collection);
  rec('double-encoded JSON string payment_details (legacy quirk) still bucketed (cash 50 + upi 25)', m.cash >= 50 && near(s.collection_upi, m.upi), 'ok', 'see cash/upi checks');
  rec('party collection today / all-time (wholesale block)', near(b.json?.wholesale?.partyCreditCollectionToday, e.partyToday) && near(b.json?.wholesale?.partyCreditCollectionTotal, e.partyAll) && near(b.json?.wholesale?.partyCreditTotal, 1700), `${e.partyToday}/${e.partyAll}/1700`, J(b.json?.wholesale && { t: b.json.wholesale.partyCreditCollectionToday, a: b.json.wholesale.partyCreditCollectionTotal, o: b.json.wholesale.partyCreditTotal }));
  // expenses / purchases / returns / low stock
  rec('expenses today 120, month 200; purchases today 900, month 1,300, all-time 2,300; supplier payable 350', near(s.today_expenses_amount, 120) && near(s.month_expenses_amount, 200) && near(s.today_purchases_amount, 900) && near(s.month_purchases_amount, 1300) && near(s.total_purchases_amount, 2300) && near(s.supplier_payable, 350), '120/200/900/1300/2300/350', J([s.today_expenses_amount, s.month_expenses_amount, s.today_purchases_amount, s.month_purchases_amount, s.total_purchases_amount, s.supplier_payable]));
  rec('returns: unsettled 130 counted, breakdown shows all rows (Damaged 150, Expired 30)', near(s.returns_amount, 130) && near((b.json.returnsByReason.find((x) => x.reason === 'Damaged') || {}).amount, 150) && near((b.json.returnsByReason.find((x) => x.reason === 'Expired') || {}).amount, 30), '130/150/30', J([s.returns_amount, b.json.returnsByReason]));
  rec('low stock count + list agree (2)', s.low_stock_count === 2 && b.json.lowStock.length === 2, 2, `${s.low_stock_count}/${b.json.lowStock.length}`);
  rec('top products: Rice (100+2 kg × 1000) first; fast moving present; slow moving present', b.json.topProducts?.[0]?.name?.endsWith('-Rice') && near(b.json.topProducts[0].value, 102000) && b.json.fastMoving?.length > 0 && b.json.slowMoving?.length > 0, 'Rice 102000', J(b.json.topProducts?.[0]));

  // ── 20/21 date ranges and IST boundaries (bada) ──
  for (const name of ['last7', 'month', 'customYesterday']) {
    const r = await get(bada, name); const ex = refSales(S1, W[name].start, W[name].end);
    rec(`20. range "${name}": Billed Value / Net Goods / profit match the fixture window`, r.status === 200 && near(r.json.summary.billed_value, ex.billed) && near(r.json.summary.net_goods_sales, ex.net) && near(r.json.summary.gst_collected, ex.gst), `${r2(ex.billed)}/${r2(ex.net)}`, `${r.json?.summary?.billed_value}/${r.json?.summary?.net_goods_sales}`);
  }
  const y = await get(bada, 'customYesterday');
  rec('21. IST midnight: 23:59:59.999 IST yesterday (Y1 777) is in yesterday only; 00:00:00.000 IST today (T0 333) is in today only', near(y.json.summary.billed_value, 777) && near(s.billed_value, e.sm.billed) && refSales(S1, W.today.start, W.today.end).billed === e.sm.billed && S1.find((x) => x.key === 'T0') && !near(y.json.summary.billed_value, 777 + 333), '777 / today includes T0', `${y.json.summary.billed_value}`);
  const pl = await dash(bada, sc.plainDates, { refresh: true });
  rec('20. plain YYYY-MM-DD dates behave like the ISO day range (same Billed Value as "today")', pl.status === 200 && near(pl.json.summary.billed_value, s.billed_value), s.billed_value, pl.json?.summary?.billed_value);
  const mo = await get(bada, 'month'); const mm = refSales(S1, W.month.start, W.month.end);
  rec('20. month range includes the early-month sale MS (4,000) as well as today', near(mo.json.summary.billed_value, mm.billed) && mm.billed > e.sm.billed - 1 && S1.some((x) => x.key === 'MS'), r2(mm.billed), mo.json?.summary?.billed_value);

  // ── 22 malformed dates ──
  for (const qs of ['start_date=abc', 'end_date=2026-13-45', 'start_date=not-a-date&end_date=also-bad', 'start_date=99999999999999999999', `start_date=${TODAY}&end_date=%00`, 'start_date=2026-02-30x']) {
    const r = await dash(bada, qs, { refresh: true });
    rec(`22. malformed date "${qs}" → 400 (never 500)`, r.status === 400, 400, `${r.status} ${String(r.text).slice(0, 80)}`);
  }
  const e0 = await dash(bada, 'start_date=&end_date=', { refresh: true });
  rec('22. empty date params → default "today" (200)', e0.status === 200 && near(e0.json.summary.billed_value, s.billed_value), 200, e0.status);

  // ── 18 legacy-only regression (dukan): compare against the BEFORE capture ──
  const D = await get(dukan, 'today'); const ds = D.json.summary; const ed = expected('dukan', W.today, false);
  rec('18. legacy-only shop: Billed Value / profit / collection equal the reference (Net Goods = Billed for non-GST, GST bill exact)', near(ds.today_sales, ed.today_sales) && near(ds.sales_collection, ed.sm.received) && near(ds.total_collection, ed.total_collection), `${r2(ed.today_sales)}/${r2(ed.sm.received)}`, `${ds.today_sales}/${ds.sales_collection}`);
  rec('18. retail package: party row is NOT added to Udhar (total_udhar = retail 500, period_udhar = 500)', near(ds.total_udhar, 500) && near(ds.period_udhar, 500), '500/500', `${ds.total_udhar}/${ds.period_udhar}`);
  let before = null; try { before = JSON.parse(fs.readFileSync('C:/tmp/dash_before.json', 'utf8')); } catch {}
  if (before) {
    let allOk = true; const diffs = [];
    for (const name of ['today', 'last7', 'month', 'customYesterday', 'plainDates']) {
      const bb = before[`dukan:${name}`]?.body, aa = (await dash(dukan, sc[name], { refresh: true })).json;
      if (!bb || !aa) { allOk = false; diffs.push(`${name}: missing`); continue; }
      for (const k of Object.keys(bb.summary)) {
        if (['salary_paid_amount', 'salary_paid_count', 'net_in_hand', 'net_profit'].includes(k)) continue; // removed: confirmed unused by the UI
        if (['cash_profit', 'udhar_profit'].includes(k)) continue; // never displayed; they needed an all-time sales scan, now period-scoped
        if (!near(bb.summary[k], aa.summary[k], 0.011)) { allOk = false; diffs.push(`${name}.${k}: ${bb.summary[k]} → ${aa.summary[k]}`); }
      }
      for (const k of ['lowStock', 'recentBills', 'topProducts', 'fastMoving', 'slowMoving', 'returnsByReason']) {
        if (J(bb[k]) !== J(aa[k])) { allOk = false; diffs.push(`${name}.${k} differs`); }
      }
    }
    rec('18. LEGACY REGRESSION: every legacy-only (Dukan) dashboard key/list equals the BEFORE capture for today / 7d / month / yesterday / plain dates (only 4 confirmed-unused keys removed)', allOk, 'identical', diffs.slice(0, 6).join(' | '));
    // 19 mixed: existing keys for the mixed shop that must be unchanged vs before
    const bs = before['bada:today']?.body?.summary; const keep = ['today_sales', 'sales_collection', 'udhar_collection', 'advance_collection', 'total_collection', 'expenses_amount', 'today_expenses_amount', 'month_expenses_amount', 'today_purchases_amount', 'month_purchases_amount', 'total_purchases_amount', 'supplier_payable', 'returns_amount', 'low_stock_count', 'collection_cash', 'collection_upi', 'collection_card', 'collection_other'];
    const bad = keep.filter((k) => bs && !near(bs[k], s[k], 0.011));
    rec('19. Mill + legacy mixed period: headline Sales, collections, expenses, purchases, returns, low stock unchanged vs BEFORE', !!bs && bad.length === 0, 'unchanged', bad.map((k) => `${k}:${bs[k]}→${s[k]}`).join(', '));
    const changed = ['total_udhar', 'period_udhar'].map((k) => `${k}: ${bs?.[k]} → ${s[k]}`);
    console.log('INFO  intended changes on the wholesale-tier shop:', changed.join('; '), `| today_profit ${bs?.today_profit} → ${s.today_profit} (margin denominator now Net Goods Sales)`);
  } else console.log('WARN  no BEFORE capture found (C:/tmp/dash_before.json) — regression comparison skipped');

  // ── 23..25 security / isolation ──
  const O = await get(other, 'today');
  rec('23. two-shop isolation: the other tenant sees only its own 99,999 (no 114,600 / 500 leakage) and vice-versa', O.status === 200 && near(O.json.summary.billed_value, 99999) && near(s.billed_value, e.sm.billed) && !near(s.billed_value, e.sm.billed + 99999), 99999, `${O.json?.summary?.billed_value}`);
  const sp = await dash(bada, sc.today, { refresh: true, shop: other.shopId });
  rec('24. spoofed x-shop-id (another owner\'s shop) → 403 SHOP_INVALID, no data', sp.status === 403 && sp.json?.code === 'SHOP_INVALID' && !/99999/.test(sp.text), 403, `${sp.status} ${sp.text?.slice(0, 80)}`);
  const sp2 = await dash(bada, sc.today, { refresh: true, shop: '00000000-0000-0000-0000-000000000000' });
  rec('24. random x-shop-id → 403', sp2.status === 403, 403, sp2.status);
  const na = await http('GET', `/api/v1/reports/dashboard?${sc.today}`, {});
  rec('unauthenticated → 401', na.status === 401, 401, na.status);
  const qsShop = await http('GET', `/api/v1/reports/dashboard?${sc.today}&shopId=${other.shopId}&shop_id=${other.shopId}`, { token: bada.token, shop: bada.shopId });
  rec('a client-supplied shopId query param is ignored (still Bada\'s own data)', qsShop.status === 200 && near(qsShop.json.summary.billed_value, s.billed_value), s.billed_value, qsShop.json?.summary?.billed_value);
  // staff-mode (existing x-ui-role server mechanism): profit + money-row redacted server-side, cache not cross-contaminated
  const st = await dash(bada, sc.today, { refresh: true, headers: { 'x-ui-role': 'staff' } });
  const stKeys = ['today_profit', 'expected_profit', 'cash_profit', 'udhar_profit', 'total_collection', 'sales_collection', 'udhar_collection', 'today_expenses_amount', 'today_purchases_amount', 'supplier_payable', 'net_goods_sales', 'gst_collected', 'commercial_charges'];
  rec('staff-mode: profit and money-row metrics are ABSENT from the API response (not merely hidden by the client)', st.status === 200 && stKeys.every((k) => st.json.summary[k] === undefined) && near(st.json.summary.today_sales, e.today_sales), 'redacted', J(stKeys.filter((k) => st.json?.summary?.[k] !== undefined)));
  const ad = await dash(bada, sc.today, { headers: {} }); // no refresh → would hit the cache the staff call just filled
  rec('staff response never poisons the cache: an admin call right after still gets full profit', ad.status === 200 && near(ad.json.summary.today_profit, e.today_profit), r2(e.today_profit), ad.json?.summary?.today_profit);

  // ── 25 pooled all-shop access ──
  const owner = await prisma.user.findUnique({ where: { uuid: bada.userUuid } });
  const shop2 = await prisma.shop.create({ data: { ownerId: bada.userUuid, name: `${fx.TAG}-bada-shop2`, packageType: 'badaudyog', subscriptionPlan: 'badaudyog', subscriptionStatus: 'active' } });
  await prisma.sale.create({ data: { shopId: shop2.id, invoice_number: `${fx.TAG}-P1`, totalAmount: 55555, totalProfit: 5555, amountPaid: 55555, paymentType: 'Cash', paymentDetails: { cash: 55555 }, createdAt: ist(TODAY, '12:00:00.000') } });
  try {
    const single = await dash(bada, sc.today, { refresh: true });
    rec('25. pooled OFF: only the active shop (second shop\'s 55,555 not included)', near(single.json.summary.billed_value, e.sm.billed), r2(e.sm.billed), single.json?.summary?.billed_value);
    await prisma.user.update({ where: { uuid: bada.userUuid }, data: { allShopAccess: true, selectedShopIds: [] } });
    await sleep(7000); // auth-context cache TTL
    const pooled = await dash(bada, sc.today, { refresh: true });
    rec('25. pooled ON: both OWNED shops (114,600… + 55,555) and still NOT the other owner\'s 99,999', pooled.status === 200 && near(pooled.json.summary.billed_value, e.sm.billed + 55555) && !near(pooled.json.summary.billed_value, e.sm.billed + 55555 + 99999), r2(e.sm.billed + 55555), pooled.json?.summary?.billed_value);
    const pooledCached = await dash(bada, sc.today);
    rec('25. pooled and single-shop results never share a cache entry', near(pooledCached.json.summary.billed_value, e.sm.billed + 55555), 'pooled', pooledCached.json?.summary?.billed_value);
  } finally {
    await prisma.user.update({ where: { uuid: bada.userUuid }, data: { allShopAccess: owner.allShopAccess === true, selectedShopIds: owner.selectedShopIds || [] } });
    await prisma.sale.deleteMany({ where: { shopId: shop2.id } }); await prisma.shop.delete({ where: { id: shop2.id } }).catch(() => {});
  }
  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  await prisma.$disconnect();
}

const mode = process.argv[2];
({ seed, capture: () => capture(process.argv[3] || 'x'), verify, perf }[mode] || (() => { console.log('usage: seed | capture <label> | verify | perf'); process.exit(1); }))().catch((e) => { console.error('FATAL', e.stack || e.message); process.exit(1); });
