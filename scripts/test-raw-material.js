/* eslint-disable */
/**
 * Raw Material module (lots, sources, purchase / weighbridge import, stock safety) — LIVE API tests.
 *   LIVE=1 BASE=http://127.0.0.1:3001 node scripts/test-raw-material.js
 * Uses throwaway isolation-test-rmt-* tenants (swept by CLEANUP_ONLY=1 node scripts/test-isolation.js).
 */
const path = require('path'), fs = require('fs');
if (process.env.LIVE !== '1') { console.log('Set LIVE=1 (needs the dev server + DB).'); process.exit(0); }
const BASE = process.env.BASE || 'http://127.0.0.1:3001';
const results = [];
const rec = (name, ok, exp, act) => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      expected: ${exp}\n      actual:   ${act}`}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const { PrismaClient } = require(path.join(process.cwd(), 'node_modules/@prisma/client'));
  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = line.match(/^(DATABASE_URL|DIRECT_URL)=(.*)$/); if (!m || process.env[m[1]]) continue; let v = m[2].trim(); v = /^["']/.test(v) ? v.replace(/^(["'])(.*?)\1.*$/, '$2') : v.replace(/\s+#.*$/, ''); process.env[m[1]] = v; }
  const prisma = new PrismaClient(); const TAG = `isolation-test-rmt-${Date.now()}`;
  const INFRA = /Can't reach database|Unable to start a transaction|Transaction already closed|Timed out|Server has closed|ECONN|fetch failed/i;
  const retry = async (fn) => { for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (i >= 5 || !INFRA.test(String(e.message))) throw e; await sleep(15000); } } };
  async function http(method, url, { token, shopId, body } = {}) {
    for (let a = 0; a < 3; a++) {
      try {
        const h = { 'Content-Type': 'application/json' }; if (token) h.Authorization = 'Bearer ' + token; if (shopId) h['x-shop-id'] = shopId;
        const res = await fetch(BASE + url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
        const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
        if (res.status === 500 && INFRA.test(text) && a < 2) { await sleep(15000); continue; }
        return { status: res.status, json, text };
      } catch (e) { if (a === 2) return { status: 0, text: String(e) }; await sleep(15000); }
    }
  }
  async function tenant(label, pkg = 'badaudyog') {
    const email = `${TAG}-${label}@example.invalid`;
    const r = await http('POST', '/api/v1/auth/register', { body: { email, password: 'Test#12345Password', name: label, shop_name: `${TAG}-${label}-shop`, business_type: 'kirana', package_type: pkg } });
    if (r.status !== 201) throw new Error('register ' + label + ' ' + r.status);
    const user = await retry(() => prisma.user.findUnique({ where: { email } })); const shop = await retry(() => prisma.shop.findFirst({ where: { ownerId: user.uuid } }));
    return { token: r.json.access_token, shopId: shop.id };
  }
  const A = await tenant('a'), B = await tenant('b');
  const mk = (t, n, cat, stock, unit = 'kg') => retry(() => prisma.product.create({ data: { shopId: t.shopId, name: `${TAG}-${n}`, millCategory: cat, currentStock: stock, baseUnit: unit, sellingPrice: 0, gstPercent: 0 } }));
  const paddy = await mk(A, 'Paddy', 'raw_material', 0), wheat = await mk(A, 'Wheat', null, 0), akha = await mk(A, 'Akha', 'finished_goods', 0), foreignP = await mk(B, 'ForeignPaddy', 'raw_material', 0), bagP = await mk(A, 'Bag', 'raw_material', 0, 'bag');
  const stock = async (id) => (await retry(() => prisma.product.findUnique({ where: { id } }))).currentStock ?? 0;
  const lotBy = (num) => retry(() => prisma.rawMaterialLot.findFirst({ where: { shopId: A.shopId, lotNumber: num } }));
  const lotsApi = async (t = A) => (await http('GET', '/api/v1/mill/raw-lots', t)).json;
  const post = (body, t = A) => http('POST', '/api/v1/mill/raw-lots', { ...t, body });

  // ── manual lots
  let r = await post({ productId: paddy.id, lotNumber: 'M-1', farmerName: 'Ramesh', weightKg: 5000, moisturePct: 14, ratePerKg: 30 });
  rec('manual lot: 201, weight/remaining 5,000, amount ₹1,50,000', r.status === 201 && r.json.weightKg === 5000 && r.json.remainingKg === 5000 && r.json.totalAmount === 150000, '201', `${r.status} ${r.text?.slice(0, 120)}`);
  rec('manual lot ADDS the product stock (Paddy 0 → 5,000)', (await stock(paddy.id)) === 5000, '5000', String(await stock(paddy.id)));
  const manualLot = r.json;
  r = await post({ lotNumber: 'X', weightKg: 10 });
  rec('no product → 400 PRODUCT_REQUIRED', r.status === 400 && r.json?.code === 'PRODUCT_REQUIRED', '400', `${r.status} ${r.json?.code}`);
  r = await post({ productId: foreignP.id, weightKg: 10 });
  rec("another shop's product → 404, nothing created", r.status === 404 && !(await lotBy(null)) , '404', String(r.status));
  for (const [nm, body, code] of [['weight 0', { productId: paddy.id, weightKg: 0 }, 400], ['negative weight', { productId: paddy.id, weightKg: -5 }, 400], ['negative rate', { productId: paddy.id, weightKg: 5, ratePerKg: -1 }, 400], ['moisture 150', { productId: paddy.id, weightKg: 5, moisturePct: 150 }, 400], ['non-weight product (bags)', { productId: bagP.id, weightKg: 5 }, 400]]) {
    r = await post(body); rec(`validation: ${nm} → ${code}`, r.status === code, String(code), `${r.status} ${r.json?.code}`);
  }
  rec('rejected inputs created no stock (Paddy still 5,000)', (await stock(paddy.id)) === 5000, '5000', String(await stock(paddy.id)));

  // ── purchase → raw material
  const sup = await retry(() => prisma.supplier.create({ data: { shopId: A.shopId, name: 'Sita Trader' } }));
  const buy = (inv, items) => http('POST', '/api/v1/purchases', { ...A, body: { supplierId: sup.id, invoiceNumber: inv, date: '2026-09-20', items } });
  r = await buy('INV-W1', [{ productId: wheat.id, quantity: 8, cost: 2500, conversionFactor: 100 }]);   // 8 quintal @ ₹2,500/quintal → 800 kg
  rec('purchase of 8 quintal Wheat: creates NO lot (Wheat is not classed as raw material), stock 800 kg', r.status === 200 && (await stock(wheat.id)) === 800 && !(await lotBy('INV-W1')), '200 / 800', `${r.status} / ${await stock(wheat.id)}`);
  const item = await retry(() => prisma.purchaseItem.findFirst({ where: { productId: wheat.id, purchaseInvoice: { shopId: A.shopId } } }));
  r = await buy('INV-P1', [{ productId: paddy.id, quantity: 1000, cost: 31, conversionFactor: 1 }]);
  const l1 = (await lotsApi()).find((l) => l.lotNumber === 'INV-P1');
  rec('purchase of raw-material product auto-creates lot with source=purchase, ref INV-P1', l1 && l1.source === 'purchase' && l1.sourceRef === 'INV-P1', 'purchase/INV-P1', JSON.stringify(l1 && [l1.source, l1.sourceRef]));
  const before = await stock(wheat.id);
  r = await post({ productId: wheat.id, purchaseItemId: item.id, weightKg: 999999, ratePerKg: 1, farmerName: 'x' });
  const imp = await lotBy('INV-W1');
  rec('import purchase line: weight/rate/supplier come from the DB (client 999999 ignored): 800 kg @ ₹25/kg, vendor Sita Trader', r.status === 201 && imp && imp.weightKg === 800 && imp.ratePerKg === 25 && imp.supplierId === sup.id, '800 / 25', `${r.status} ${imp && imp.weightKg}/${imp && imp.ratePerKg}`);
  rec('import does NOT add stock again (Wheat stays 800)', (await stock(wheat.id)) === before && before === 800, '800', String(await stock(wheat.id)));
  rec('imported lot shows source=purchase / INV-W1', (await lotsApi()).find((l) => l.lotNumber === 'INV-W1')?.source === 'purchase', 'purchase', '');
  r = await post({ productId: wheat.id, purchaseItemId: item.id });
  rec('importing the same line twice → 409 PURCHASE_LINE_ALREADY_IMPORTED', r.status === 409 && r.json?.code === 'PURCHASE_LINE_ALREADY_IMPORTED', '409', `${r.status} ${r.json?.code}`);
  r = await post({ productId: paddy.id, purchaseItemId: item.id });
  rec('purchase line with a different product → 400 mismatch', r.status === 400 && r.json?.code === 'PURCHASE_LINE_PRODUCT_MISMATCH', '400', `${r.status} ${r.json?.code}`);
  r = await http('POST', '/api/v1/mill/raw-lots', { ...B, body: { productId: foreignP.id, purchaseItemId: item.id } });
  rec("another shop cannot import this shop's purchase line → 404", r.status === 404, '404', String(r.status));
  rec("another shop's Raw Material list shows none of this shop's lots", (await lotsApi(B)).length === 0, '0', String((await lotsApi(B)).length));

  // ── weighbridge → raw material (net weight)
  const wbNew = async (gross, tare, extra = {}) => { const w = await http('POST', '/api/v1/mill/weighbridge', { ...A, body: { vehicleNumber: 'MH12AB1234', productId: paddy.id, supplierId: sup.id, grossWeightKg: gross, ratePerKg: 32, ...extra } }); await http('PATCH', `/api/v1/mill/weighbridge/${w.json.id}`, { ...A, body: { tareWeightKg: tare } }); return w.json; };
  const slip = await wbNew(15010, 3000);
  const paddyBefore = await stock(paddy.id);
  r = await http('POST', `/api/v1/mill/weighbridge/${slip.id}/convert-to-lot`, { ...A, body: { productId: paddy.id, ratePerKg: 32, moisturePct: 12.5, weightKg: 999999 } });
  const wl = await retry(() => prisma.rawMaterialLot.findFirst({ where: { id: r.json?.id } }));
  rec('weighbridge → lot: quantity is the NET weight 12,010 (not gross 15,010, client value ignored), moisture 12.5', r.status === 201 && wl.weightKg === 12010 && wl.moisturePct === 12.5, '12010 / 12.5', `${r.status} ${wl && wl.weightKg}`);
  rec('weighbridge lot adds product stock once (+12,010)', (await stock(paddy.id)) === paddyBefore + 12010, String(paddyBefore + 12010), String(await stock(paddy.id)));
  rec('weighbridge lot shows source=weighbridge with the slip number', (await lotsApi()).find((l) => l.id === wl.id)?.source === 'weighbridge' && (await lotsApi()).find((l) => l.id === wl.id)?.sourceRef === slip.slipNumber, 'weighbridge', '');
  r = await http('POST', `/api/v1/mill/weighbridge/${slip.id}/convert-to-lot`, { ...A, body: { productId: paddy.id } });
  rec('converting the same slip twice → 400, no second lot', r.status === 400, '400', String(r.status));
  const slipB = await http('POST', '/api/v1/mill/weighbridge', { ...B, body: { vehicleNumber: 'B1', productId: foreignP.id, grossWeightKg: 100 } });
  await http('PATCH', `/api/v1/mill/weighbridge/${slipB.json.id}`, { ...B, body: { tareWeightKg: 10 } });
  r = await http('POST', `/api/v1/mill/weighbridge/${slipB.json.id}/convert-to-lot`, { ...A, body: { productId: paddy.id } });
  rec("another shop's weighbridge slip cannot be converted here → 404", r.status === 404, '404', String(r.status));

  // ── lot edit guards
  r = await http('PATCH', `/api/v1/mill/raw-lots/${manualLot.id}`, { ...A, body: { remainingKg: 9999 } });
  rec('remaining above the lot weight → 400', r.status === 400 && r.json?.code === 'INVALID_REMAINING', '400', `${r.status} ${r.json?.code}`);
  r = await http('PATCH', `/api/v1/mill/raw-lots/${manualLot.id}`, { ...A, body: { remainingKg: -1 } });
  rec('negative remaining → 400', r.status === 400, '400', String(r.status));
  r = await http('PATCH', `/api/v1/mill/raw-lots/${manualLot.id}`, { ...A, body: { moisturePct: 500 } });
  rec('moisture 500 on edit → 400', r.status === 400, '400', String(r.status));

  // ── production consumption: partial then full
  const cb = await http('POST', '/api/v1/mill/batches', { ...A, body: { rawLotId: manualLot.id, inputKg: 2000, batchNumber: 'RM-B1' } });
  const fin = (id, kg, loss = 0) => http('POST', `/api/v1/mill/batches/${id}/finalize`, { ...A, body: { outputs: [{ outputType: 'finished_good', productId: akha.id, quantity: kg }], lossKg: loss } });
  r = await fin(cb.json.id, 1900, 100);
  const afterPartial = await lotBy('M-1');
  const availList = (await http('GET', '/api/v1/mill/raw-lots?status=available', A)).json;
  rec('partial consumption: 5,000 − 2,000 = 3,000 remaining, lot stays in AVAILABLE, used-in lists RM-B1', r.status === 200 && afterPartial.remainingKg === 3000 && availList.some((l) => l.lotNumber === 'M-1' && l.batches.some((b) => b.batchNumber === 'RM-B1')), '3000', `${r.status} ${afterPartial.remainingKg}`);
  r = await http('PATCH', `/api/v1/mill/raw-lots/${manualLot.id}`, { ...A, body: { weightKg: 1500 } });
  rec('lowering the weight below what is already consumed (2,000) → 409', r.status === 409 && r.json?.code === 'BELOW_CONSUMED', '409', `${r.status} ${r.json?.code}`);
  r = await http('PATCH', `/api/v1/mill/raw-lots/${manualLot.id}`, { ...A, body: { weightKg: 6000 } });
  rec('raising the weight to 6,000 keeps the consumed 2,000: remaining 4,000', r.status === 200 && (await lotBy('M-1')).remainingKg === 4000, '4000', String((await lotBy('M-1')).remainingKg));
  const cb2 = await http('POST', '/api/v1/mill/batches', { ...A, body: { rawLotId: manualLot.id, inputKg: 4000, batchNumber: 'RM-B2' } });
  r = await fin(cb2.json.id, 3950, 50);
  const consumedList = (await http('GET', '/api/v1/mill/raw-lots?status=consumed', A)).json;
  const availAfter = (await http('GET', '/api/v1/mill/raw-lots?status=available', A)).json;
  rec('full consumption: remaining 0 → in CONSUMED, gone from AVAILABLE, never negative', r.status === 200 && (await lotBy('M-1')).remainingKg === 0 && consumedList.some((l) => l.lotNumber === 'M-1') && !availAfter.some((l) => l.lotNumber === 'M-1'), '0', String((await lotBy('M-1')).remainingKg));
  const cb3 = await http('POST', '/api/v1/mill/batches', { ...A, body: { rawLotId: manualLot.id, inputKg: 1 } });
  rec('a consumed lot cannot start another batch (400 LOT_UNAVAILABLE)', cb3.status === 400 && cb3.json?.code === 'LOT_UNAVAILABLE', '400', `${cb3.status} ${cb3.json?.code}`);
  const all = (await http('GET', '/api/v1/mill/raw-lots', A)).json;
  rec('ALL lists every lot; every lot has a source of purchase / weighbridge / manual', all.length >= 4 && all.every((l) => ['purchase', 'weighbridge', 'manual'].includes(l.source)), '>=4', String(all.length));
  rec('manual lot source = manual', all.find((l) => l.lotNumber === 'M-1')?.source === 'manual', 'manual', '');
  const negs = await retry(() => prisma.rawMaterialLot.count({ where: { shopId: A.shopId, remainingKg: { lt: 0 } } }));
  rec('no lot has negative remaining', negs === 0, '0', String(negs));

  // ── other packages untouched
  const D = await tenant('dukan', 'dukan');
  const dp = await mk(D, 'DukanItem', null, 50, 'pcs');
  r = await http('POST', '/api/v1/billing', { ...D, body: { payment_type: 'Cash', items: [{ product_id: dp.id, quantity: 2, price_per_unit: 10 }] } });
  rec('Dukan billing unaffected (201, stock 50→48)', r.status === 201 && (await stock(dp.id)) === 48, '201 / 48', `${r.status} / ${await stock(dp.id)}`);
  r = await http('POST', '/api/v1/purchases', { ...D, body: { supplierId: (await retry(() => prisma.supplier.create({ data: { shopId: D.shopId, name: 'DS' } }))).id, items: [{ productId: dp.id, quantity: 5, cost: 3, conversionFactor: 1, addToRawMaterial: true }] } });
  const dukanLots = await retry(() => prisma.rawMaterialLot.count({ where: { shopId: D.shopId } }));
  rec('Dukan purchase ignores the mill-only addToRawMaterial flag (no lot)', r.status === 200 && dukanLots === 0, '200 / 0 lots', `${r.status} / ${dukanLots}`);
  await prisma.$disconnect();
  const pass = results.filter((x) => x.ok).length;
  console.log(`\n=== ${pass} passed, ${results.length - pass} failed, ${results.length} total ===`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
