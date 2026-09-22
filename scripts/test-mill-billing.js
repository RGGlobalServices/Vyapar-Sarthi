/* eslint-disable */
/**
 * Mill Billing (`mill_v2`) — Phase 1 tests.
 *
 *   node scripts/test-mill-billing.js                       # UNIT tests only (no DB, no server)
 *   LIVE=1 BASE=http://localhost:3001 node scripts/test-mill-billing.js
 *        # + API / concurrency tests. Needs (1) the additive columns pushed to the DB, (2) the dev server started with
 *        #   MILL_V2_ENABLED=true. Uses throwaway isolation-test-mill-* tenants (swept by CLEANUP_ONLY=1 test-isolation).
 */
const path = require('path'), fs = require('fs'), Module = require('module');
const ts = require(path.join(process.cwd(), 'node_modules/typescript'));
const LIVE = process.env.LIVE === '1';
const BASE = process.env.BASE || 'http://localhost:3001';
const results = [];
const rec = (name, ok, exp, act) => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      expected: ${exp}\n      actual:   ${act}`); };
class StubApiError extends Error { constructor(s, m, c) { super(m); this.status = s; this.code = c; } }
function loadTs(rel) {
  const file = path.join(process.cwd(), rel);
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(process.cwd());
  const req = m.require.bind(m);
  m.require = (id) => {
    if (id === '@/lib/server/http') return { ApiError: StubApiError, json: () => null };
    if (id === '@/lib/server/prisma') return { default: {} };
    if (id.startsWith('@/')) return loadTs(id.slice(2) + '.ts');
    return req(id);
  };
  m._compile(out, file); return m.exports;
}
const throwsWith = (fn) => { try { fn(); return null; } catch (e) { return e; } };
const eq = (a, b) => Math.round(a * 100) === Math.round(b * 100);

// ══════════════════════════════ UNIT ══════════════════════════════
function unit() {
  const M = loadTs('lib/millBilling.ts');
  const G = loadTs('lib/server/billingCharges.ts');
  const noCharges = { freight: 0, hamali: 0, loading: 0, unloading: 0, other: 0 };
  const calc = (o) => M.calculateMillInvoice({ lines: [{ quantity: 1, rate: 100, gstRate: 18, costTotal: 60 }], discount: null, billType: 'gst', interState: false, charges: noCharges, ...o });

  // 1. no charges → total is just goods + GST (exclusive)
  let r = calc({});
  rec('mill_v2: ₹100 @18% GST-exclusive → taxable 100, GST 18, total 118', r.taxable === 100 && r.totalGst === 18 && r.grandTotal === 118 && r.roundOff === 0, '100/18/118', `${r.taxable}/${r.totalGst}/${r.grandTotal}`);
  // 2-7. each charge alone, and all together
  for (const [k, v] of [['freight', 2000], ['hamali', 500], ['loading', 300], ['unloading', 150], ['other', 75]]) {
    r = calc({ charges: { ...noCharges, [k]: v } });
    rec(`${k} only: +₹${v}, no GST on it`, eq(r.grandTotal, 118 + v) && r.totalGst === 18 && r.chargesTotal === v, `${118 + v} total, GST 18`, `${r.grandTotal}, GST ${r.totalGst}`);
  }
  // 9/15. the approved worked example
  const big = { lines: [{ quantity: 100, rate: 1000, gstRate: 18, costTotal: 70000 }], discount: { type: 'fixed', value: 5000 }, billType: 'gst', interState: false };
  r = calc({ ...big, charges: { ...noCharges, freight: 2000, hamali: 500 } });
  rec('worked example: ₹1,00,000 − 5,000 = taxable 95,000; GST 17,100; +2,000 +500 → ₹1,14,600', r.goodsSubtotal === 100000 && r.discount === 5000 && r.taxable === 95000 && r.totalGst === 17100 && r.goodsWithGst === 112100 && r.grandTotal === 114600 && r.roundOff === 0, '114600', j({ s: r.goodsSubtotal, d: r.discount, t: r.taxable, g: r.totalGst, gt: r.grandTotal }));
  r = calc({ ...big, charges: { freight: 2000, hamali: 500, loading: 300, unloading: 150, other: 50.37 } });
  rec('all five charges + round-off: pre-round 1,15,100.37 → round-off −0.37 → ₹1,15,100.00', r.preRoundTotal === 115100.37 && r.roundOff === -0.37 && r.grandTotal === 115100, '115100.37 / -0.37 / 115100', `${r.preRoundTotal} / ${r.roundOff} / ${r.grandTotal}`);
  rec('CGST/SGST split of ₹17,100 = 8,550 + 8,550', r.cgst === 8550 && r.sgst === 8550 && r.igst === 0, '8550/8550/0', `${r.cgst}/${r.sgst}/${r.igst}`);
  // 8. discount + charges: discount only on goods
  const noDisc = calc({ lines: big.lines, billType: 'gst', charges: { ...noCharges, freight: 2000 } });
  const withDisc = calc({ ...big, charges: { ...noCharges, freight: 2000 } });
  rec('discount applies to goods only (charges identical with/without discount)', noDisc.chargesTotal === 2000 && withDisc.chargesTotal === 2000 && withDisc.taxable === 95000, 'charges 2000 in both', `${noDisc.chargesTotal}/${withDisc.chargesTotal}`);
  // 10. charges do NOT receive GST
  const a = calc({ ...big, charges: noCharges }), b = calc({ ...big, charges: { freight: 900000, hamali: 0, loading: 0, unloading: 0, other: 0 } });
  rec('charges receive NO GST (GST identical with a ₹9 lakh freight)', a.totalGst === b.totalGst, `${a.totalGst}`, `${b.totalGst}`);
  // 11. round-off rules: nearest ₹1 half-up
  const ro = (rate) => calc({ lines: [{ quantity: 1, rate, gstRate: 0, costTotal: 0 }], billType: 'non_gst' });
  rec('round-off positive (100.60 → 101.00, +0.40)', ro(100.6).grandTotal === 101 && ro(100.6).roundOff === 0.4, '101 / +0.40', `${ro(100.6).grandTotal} / ${ro(100.6).roundOff}`);
  rec('round-off negative (100.40 → 100.00, −0.40)', ro(100.4).grandTotal === 100 && ro(100.4).roundOff === -0.4, '100 / −0.40', `${ro(100.4).grandTotal} / ${ro(100.4).roundOff}`);
  rec('round-off half-up (100.50 → 101.00, +0.50; 100.49 → 100.00)', ro(100.5).grandTotal === 101 && ro(100.5).roundOff === 0.5 && ro(100.49).grandTotal === 100, '101 / +0.50; 100', `${ro(100.5).grandTotal}; ${ro(100.49).grandTotal}`);
  // 21. profit excludes GST + charges
  r = calc({ ...big, charges: { ...noCharges, freight: 2000, hamali: 500 } });
  rec('profit = taxable goods − stored cost (95,000 − 70,000 = 25,000); charges/GST/round-off excluded', r.totalProfit === 25000, '25000', String(r.totalProfit));
  // non-GST
  r = calc({ billType: 'non_gst' });
  rec('non-GST mill bill: no GST, total = rate', r.totalGst === 0 && r.grandTotal === 100 && r.gstBilled === false, '0 / 100', `${r.totalGst}/${r.grandTotal}`);
  // IGST + odd-paise split
  r = calc({ interState: true });
  rec('inter-state: IGST 18, CGST/SGST 0', r.igst === 18 && r.cgst === 0 && r.sgst === 0, 'IGST 18', `${r.igst}/${r.cgst}/${r.sgst}`);
  r = calc({ lines: [{ quantity: 1, rate: 0.7, gstRate: 5, costTotal: 0 }] });
  rec('odd-paise GST split keeps CGST + SGST == GST', eq(r.cgst + r.sgst, r.totalGst), String(r.totalGst), `${r.cgst}+${r.sgst}`);
  // multi-rate groups
  r = calc({ lines: [{ quantity: 1, rate: 100, gstRate: 5, costTotal: 0 }, { quantity: 1, rate: 200, gstRate: 18, costTotal: 0 }] });
  rec('multi-rate: groups 5% (5.00) and 18% (36.00) → GST 41', r.groups.length === 2 && r.totalGst === 41 && r.grandTotal === 341, '41 / 341', `${r.totalGst}/${r.grandTotal}`);
  // percentage discount + cap
  r = calc({ discount: { type: 'percentage', value: 10 } });
  rec('percentage discount 10% of ₹100 → taxable 90', r.discount === 10 && r.taxable === 90, '10 / 90', `${r.discount}/${r.taxable}`);
  r = calc({ discount: { type: 'fixed', value: 500 } });
  rec('discount is capped at the goods subtotal (never negative goods)', r.discount === 100 && r.taxable === 0 && r.grandTotal === 0, '100 / 0', `${r.discount}/${r.taxable}`);
  // discount allocation always sums exactly (fuzz)
  let bad = 0;
  for (let t = 0; t < 400; t++) {
    const n = 1 + Math.floor(Math.random() * 6);
    const lines = Array.from({ length: n }, () => ({ quantity: 1 + Math.floor(Math.random() * 9), rate: Math.round(Math.random() * 9999) / 100, gstRate: [0, 5, 12, 18, 28][Math.floor(Math.random() * 5)], costTotal: 0 }));
    const rr = calc({ lines, discount: { type: 'percentage', value: Math.round(Math.random() * 10000) / 100 } });
    const sumShares = rr.lines.reduce((s, l) => s + l.discountPaise, 0), sumTax = rr.lines.reduce((s, l) => s + l.taxablePaise, 0);
    if (sumShares !== Math.round(rr.discount * 100) || sumTax !== Math.round(rr.taxable * 100) || rr.lines.some((l) => l.taxablePaise < 0)) bad++;
  }
  rec('discount allocation: Σ line shares == discount and no negative line (400 random bills)', bad === 0, '0 bad', String(bad));

  // 12-18. charge validation
  const ch = (raw) => throwsWith(() => M.normalizeMillCharges(raw));
  rec('negative charge rejected', !!ch({ freight: -1 }), 'throws', '');
  rec('NaN charge rejected ("NaN", NaN)', !!ch({ freight: 'NaN' }) && !!ch({ freight: NaN }), 'throws', '');
  rec('Infinity charge rejected', !!ch({ freight: Infinity }) && !!ch({ freight: 'Infinity' }), 'throws', '');
  rec('invalid string / boolean / object charge rejected', !!ch({ freight: 'abc' }) && !!ch({ freight: true }) && !!ch({ freight: {} }), 'throws', '');
  rec('huge charge rejected (> ₹10,00,000)', !!ch({ freight: 1000000.01 }) && !!ch({ freight: 1e12 }), 'throws', '');
  rec('charge of exactly ₹10,00,000 accepted', !ch({ freight: 1000000 }), 'ok', '');
  rec('combined charges > ₹25,00,000 rejected (3 × 9,00,000)', !!ch({ freight: 900000, hamali: 900000, loading: 900000 }), 'throws', '');
  rec('arbitrary charge key rejected', !!ch({ commission: 10 }) && !!ch({ packing: 10 }) && !!ch({ '__proto__x': 1 }), 'throws', '');
  rec('more than 2 decimals rejected (10.005), 2 decimals accepted (10.05)', !!ch({ freight: 10.005 }) && !ch({ freight: 10.05 }), 'throws / ok', '');
  rec('legacy "transport" accepted as input alias → canonical "freight"', M.normalizeMillCharges({ transport: 150 }).freight === 150 && M.normalizeMillCharges({ transport: 150 }).transport === undefined, 'freight=150', '');
  rec('"transport" + "freight" together rejected (ambiguous)', !!ch({ transport: 1, freight: 2 }), 'throws', '');
  rec('blank/absent charges → all zero, canonical five keys', j(M.normalizeMillCharges(undefined)) === j(noCharges) && M.normalizeMillCharges({ hamali: '' }).hamali === 0, 'all 0', '');
  rec('charges as array / string rejected', !!ch([1]) && !!ch('x'), 'throws', '');
  // discount validation
  const dv = (raw) => throwsWith(() => M.normalizeMillDiscount(raw));
  rec('discount: negative / NaN / >100% / bad type rejected', !!dv(-5) && !!dv('abc') && !!dv({ type: 'percentage', value: 101 }) && !!dv({ type: 'weird', value: 1 }), 'throws', '');
  rec('discount: legacy shapes accepted (number, {fixed}, {percent})', !dv(50) && !dv({ type: 'fixed', value: 5 }) && !dv({ type: 'percent', value: 5 }), 'ok', '');

  // GST rate rules (server side)
  const rate = (client, prod, hasProd, bt = 'gst') => throwsWith(() => G.resolveMillLineGstRate(client, prod, hasProd, bt, 'Item 1'));
  rec('GST rate: product rate used when the client sends none', G.resolveMillLineGstRate(undefined, 12, true, 'gst', 'x') === 12, '12', '');
  rec('GST rate: override within slabs accepted (18 over product 12)', G.resolveMillLineGstRate(18, 12, true, 'gst', 'x') === 18, '18', '');
  rec('GST rate: override outside slabs rejected (7%)', !!rate(7, 12, true), 'throws', '');
  rec('GST rate: client rate equal to the product\'s own (3%) accepted', G.resolveMillLineGstRate(3, 3, true, 'gst', 'x') === 3, '3', '');
  rec('GST rate: productless line restricted to slabs (18 ok, 3 rejected)', G.resolveMillLineGstRate(18, null, false, 'gst', 'x') === 18 && !!rate(3, null, false), 'ok / throws', '');
  rec('GST rate: non-GST bill ignores rates entirely', G.resolveMillLineGstRate(999, 5, true, 'non_gst', 'x') === 0, '0', '');
  rec('GST rate: NaN/boolean client rate rejected', !!rate('abc', 5, true) && !!rate(true, 5, true), 'throws', '');
  // interState / bill type
  const gi = (b) => throwsWith(() => G.parseGstInterState(b));
  rec('gstInterState must be a real boolean ("yes"/1/"true" rejected)', !!gi({ gst_inter_state: 'yes' }) && !!gi({ gstInterState: 1 }) && !!gi({ gst_inter_state: 'true' }), 'throws', '');
  rec('gstInterState: true / false / absent accepted', G.parseGstInterState({ gstInterState: true }) === true && G.parseGstInterState({ gst_inter_state: false }) === false && G.parseGstInterState({}) === false, 'ok', '');
  rec('bill_type: only gst / non_gst', G.parseMillBillType('gst') === 'gst' && G.parseMillBillType(undefined) === 'non_gst' && !!throwsWith(() => G.parseMillBillType('inclusive')), 'ok / throws', '');

  // Gate
  const shopOk = { packageType: 'badaudyog' }; // no confirmation field exists any more — the package alone decides
  const save = process.env.MILL_V2_ENABLED;
  delete process.env.MILL_V2_ENABLED;
  let e = throwsWith(() => G.assertMillEligibleShop(shopOk));
  rec('gate: env flag OFF → 403 MILL_NOT_ENABLED', !!e && e.status === 403 && e.code === 'MILL_NOT_ENABLED', '403 MILL_NOT_ENABLED', e && `${e.status} ${e.code}`);
  process.env.MILL_V2_ENABLED = 'true';
  e = throwsWith(() => G.assertMillEligibleShop({ ...shopOk, packageType: 'wholesale' }));
  rec('gate: Wholesale package (also wholesale-tier) → 403 MILL_PACKAGE_NOT_ELIGIBLE', !!e && e.code === 'MILL_PACKAGE_NOT_ELIGIBLE', 'MILL_PACKAGE_NOT_ELIGIBLE', e && e.code);
  e = throwsWith(() => G.assertMillEligibleShop({ ...shopOk, packageType: 'vyapar' }));
  rec('gate: Vyapar/Dukan/Udyog → 403 not eligible', !!e && e.code === 'MILL_PACKAGE_NOT_ELIGIBLE', 'MILL_PACKAGE_NOT_ELIGIBLE', e && e.code);
  rec('gate: Bada Udyog + flag on → allowed with NO activation/confirmation of any kind', !throwsWith(() => G.assertMillEligibleShop(shopOk)), 'ok', '');
  rec('gate: the confirmation/lock machinery is gone (no lockAndVerifyMillConfirmation export, no MILL_NOT_CONFIRMED)', G.lockAndVerifyMillConfirmation === undefined, 'removed', typeof G.lockAndVerifyMillConfirmation);
  if (save === undefined) delete process.env.MILL_V2_ENABLED; else process.env.MILL_V2_ENABLED = save;
  const P = loadTs('lib/config/packageConfig.ts');
  rec('package: isMillBillingPackage is Bada-only; isWholesaleTierPackage unchanged', P.isMillBillingPackage('badaudyog') && !P.isMillBillingPackage('wholesale') && P.isWholesaleTierPackage('wholesale') && P.isWholesaleTierPackage('badaudyog') && !P.isMillBillingPackage(null), 'ok', '');

  // Guards
  const GD = loadTs('lib/server/millGuards.ts');
  rec('edit guard: mill_v2 sale → 409 MILL_V2_EDIT_NOT_SUPPORTED; legacy sale / undefined field untouched', (() => { const x = throwsWith(() => GD.assertSaleEditable({ pricingModel: 'mill_v2' })); return !!x && x.status === 409 && x.code === 'MILL_V2_EDIT_NOT_SUPPORTED' && !throwsWith(() => GD.assertSaleEditable({ pricingModel: null })) && !throwsWith(() => GD.assertSaleEditable({})); })(), 'ok', '');

  // PRINT / PDF / WHATSAPP data (Phase 3): built ONLY from the stored sale, cross-checked against the stored total
  const MI = loadTs('lib/millInvoice.ts');
  const stored = { invoice_number: 'INV-EXACT', bill_type: 'gst', total_amount: 114600, amount_paid: 114600, payment_type: 'Cash', pricing_model: 'mill_v2',
    discount_amount: 5000, charges: { freight: 2000, hamali: 500, loading: 0, unloading: 0, other: 0 }, charges_total: 2500, round_off_amount: 0,
    gst_details: { model: 'mill_v2', interState: false, taxable: 95000, cgst: 8550, sgst: 8550, igst: 0, totalGst: 17100, hsnGroups: [{ rate: 18, hsnCode: '-', taxable: 95000, cgst: 8550, sgst: 8550, igst: 0 }] },
    items: [{ name: 'Rice', unit: 'kg', quantity: 100, price_per_unit: 1000, batch_numbers: ['B-101'] }] };
  const d1 = MI.buildMillInvoiceData(stored, {}, '20 Sep 2026');
  rec('PRINT data: the ₹1,14,600 test invoice → goods 1,00,000 / discount 5,000 / taxable 95,000 / CGST=SGST 8,550 / freight 2,000 / hamali 500 / grand 1,14,600, consistent', d1.consistent && d1.goodsPaise === 10000000 && d1.discountPaise === 500000 && d1.taxablePaise === 9500000 && d1.cgstPaise === 855000 && d1.sgstPaise === 855000 && d1.charges.freight === 200000 && d1.charges.hamali === 50000 && d1.grandPaise === 11460000 && d1.balancePaise === 0, 'ok', j({ c: d1.consistent, p: d1.problems }));
  rec('PRINT data: formatted grand total is exactly ₹1,14,600.00', MI.fmtPaise(d1.grandPaise) === '₹1,14,600.00', '₹1,14,600.00', MI.fmtPaise(d1.grandPaise));
  const d2 = MI.buildMillInvoiceData({ ...stored, total_amount: 114600.01 }, {}, 'x');
  rec('PRINT data: a total that is off by even ₹0.01 from the stored parts is FLAGGED inconsistent (never silently printed)', d2.consistent === false && d2.problems.length > 0, 'inconsistent', j(d2.problems));
  const d3 = MI.buildMillInvoiceData({ invoice_number: 'INV-N', bill_type: 'non_gst', total_amount: 105, amount_paid: 60, payment_type: 'Mixed', pricing_model: 'mill_v2', discount_amount: 0, charges: { freight: 5, hamali: 0, loading: 0, unloading: 0, other: 0 }, charges_total: 5, round_off_amount: 0.01, gst_details: null, items: [{ name: 'Sugar', unit: 'kg', quantity: 3, price_per_unit: 33.33 }] }, {}, 'x');
  rec('PRINT data: non-GST bill derives taxable from the stored total (99.99), +₹0.01 round-off, Udhar ₹45 — consistent', d3.consistent && d3.taxablePaise === 9999 && d3.roundOffPaise === 1 && d3.balancePaise === 4500 && !d3.gstBilled, 'ok', j({ c: d3.consistent, p: d3.problems }));
  const wa = MI.millWhatsAppText(d1);
  rec('WHATSAPP text: states rates are exclusive of GST, lists charges separately, and carries the stored Grand Total', /exclusive of GST/.test(wa) && /Freight: ₹2,000\.00/.test(wa) && /Grand Total: ₹1,14,600\.00/.test(wa) && !/inclusive/i.test(wa), 'ok', wa.slice(0, 80));
  rec('isMillInvoice(): only pricing_model "mill_v2"', MI.isMillInvoice(stored) && !MI.isMillInvoice({ pricing_model: null }) && !MI.isMillInvoice({}), 'ok', '');

  // LEGACY GOLDEN — the inclusive engines must be byte-for-byte what they were
  const FE = loadTs('lib/financialEngine.ts');
  const lg = FE.calculateInvoice([{ quantity: 1, sellingPrice: 100, purchasePrice: 60, gstPercent: 18 }], 0, 'gst');
  rec('LEGACY golden: ₹100 @18% GST bill is INCLUSIVE → taxable 84.75, GST 15.25, total 100', lg.discountedSubtotal === 100 && lg.totalGst === 15.25 && lg.items[0].taxableAmount === 84.75, '100 / 15.25 / 84.75', `${lg.discountedSubtotal}/${lg.totalGst}/${lg.items[0].taxableAmount}`);
  const lgN = FE.calculateInvoice([{ quantity: 1, sellingPrice: 100, purchasePrice: 60, gstPercent: 18 }], 0, 'non_gst');
  rec('LEGACY golden: non-GST bill total 100, no tax split', lgN.discountedSubtotal === 100 && lgN.totalGst === 0, '100 / 0', `${lgN.discountedSubtotal}/${lgN.totalGst}`);
  const CG = loadTs('lib/gst.ts').computeGst([{ total: 100, gstPercent: 18 }], 0, false);
  rec('LEGACY golden: computeGst ₹100 @18% → taxable 84.75, GST 15.25, CGST 7.63/SGST 7.63 semantics unchanged', CG.taxable === 84.75 && CG.totalGst === 15.25 && CG.grandTotal === 100, '84.75 / 15.25 / 100', `${CG.taxable}/${CG.totalGst}/${CG.grandTotal}`);
}
const j = (x) => JSON.stringify(x);

// ══════════════════════════════ LIVE (API + concurrency) ══════════════════════════════
async function live() {
  const { PrismaClient } = require(path.join(process.cwd(), 'node_modules/@prisma/client'));
  (function loadEnv() {
    for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = line.match(/^(DATABASE_URL|DIRECT_URL)=(.*)$/); if (!m || process.env[m[1]]) continue;
      let v = m[2].trim(); v = /^["']/.test(v) ? v.replace(/^(["'])(.*?)\1.*$/, '$2') : v.replace(/\s+#.*$/, ''); process.env[m[1]] = v;
    }
  })();
  const prisma = new PrismaClient();
  const TAG = `isolation-test-mill-${Date.now()}`;
  const INFRA = /Can't reach database|Unable to start a transaction|Transaction already closed|Transaction not found|Timed out|ETIMEDOUT|Server has closed/i;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function http1(method, url, { token, body, headers } = {}) {
    const h = { ...(headers || {}) }; if (token) h.Authorization = `Bearer ${token}`; if (body !== undefined) h['Content-Type'] = 'application/json';
    const res = await fetch(BASE + url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {} return { status: res.status, json, text };
  }
  async function http(method, url, o) {
    let r = await http1(method, url, o).catch((e) => ({ status: 0, text: String(e) }));
    for (let i = 0; i < 3 && (r.status === 0 || (r.status === 500 && INFRA.test(r.text))); i++) { await sleep(15000); r = await http1(method, url, o).catch((e) => ({ status: 0, text: String(e) })); }
    return r;
  }
  const retry = async (fn) => { for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (i >= 5 || !INFRA.test(String(e.message))) throw e; await sleep(15000); } } };
  const PW = 'Test#12345Password';
  async function tenant(label, pkg) {
    const email = `${TAG}-${label}@example.invalid`;
    const r = await http('POST', '/api/v1/auth/register', { body: { email, password: PW, name: `Mill ${label}`, shop_name: `${TAG}-${label}-shop`, business_type: 'kirana', package_type: pkg } });
    if (r.status !== 201) throw new Error(`register ${label} failed: ${r.status} ${String(r.text).slice(0, 160)}`);
    const user = await retry(() => prisma.user.findUnique({ where: { email } }));
    const shop = await retry(() => prisma.shop.findFirst({ where: { ownerId: user.uuid } }));
    return { token: r.json.access_token, user, shop, email };
  }
  // No status endpoint exists: probe the Mill POST. With the platform flag off it answers 403 MILL_NOT_ENABLED.
  const st = await http('POST', '/api/v1/billing', { token: (await tenant('probe', 'badaudyog')).token, body: { billing_model: 'mill_v2', payment_type: 'Cash', items: [] } });
  if (st.json?.code === 'MILL_NOT_ENABLED' || st.status === 0) {
    rec('LIVE prerequisite: dev server started with MILL_V2_ENABLED=true', false, 'flag on', `${st.status} ${String(st.text).slice(0, 120)}`);
    await prisma.$disconnect(); return;
  }

  const bada = await tenant('bada', 'badaudyog');
  const vy = await tenant('vyapar', 'vyapar');
  const T = bada.token;
  const shopId = bada.shop.id;
  const mkProd = (n, price, extra = {}) => retry(() => prisma.product.create({ data: { shopId, name: `${TAG}-${n}`, currentStock: 1000, sellingPrice: price, costPrice: Math.round(price * 0.7), gstPercent: 18, baseUnit: 'kg', ...extra } }));
  const rice = await mkProd('rice', 1000);
  const sale = (body, token = T) => http('POST', '/api/v1/billing', { token, body: { billing_model: 'mill_v2', payment_type: 'Cash', ...body } });
  const line = (p, q, rate, extra = {}) => ({ product_id: p.id, quantity: q, price_per_unit: rate ?? p.sellingPrice, ...extra });
  const salesN = () => retry(() => prisma.sale.count({ where: { shopId } }));

  // ── Gate matrix ──
  let r = await sale({ items: [line(rice, 1)] }, vy.token);
  rec('API gate: non-Bada (Vyapar) shop → 403 MILL_PACKAGE_NOT_ELIGIBLE', r.status === 403 && r.json?.code === 'MILL_PACKAGE_NOT_ELIGIBLE', '403', `${r.status} ${r.json?.code}`);
  // Mill Billing is part of the Bada Udyog package: a brand-new Bada shop bills immediately — no Settings visit, no confirmation.
  r = await http('GET', '/api/v1/shop/mill-billing', { token: T });
  rec('no Mill status/activation endpoint exists (nothing for the client to wait on)', r.status === 404 || r.status === 405, '404|405', String(r.status));
  // Bada Udyog package = Mill Billing: the server refuses to create a legacy / unmarked sale through a direct API call.
  r = await http('POST', '/api/v1/billing', { token: T, body: { payment_type: 'Cash', items: [{ product_id: rice.id, quantity: 1, price_per_unit: 100 }] } });
  rec('Bada Udyog + NO billing_model (legacy/unmarked payload) → 400 MILL_BILLING_REQUIRED, no sale', r.status === 400 && r.json?.code === 'MILL_BILLING_REQUIRED' && (await salesN()) === 0, '400 MILL_BILLING_REQUIRED, 0 sales', `${r.status} ${r.json?.code}`);
  r = await http('POST', '/api/v1/billing', { token: T, body: { billing_model: null, bill_type: 'gst', payment_type: 'Cash', items: [{ product_id: rice.id, quantity: 1, price_per_unit: 100 }] } });
  rec('Bada Udyog + billing_model:null → 400 MILL_BILLING_REQUIRED (null is not a marker)', r.status === 400 && r.json?.code === 'MILL_BILLING_REQUIRED' && (await salesN()) === 0, '400', `${r.status} ${r.json?.code}`);
  r = await http('POST', '/api/v1/billing', { token: T, body: { billing_model: 'legacy', payment_type: 'Cash', items: [{ product_id: rice.id, quantity: 1, price_per_unit: 100 }] } });
  rec('Bada Udyog + an unknown billing_model → 400 (never treated as legacy)', r.status === 400 && (await salesN()) === 0, '400', `${r.status} ${r.json?.code}`);
  r = await http('POST', '/api/v1/shop/mill-pricing', { token: T, body: { password: PW } });
  rec('the old confirm/lock endpoint is gone: nothing handles POST /shop/mill-pricing (404, or 405 from the generic /shop/[id] route) and nothing is confirmed', (r.status === 404 || r.status === 405) && !r.json?.confirmed, '404|405', String(r.status));
  const freshShop = await retry(() => prisma.shop.findUnique({ where: { id: shopId } }));
  rec('fresh Bada shop row carries no confirmation/lock state at all', !('millPricingConfirmedAt' in freshShop) && !('millPricingLockedAt' in freshShop), 'no such columns', Object.keys(freshShop).filter((k) => /millPricing/i.test(k)).join(','));

  // ── First mill_v2 sale on a fresh shop (no confirmation step): worked example, persistence ──
  const before = (await retry(() => prisma.product.findUnique({ where: { id: rice.id } }))).currentStock;
  r = await sale({ bill_type: 'gst', items: [line(rice, 100, 1000)], discount: 5000, charges: { freight: 2000, hamali: 500 }, payment_type: 'Cash' });
  const s1 = r.json;
  rec('mill_v2 sale: ₹1,00,000 − 5,000 + GST 17,100 + freight 2,000 + hamali 500 = ₹1,14,600 (201)', r.status === 201 && s1.totalAmount === 114600 && s1.gstAmount === 17100 && s1.mill?.grand_total === 114600, '201 / 114600 / 17100', `${r.status} ${s1?.totalAmount} ${s1?.gstAmount} ${String(r.text).slice(0, 100)}`);
  const row = s1 && await retry(() => prisma.sale.findUnique({ where: { id: s1.id }, include: { items: true } }));
  rec('persisted: pricingModel, discountAmount, charges, chargesTotal, roundOffAmount, amountPaid = grand total', !!row && row.pricingModel === 'mill_v2' && row.discountAmount === 5000 && row.chargesTotal === 2500 && row.roundOffAmount === 0 && row.charges?.freight === 2000 && row.charges?.hamali === 500 && row.amountPaid === 114600, 'all set', j({ p: row?.pricingModel, d: row?.discountAmount, c: row?.chargesTotal, r: row?.roundOffAmount, paid: row?.amountPaid }));
  rec('charges are NOT SaleItems (1 goods line) and NOT profit (profit 25,000)', !!row && row.items.length === 1 && row.totalProfit === 25000 && row.items[0].marginPerUnit === 250 && row.items[0].pricePerUnit === 1000, '1 item, profit 25000', j({ n: row?.items.length, profit: row?.totalProfit, m: row?.items[0]?.marginPerUnit }));
  const gd = row?.gstDetails;
  rec('gstDetails is SERVER-generated (model mill_v2, per-line applied rate, groups)', gd?.model === 'mill_v2' && gd?.totalGst === 17100 && gd?.lines?.[0]?.rate === 18 && gd?.groups?.[0]?.rate === 18, 'server details', j(gd).slice(0, 120));
  const after = (await retry(() => prisma.product.findUnique({ where: { id: rice.id } }))).currentStock;
  rec('stock decremented by 100', after === before - 100, String(before - 100), String(after));
  const cb = await retry(() => prisma.cashBook.findMany({ where: { shopId, referenceId: s1.id } }));
  rec('cash book row = amount collected (114,600)', cb.length === 1 && Number(cb[0].amount) === 114600, '114600', j(cb.map((c) => c.amount)));
  r = await sale({ bill_type: 'non_gst', items: [line(rice, 1, 100)], charges: { freight: 10 } });
  rec('SECOND mill bill: 201, no lock/confirmation workflow, total 110', r.status === 201 && r.json?.totalAmount === 110, '201 / 110', `${r.status} ${r.json?.totalAmount}`);
  // reprint calc matches the stored invoice
  const gr = await http('GET', `/api/v1/billing/${s1.id}`, { token: T });
  const goodsSum = (gr.json?.items || []).reduce((s, i) => s + Math.round(i.price_per_unit * i.quantity * 100), 0);
  const recon = goodsSum - Math.round((gr.json?.discount_amount || 0) * 100) + Math.round((gr.json?.gst_amount || 0) * 100) + Math.round((gr.json?.charges_total || 0) * 100) + Math.round((gr.json?.round_off_amount || 0) * 100);
  rec('reprint maths: Σ items − discount + GST + charges + round-off == stored total_amount (exact paise)', gr.status === 200 && gr.json?.pricing_model === 'mill_v2' && recon === Math.round(gr.json.total_amount * 100), String(Math.round((gr.json?.total_amount || 0) * 100)), String(recon));

  // ── Round-off, manipulation, payment ──
  r = await sale({ bill_type: 'gst', items: [line(rice, 3, 33.33, { gst_percent: 5 })] });
  rec('round-off: 99.99 + GST 5.00 = 104.99 → total 105.00, round-off +0.01', r.status === 201 && r.json.totalAmount === 105 && r.json.roundOffAmount === 0.01, '105 / 0.01', `${r.status} ${r.json?.totalAmount} ${r.json?.roundOffAmount}`);
  r = await sale({ bill_type: 'gst', items: [line(rice, 1, 100)], total_amount: 1, gst_amount: 0, round_off_amount: 99, charges_total: 5000, gst_details: { totalGst: 0, taxable: 1 }, discount_amount: 99999 });
  rec('client-manipulated total / GST / round-off / chargesTotal / gst_details are IGNORED (server total 118)', r.status === 201 && r.json.totalAmount === 118 && r.json.gstAmount === 18 && r.json.roundOffAmount === 0 && r.json.chargesTotal === 0 && r.json.mill?.client_total_mismatch === true, '118 / 18 / mismatch flagged', `${r.status} ${r.json?.totalAmount} ${r.json?.gstAmount}`);
  const n0 = await salesN();
  r = await sale({ items: [line(rice, 1, 100)], amount_paid: 100.01 });
  rec('amount_paid > rounded grand total (100.01 vs 100) → 400', r.status === 400, '400', String(r.status));
  r = await sale({ items: [line(rice, 1, 100)], amount_paid: -1 });
  rec('negative amount_paid → 400', r.status === 400, '400', String(r.status));
  r = await sale({ bill_type: 'gst', items: [line(rice, 1, 100)], payment_type: 'Split', amount_paid: 118, payment_details: { cash: 100, upi: 100 } });
  rec('split components exceeding amount_paid → 400 (Phase 2A validation preserved)', r.status === 400, '400', String(r.status));
  // invalid charges over the API
  for (const [label, charges] of [['negative', { freight: -5 }], ['NaN string', { freight: 'NaN' }], ['Infinity string', { hamali: 'Infinity' }], ['huge (₹1 crore)', { loading: 10000000 }], ['arbitrary key', { commission: 5 }], ['3 decimals', { freight: 10.005 }], ['combined > ₹25L', { freight: 900000, hamali: 900000, loading: 900000 }]]) {
    r = await sale({ items: [line(rice, 1, 100)], charges });
    rec(`API: ${label} charge → 400, no sale`, r.status === 400, '400', String(r.status));
  }
  r = await sale({ bill_type: 'gst', items: [line(rice, 1, 100, { gst_percent: 7 })] });
  rec('API: GST override outside slabs (7%) → 400', r.status === 400 && r.json?.code === 'INVALID_GST_RATE', '400', `${r.status} ${r.json?.code}`);
  r = await sale({ bill_type: 'gst', gst_inter_state: 'yes', items: [line(rice, 1, 100)] });
  rec('API: non-boolean gstInterState → 400', r.status === 400, '400', String(r.status));
  r = await sale({ items: [], });
  rec('API: empty bill → 400', r.status === 400, '400', String(r.status));
  r = await sale({ billing_model: 'mill_v3', items: [line(rice, 1, 100)] });
  rec('API: unknown billing_model → 400 (never silently legacy)', r.status === 400, '400', String(r.status));
  r = await sale({ items: [line(rice, 1, 100)], created_at: 'not-a-date' });
  rec('API: invalid created_at → 400', r.status === 400, '400', String(r.status));
  const invalidCount = (await salesN()) - n0;
  rec('none of the rejected requests created a sale', invalidCount === 0, '0', String(invalidCount));
  // (the inter-state SUCCESS bill is created only AFTER the "no sale created" window above, so the window holds rejected requests only)
  r = await sale({ bill_type: 'gst', gst_inter_state: true, items: [line(rice, 1, 100)] });
  const igstRow = r.json && await retry(() => prisma.sale.findUnique({ where: { id: r.json.id } }));
  rec('API: inter-state persisted → IGST 18, CGST/SGST 0 in server gstDetails', r.status === 201 && igstRow?.gstDetails?.interState === true && igstRow.gstDetails.igst === 18 && igstRow.gstDetails.cgst === 0, 'IGST', j(igstRow?.gstDetails).slice(0, 100));

  // ── Udhar + credit limit ──
  const cust = await retry(() => prisma.customer.create({ data: { shopId, name: `${TAG}-cust`, totalDue: 0, creditLimit: 500 } }));
  r = await sale({ items: [line(rice, 1, 400)], payment_type: 'Udhar', amount_paid: 0, customer_id: cust.id });
  rec('Udhar mill bill: outstanding = rounded total (400), customer due 400', r.status === 201 && Number((await retry(() => prisma.customer.findUnique({ where: { id: cust.id } }))).totalDue) === 400, '400', `${r.status}`);
  r = await sale({ items: [line(rice, 1, 400)], payment_type: 'Udhar', amount_paid: 0, customer_id: cust.id });
  rec('credit limit enforced (400 + 400 > 500) → 400, due unchanged', r.status === 400 && r.json?.code === 'CREDIT_LIMIT_EXCEEDED' && Number((await retry(() => prisma.customer.findUnique({ where: { id: cust.id } }))).totalDue) === 400, '400 CREDIT_LIMIT_EXCEEDED', `${r.status} ${r.json?.code}`);
  r = await sale({ items: [line(rice, 1, 400)], payment_type: 'Udhar', amount_paid: 0 });
  rec('outstanding without a customer → 400', r.status === 400, '400', String(r.status));

  // ── Idempotency ──
  const key = `idem-${TAG}`;
  const [i1, i2] = [await http('POST', '/api/v1/billing', { token: T, headers: { 'x-idempotency-key': key }, body: { billing_model: 'mill_v2', payment_type: 'Cash', items: [line(rice, 1, 50)] } }),
                    await http('POST', '/api/v1/billing', { token: T, headers: { 'x-idempotency-key': key }, body: { billing_model: 'mill_v2', payment_type: 'Cash', items: [line(rice, 1, 50)] } })];
  rec('idempotency: same key twice → one sale, same id', i1.status === 201 && i2.json?.id === i1.json?.id, 'same id', `${i1.json?.id} / ${i2.json?.id}`);

  // ── Guards: edit / return / exchange blocked, delete allowed ──
  const gs = s1.id;
  r = await http('PATCH', `/api/v1/billing/${gs}`, { token: T, body: { items: [line(rice, 1, 100)], payment_type: 'Cash' } });
  rec('edit mill_v2 → 409 MILL_V2_EDIT_NOT_SUPPORTED', r.status === 409 && r.json?.code === 'MILL_V2_EDIT_NOT_SUPPORTED', '409', `${r.status} ${r.json?.code}`);
  r = await http('POST', '/api/v1/billing/returns', { token: T, body: { bill_id: gs, items: [{ item_id: row.items[0].id, quantity: 1 }] } });
  rec('return on mill_v2 → 409 MILL_V2_RETURN_NOT_SUPPORTED', r.status === 409 && r.json?.code === 'MILL_V2_RETURN_NOT_SUPPORTED', '409', `${r.status} ${r.json?.code}`);
  r = await http('POST', '/api/v1/billing/exchange', { token: T, body: { bill_id: gs, return_items: [{ item_id: row.items[0].id, quantity: 1 }], exchange_items: [{ product_id: rice.id, quantity: 1 }], settlement_method: 'Cash' } });
  rec('exchange on mill_v2 → 409 MILL_V2_EXCHANGE_NOT_SUPPORTED', r.status === 409 && r.json?.code === 'MILL_V2_EXCHANGE_NOT_SUPPORTED', '409', `${r.status} ${r.json?.code}`);
  const del = await http('POST', '/api/v1/billing', { token: T, body: { billing_model: 'mill_v2', payment_type: 'Cash', items: [line(rice, 2, 10)] } });
  const dr = await http('DELETE', `/api/v1/billing/${del.json?.id}`, { token: T });
  rec('delete of a mill_v2 bill still works (delete/restore unchanged)', [200, 204].includes(dr.status), '200/204', String(dr.status));

  // ── Historical LEGACY invoices inside a Bada shop (e.g. bills made before the shop moved to Bada Udyog). A Bada shop can no
  //    longer create them through the API, so the fixtures are made the way a pre-Mill legacy shop would: the test shop's
  //    package is switched for the moment (auth cache TTL is 4 s) and switched back. ──
  const legacyBody = (extra) => ({ payment_type: 'Cash', ...extra });
  const asLegacyShop = async (fn) => {
    await retry(() => prisma.shop.update({ where: { id: shopId }, data: { packageType: 'vyapar' } })); await sleep(5500);
    try { return await fn(); } finally { await retry(() => prisma.shop.update({ where: { id: shopId }, data: { packageType: 'badaudyog' } })); await sleep(5500); }
  };
  const legacyMade = await asLegacyShop(async () => {
    const g = await http('POST', '/api/v1/billing', { token: T, body: legacyBody({ bill_type: 'gst', items: [{ product_id: rice.id, quantity: 1, price_per_unit: 100 }] }) });
    const n = await http('POST', '/api/v1/billing', { token: T, body: legacyBody({ items: [{ product_id: rice.id, quantity: 2, price_per_unit: 100 }, { name: 'Transport Charges', unit: 'Unit', quantity: 1, price_per_unit: 300 }, { name: 'Packing Charges', unit: 'Unit', quantity: 1, price_per_unit: 50 }, { name: 'Loading Charges', unit: 'Unit', quantity: 1, price_per_unit: 20 }] }) });
    return { g, n };
  });
  r = legacyMade.g;
  rec('LEGACY fixture (made while the shop was legacy): ₹100 @18% stays INCLUSIVE → total 100, GST 15.25, no pricing model', r.status === 201 && r.json.totalAmount === 100 && Math.abs(r.json.gstAmount - 15.25) < 0.005 && (r.json.pricingModel ?? null) === null, '100 / 15.25 / null model', `${r.status} ${r.json?.totalAmount} ${r.json?.gstAmount} ${r.json?.pricingModel}`);
  const legacyGst = r.json;
  r = await http('POST', '/api/v1/billing/exchange', { token: T, body: { bill_id: legacyGst.id, return_items: [{ item_id: 'x', quantity: 1 }], exchange_items: [{ product_id: rice.id, quantity: 1, price: 100 }] } });
  rec('Bada Udyog: exchange of a historical LEGACY invoice (would create a new legacy sale) → 400 MILL_BILLING_REQUIRED', r.status === 400 && r.json?.code === 'MILL_BILLING_REQUIRED', '400 MILL_BILLING_REQUIRED', `${r.status} ${r.json?.code}`);
  const stillBada = await retry(() => prisma.shop.findUnique({ where: { id: shopId } }));
  rec('the test shop is a Bada Udyog shop again after the fixture step', stillBada.packageType === 'badaudyog', 'badaudyog', stillBada.packageType);
  r = await http('POST', '/api/v1/billing', { token: vy.token, body: legacyBody({ items: [{ product_id: (await retry(() => prisma.product.create({ data: { shopId: vy.shop.id, name: `${TAG}-vp`, currentStock: 10, sellingPrice: 50, costPrice: 20, baseUnit: 'pcs' } }))).id, quantity: 2, price_per_unit: 50 }] }) });
  rec('LEGACY path on a Vyapar shop unaffected (201, total 100)', r.status === 201 && r.json.totalAmount === 100, '201 / 100', `${r.status} ${r.json?.totalAmount}`);
  r = await http('PATCH', `/api/v1/billing/${legacyGst.id}`, { token: T, body: { items: [{ product_id: rice.id, quantity: 1, price_per_unit: 100 }], payment_type: 'UPI', amount_paid: 100, bill_type: 'gst' } });
  rec('LEGACY invoice edit still works (200)', r.status === 200, '200', `${r.status} ${r.status === 200 ? '' : String(r.text).slice(0, 300)}`);

  // ── Duplicate preview ──
  const legacyNon = legacyMade.n.json;
  let pv = await http('GET', `/api/v1/billing/${legacyNon.id}/duplicate-preview`, { token: T });
  rec('duplicate-preview: legacy NON-GST → as_is_non_gst, force non_gst, rates unchanged', pv.status === 200 && pv.json?.status === 'as_is_non_gst' && pv.json?.force_bill_type === 'non_gst' && pv.json.items.length === 1 && pv.json.items[0].rate === 100, 'as_is_non_gst', j({ s: pv.json?.status, n: pv.json?.items?.length }));
  rec('duplicate-preview: legacy charge lines → charge VALUES (Transport→freight 300, Loading→loading 20, Packing→other 50), not goods', pv.json?.charges?.freight === 300 && pv.json?.charges?.loading === 20 && pv.json?.charges?.other === 50, 'freight 300 / loading 20 / other 50', j(pv.json?.charges));
  pv = await http('GET', `/api/v1/billing/${legacyGst.id}/duplicate-preview`, { token: T });
  rec('duplicate-preview: legacy GST invoice → BLOCKED (no conversion, no inferred rate)', pv.status === 200 && pv.json?.status === 'blocked' && pv.json?.code === 'MILL_DUPLICATE_LEGACY_GST_BLOCKED' && pv.json.items.length === 0, 'blocked', j({ s: pv.json?.status, c: pv.json?.code }));
  pv = await http('GET', `/api/v1/billing/${s1.id}/duplicate-preview`, { token: T });
  rec('duplicate-preview: mill_v2 invoice → as_is with its stored charges and discount', pv.json?.status === 'as_is' && pv.json?.charges?.freight === 2000 && pv.json?.discount?.value === 5000, 'as_is', j({ s: pv.json?.status, c: pv.json?.charges?.freight }));
  pv = await http('GET', `/api/v1/billing/${legacyNon.id}/duplicate-preview`, { token: vy.token });
  rec('duplicate-preview: non-Bada shop → 403', pv.status === 403, '403', String(pv.status));
  r = await sale({ bill_type: 'gst', duplicated_from: legacyNon.id, items: [line(rice, 1, 100)] });
  rec('POST with duplicated_from legacy non-GST + bill_type gst → 409 MILL_DUPLICATE_GST_SWITCH_BLOCKED', r.status === 409 && r.json?.code === 'MILL_DUPLICATE_GST_SWITCH_BLOCKED', '409', `${r.status} ${r.json?.code}`);
  r = await sale({ duplicated_from: legacyGst.id, items: [line(rice, 1, 100)] });
  rec('POST with duplicated_from legacy GST invoice → 409 MILL_DUPLICATE_LEGACY_GST_BLOCKED', r.status === 409 && r.json?.code === 'MILL_DUPLICATE_LEGACY_GST_BLOCKED', '409', `${r.status} ${r.json?.code}`);
  r = await sale({ bill_type: 'non_gst', duplicated_from: legacyNon.id, items: [line(rice, 2, 100)] });
  rec('POST with duplicated_from legacy non-GST + non_gst → 201 as-is (total 200)', r.status === 201 && r.json?.totalAmount === 200, '201 / 200', `${r.status} ${r.json?.totalAmount}`);

  // ── Concurrency: two simultaneous mill bills on one stock pool (no shop-row lock any more; product rows serialise) ──
  const c2 = await tenant('cc2', 'badaudyog');
  const p2 = await retry(() => prisma.product.create({ data: { shopId: c2.shop.id, name: `${TAG}-cc2`, currentStock: 100, sellingPrice: 100, costPrice: 50, baseUnit: 'kg' } }));
  const two = await Promise.all([0, 1].map(() => http('POST', '/api/v1/billing', { token: c2.token, body: { billing_model: 'mill_v2', payment_type: 'Cash', items: [{ product_id: p2.id, quantity: 60, price_per_unit: 100 }] } })));
  const sts = two.map((x) => x.status).sort();
  const c2p = await retry(() => prisma.product.findUnique({ where: { id: p2.id } }));
  rec('two simultaneous FIRST mill bills on 100 units (60 + 60): one 201, one 409; stock 40', sts[0] === 201 && sts[1] === 409 && c2p.currentStock === 40, '[201,409] stock 40', j({ sts, stock: c2p.currentStock }));
  const errs5 = two.filter((x) => x.status >= 500);
  rec('no 5xx / deadlock in the concurrency test', errs5.length === 0, 'none', j(errs5.map((x) => `${x.status} ${String(x.text).slice(0, 80)}`)));

  await prisma.$disconnect();
  console.log(`\n(throwaway tenants tagged ${TAG}; remove with: CLEANUP_ONLY=1 node scripts/test-isolation.js)`);
}

(async () => {
  unit();
  if (LIVE) await live().catch((e) => { rec('LIVE suite crashed', false, 'no exception', String(e && e.stack || e).slice(0, 400)); });
  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== ${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total ===`);
  failed.forEach((f) => console.log('FAILED: ' + f.name));
  process.exit(failed.length ? 1 : 0);
})();
