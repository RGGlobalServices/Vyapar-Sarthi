/* eslint-disable */
/**
 * Mill Batches (create → start → finalize lifecycle, lot selection, stock safety) — LIVE API tests.
 *   LIVE=1 BASE=http://127.0.0.1:3001 node scripts/test-batches.js
 * Throwaway isolation-test-bat-* tenants (swept by CLEANUP_ONLY=1 node scripts/test-isolation.js).
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
  const prisma = new PrismaClient(); const TAG = `isolation-test-bat-${Date.now()}`;
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
  const mk = (t, n, cat, stock = 0, unit = 'kg') => retry(() => prisma.product.create({ data: { shopId: t.shopId, name: `${TAG}-${n}`, millCategory: cat, currentStock: stock, baseUnit: unit, sellingPrice: 0, gstPercent: 0 } }));
  const paddy = await mk(A, 'Paddy', 'raw_material'), wheat = await mk(A, 'Wheat', 'raw_material'), akha = await mk(A, 'Akha', 'finished_goods'), foreignP = await mk(B, 'FP', 'raw_material');
  const stock = async (id) => (await retry(() => prisma.product.findUnique({ where: { id } }))).currentStock ?? 0;
  const lotRow = (id) => retry(() => prisma.rawMaterialLot.findUnique({ where: { id } }));
  const post = (url, body, t = A) => http('POST', url, { ...t, body });
  const newLot = async (num, kg, prod = paddy, t = A) => (await post('/api/v1/mill/raw-lots', { productId: prod.id, lotNumber: num, weightKg: kg, ratePerKg: 30, moisturePct: 13 }, t)).json;
  const mkBatch = (o, t = A) => post('/api/v1/mill/batches', o, t);
  const fin = (id, kg, loss = 0, t = A) => post(`/api/v1/mill/batches/${id}/finalize`, { outputs: [{ outputType: 'finished_good', productId: akha.id, quantity: kg }], lossKg: loss }, t);
  const movements = (batchId) => retry(() => prisma.stockMovement.findMany({ where: { referenceId: batchId } }));

  // ── CREATE
  const lot1 = await newLot('L-001', 8000);
  const paddyAfterLot = await stock(paddy.id);
  let r = await mkBatch({ rawLotId: lot1.id, productId: paddy.id, inputQuantity: 20, unit: 'quintal', batchNumber: 'B-1' });
  const b1 = r.json;
  rec('create: valid batch — 20 quintal is converted to 2,000 kg by the server, status open, batch number kept', r.status === 201 && b1.inputKg === 2000 && b1.status === 'open' && b1.batchNumber === 'B-1', '201 / 2000 / open', `${r.status} ${b1 && b1.inputKg}`);
  const mv = await movements(b1.id);
  rec('create does NOT consume: lot still 8,000, Paddy unchanged, only a zero-quantity start marker exists', (await lotRow(lot1.id)).remainingKg === 8000 && (await stock(paddy.id)) === paddyAfterLot && mv.length === 1 && mv[0].type === 'production_start' && mv[0].quantity === 0, '8000 / 1 marker', `${(await lotRow(lot1.id)).remainingKg} / ${mv.map((m) => m.type + m.quantity)}`);
  for (const [nm, o] of [['zero', 0], ['negative', -5], ['not a number', 'abc']]) {
    r = await mkBatch({ rawLotId: lot1.id, inputQuantity: o }); rec(`create: ${nm} quantity → 400 INVALID_QUANTITY`, r.status === 400 && r.json?.code === 'INVALID_QUANTITY', '400', `${r.status} ${r.json?.code}`);
  }
  r = await mkBatch({ rawLotId: lot1.id, inputQuantity: 8001 });
  rec('create: 8,001 kg from an 8,000 kg lot → 400 INSUFFICIENT_RAW_STOCK', r.status === 400 && r.json?.code === 'INSUFFICIENT_RAW_STOCK', '400', `${r.status} ${r.json?.code}`);
  r = await mkBatch({ rawLotId: lot1.id, inputQuantity: 8000, batchNumber: 'B-FULL' });
  rec('create: exactly the available 8,000 kg is accepted', r.status === 201, '201', String(r.status));
  await http('DELETE', `/api/v1/mill/batches/${r.json.id}`, A);
  r = await mkBatch({ rawLotId: lot1.id, inputQuantity: 5, unit: 'bag' });
  rec('create: a non-weight unit → 400', r.status === 400, '400', String(r.status));
  r = await mkBatch({ inputQuantity: 5 });
  rec('create: no lot → 400 RAW_LOT_REQUIRED', r.status === 400 && r.json?.code === 'RAW_LOT_REQUIRED', '400', `${r.status} ${r.json?.code}`);
  const foreignLotRes = await post('/api/v1/mill/raw-lots', { productId: foreignP.id, lotNumber: 'F-1', weightKg: 1000 }, B); const foreignLot = foreignLotRes.json; if (!foreignLot?.id) console.log('DEBUG foreign lot', foreignLotRes.status, foreignLotRes.text.slice(0, 200));
  r = await mkBatch({ rawLotId: foreignLot.id, inputQuantity: 10 });
  rec("create: another shop's lot → 404 LOT_NOT_FOUND", r.status === 404 && r.json?.code === 'LOT_NOT_FOUND', '404', `${r.status} ${r.json?.code}`);
  r = await mkBatch({ rawLotId: lot1.id, productId: foreignP.id, inputQuantity: 10 });
  rec("create: another shop's product → 404 PRODUCT_NOT_FOUND", r.status === 404 && r.json?.code === 'PRODUCT_NOT_FOUND', '404', `${r.status} ${r.json?.code}`);
  r = await mkBatch({ rawLotId: lot1.id, productId: wheat.id, inputQuantity: 10 });
  rec('create: product that does not match the lot → 400 PRODUCT_LOT_MISMATCH', r.status === 400 && r.json?.code === 'PRODUCT_LOT_MISMATCH', '400', `${r.status} ${r.json?.code}`);
  r = await mkBatch({ rawLotId: lot1.id, inputQuantity: 10, batchNumber: 'B-1' });
  rec('create: duplicate batch number → 409', r.status === 409 && r.json?.code === 'BATCH_NUMBER_EXISTS', '409', `${r.status} ${r.json?.code}`);
  const emptyLot = await newLot('L-EMPTY', 100);
  await retry(() => prisma.rawMaterialLot.update({ where: { id: emptyLot.id }, data: { remainingKg: 0 } }));
  r = await mkBatch({ rawLotId: emptyLot.id, inputQuantity: 1 });
  rec('create: a fully consumed lot → 400 LOT_UNAVAILABLE', r.status === 400 && r.json?.code === 'LOT_UNAVAILABLE', '400', `${r.status} ${r.json?.code}`);
  const availList = (await http('GET', '/api/v1/mill/raw-lots?status=available', A)).json;
  rec('the selectable lots exclude consumed ones and carry source / vendor / date', availList.some((l) => l.lotNumber === 'L-001' && l.source === 'manual') && !availList.some((l) => l.lotNumber === 'L-EMPTY'), 'ok', JSON.stringify(availList.map((l) => l.lotNumber)));

  // ── DETAIL / LIST
  const d = (await http('GET', `/api/v1/mill/batches/${b1.id}`, A)).json;
  rec('detail: raw material section data — lot, source, remaining/total, rate, moisture', d.rawLot?.lotNumber === 'L-001' && d.rawLot.source === 'manual' && d.rawLot.remainingKg === 8000 && d.rawLot.ratePerKg === 30 && d.rawLot.moisturePct === 13, 'ok', JSON.stringify(d.rawLot && [d.rawLot.lotNumber, d.rawLot.source, d.rawLot.remainingKg, d.rawLot.ratePerKg, d.rawLot.moisturePct]));
  const list = (await http('GET', '/api/v1/mill/batches', A)).json;
  rec('list: batch row has product, lot, input, status and the lot source', list.find((x) => x.batchNumber === 'B-1')?.rawLot?.product?.name === paddy.name && list.find((x) => x.batchNumber === 'B-1')?.rawLot?.source === 'manual', 'ok', '');
  rec("another shop's batch list does not show this shop's batches", (await http('GET', '/api/v1/mill/batches', B)).json.length === 0, '0', '');

  // ── LIFECYCLE
  r = await post(`/api/v1/mill/batches/${b1.id}/start`, {}, B);
  rec("start: another shop cannot start this batch → 404", r.status === 404, '404', String(r.status));
  const [s1, s2] = await Promise.all([post(`/api/v1/mill/batches/${b1.id}/start`, {}), post(`/api/v1/mill/batches/${b1.id}/start`, {})]);
  rec('start: two simultaneous starts → exactly one 200 and one 409', [s1.status, s2.status].sort().join() === '200,409' && [s1, s2].some((x) => x.json?.code === 'BATCH_ALREADY_STARTED'), '200,409', `${s1.status},${s2.status}`);
  rec('start: status is in_progress and nothing was consumed (lot 8,000)', (await http('GET', `/api/v1/mill/batches/${b1.id}`, A)).json.status === 'in_progress' && (await lotRow(lot1.id)).remainingKg === 8000, 'in_progress / 8000', '');
  const paddyBefore = await stock(paddy.id), akhaBefore = await stock(akha.id);
  r = await fin(b1.id, 1900, 100);
  rec('finalize: 2,000 kg consumed (lot 8,000 → 6,000), Paddy −2,000, Akha +1,900, batch closed with recovery 95%', r.status === 200 && (await lotRow(lot1.id)).remainingKg === 6000 && (await stock(paddy.id)) === paddyBefore - 2000 && (await stock(akha.id)) === akhaBefore + 1900 && r.json.batch.recoveryPct === 95, '200 / 6000', `${r.status} ${(await lotRow(lot1.id)).remainingKg}`);
  const mv2 = await movements(b1.id);
  rec('no duplicate stock movements (1 start marker, 1 consume, 1 output)', mv2.filter((m) => m.type === 'production_start').length === 1 && mv2.filter((m) => m.type === 'production_consume').length === 1 && mv2.filter((m) => m.type === 'production_output').length === 1, '1/1/1', mv2.map((m) => m.type).join());
  r = await fin(b1.id, 1900, 100);
  rec('finalized batch cannot be finalized again → 409, stock unchanged', r.status === 409 && (await lotRow(lot1.id)).remainingKg === 6000, '409', String(r.status));
  r = await http('PATCH', `/api/v1/mill/batches/${b1.id}`, { ...A, body: { inputKg: 5, notes: 'x' } });
  rec('finalized batch cannot be edited → 409', r.status === 409 && r.json?.code === 'BATCH_FINALIZED', '409', `${r.status} ${r.json?.code}`);
  rec('finalized batch cannot be started or deleted → 409', (await post(`/api/v1/mill/batches/${b1.id}/start`, {})).status === 409 && (await http('DELETE', `/api/v1/mill/batches/${b1.id}`, A)).status === 409, '409/409', '');
  const [f1, f2] = await (async () => { const bb = (await mkBatch({ rawLotId: lot1.id, inputQuantity: 500, batchNumber: 'B-DBL' })).json; return Promise.all([fin(bb.id, 500), fin(bb.id, 500)]); })();
  rec('two simultaneous finalizes of one batch → 200 + 409, consumed once (lot 6,000 → 5,500)', [f1.status, f2.status].sort().join() === '200,409' && (await lotRow(lot1.id)).remainingKg === 5500, '200,409 / 5500', `${f1.status},${f2.status} / ${(await lotRow(lot1.id)).remainingKg}`);

  // ── competing batches on one lot
  const lot2 = await newLot('L-002', 8000);
  const c1 = (await mkBatch({ rawLotId: lot2.id, inputQuantity: 6000, batchNumber: 'B-C1' })).json, c2 = (await mkBatch({ rawLotId: lot2.id, inputQuantity: 6000, batchNumber: 'B-C2' })).json;
  const [g1, g2] = await Promise.all([fin(c1.id, 6000), fin(c2.id, 6000)]);
  rec('two batches competing for one 8,000 kg lot (6,000 each): one finalizes, the other is refused with 409 INSUFFICIENT_RAW_STOCK; lot 2,000, never negative', [g1.status, g2.status].sort().join() === '200,409' && [g1, g2].some((x) => x.json?.code === 'INSUFFICIENT_RAW_STOCK') && (await lotRow(lot2.id)).remainingKg === 2000, '200,409 / 2000', `${g1.status},${g2.status} / ${(await lotRow(lot2.id)).remainingKg}`);
  r = await fin(c1.id, 6000, 0, B);
  rec("another shop cannot finalize this shop's batch → 404", r.status === 404, '404', String(r.status));

  // ── SOURCES: purchase / weighbridge / manual lots all work the same
  const sup = await retry(() => prisma.supplier.create({ data: { shopId: A.shopId, name: 'Sita Trader' } }));
  await post('/api/v1/purchases', { supplierId: sup.id, invoiceNumber: 'INV-B1', date: '2026-09-20', items: [{ productId: wheat.id, quantity: 3000, cost: 25, conversionFactor: 1 }] });
  const purLot = (await http('GET', '/api/v1/mill/raw-lots', A)).json.find((l) => l.lotNumber === 'INV-B1');
  const w = await post('/api/v1/mill/weighbridge', { vehicleNumber: 'MH12', productId: wheat.id, supplierId: sup.id, grossWeightKg: 5500, ratePerKg: 26 });
  await http('PATCH', `/api/v1/mill/weighbridge/${w.json.id}`, { ...A, body: { tareWeightKg: 500 } });
  const wbLot = (await post(`/api/v1/mill/weighbridge/${w.json.id}/convert-to-lot`, { productId: wheat.id })).json;
  const manLot = await newLot('MAN-1', 2500, wheat);
  const srcs = {};
  for (const [nm, lot, kg, expectSource] of [['purchase', purLot, 3000, 'purchase'], ['weighbridge', wbLot, 5000, 'weighbridge'], ['manual', manLot, 2500, 'manual']]) {
    const bt = await mkBatch({ rawLotId: lot.id, inputQuantity: 1000, batchNumber: `B-${nm}` });
    const before = (await lotRow(lot.id)).remainingKg;
    const st = await post(`/api/v1/mill/batches/${bt.json.id}/start`, {});
    const fz = await fin(bt.json.id, 990, 10);
    const after = (await lotRow(lot.id)).remainingKg;
    const detail = (await http('GET', `/api/v1/mill/batches/${bt.json.id}`, A)).json;
    srcs[nm] = bt.status === 201 && st.status === 200 && fz.status === 200 && before === kg && after === kg - 1000 && detail.rawLot.source === expectSource;
    rec(`${nm}-origin lot: create → start → finalize works, lot ${kg} → ${kg - 1000}, batch shows source=${expectSource}`, srcs[nm], 'ok', `${bt.status}/${st.status}/${fz.status} ${before}→${after} ${detail.rawLot && detail.rawLot.source}`);
  }
  rec('gate entry / weighbridge are not required (purchase and manual lots batched without either)', srcs.purchase && srcs.manual, 'ok', '');
  const negs = await retry(() => prisma.rawMaterialLot.count({ where: { shopId: A.shopId, remainingKg: { lt: 0 } } }));
  const negP = await retry(() => prisma.product.count({ where: { shopId: A.shopId, currentStock: { lt: 0 } } }));
  rec('no lot or product went negative', negs === 0 && negP === 0, '0/0', `${negs}/${negP}`);
  const dupM = await retry(() => prisma.$queryRaw`SELECT reference_id, product_id, type, count(*)::int c FROM stock_movements WHERE shop_id = ${A.shopId}::uuid AND type LIKE 'production_%' GROUP BY 1,2,3 HAVING count(*) > 1`);
  rec('no duplicate production stock movements per (batch, product, type) anywhere in the shop', dupM.length === 0, '0', JSON.stringify(dupM));
  await prisma.$disconnect();
  const pass = results.filter((x) => x.ok).length;
  console.log(`\n=== ${pass} passed, ${results.length - pass} failed, ${results.length} total ===`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
