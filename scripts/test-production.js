/* eslint-disable */
/**
 * Mill production workflow (raw lot → production batch → finalize → outputs/stock) tests.
 *
 *   node scripts/test-production.js                       # UNIT tests only (no DB, no server)
 *   LIVE=1 BASE=http://127.0.0.1:3001 node scripts/test-production.js
 *        # + API / stock / concurrency tests. Needs the additive production_outputs table (db/production_outputs.sql) and the dev
 *        #   server running. Uses throwaway isolation-test-prod-* tenants (swept by CLEANUP_ONLY=1 node scripts/test-isolation.js).
 */
const path = require('path'), fs = require('fs'), Module = require('module');
const ts = require(path.join(process.cwd(), 'node_modules/typescript'));
const LIVE = process.env.LIVE === '1';
const BASE = process.env.BASE || 'http://127.0.0.1:3001';
const results = [];
const rec = (name, ok, exp, act) => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      expected: ${exp}\n      actual:   ${act}`}`); };
class StubApiError extends Error { constructor(s, m, c) { super(m); this.status = s; this.code = c; } }
function loadTs(rel) {
  const file = path.join(process.cwd(), rel);
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(process.cwd());
  const req = m.require.bind(m);
  m.require = (id) => { if (id === '@/lib/server/http') return { ApiError: StubApiError }; if (id.startsWith('@/')) return loadTs(id.slice(2) + '.ts'); return req(id); };
  m._compile(out, file); return m.exports;
}
const throwsCode = (fn) => { try { fn(); return null; } catch (e) { return e.code || 'ERR'; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function unit() {
  const M = loadTs('lib/server/millProduction.ts');
  rec('unit: kg / g / quintal / ton conversion', M.toKg(10000, 'kg') === 10000 && M.toKg(500, 'g') === 0.5 && M.toKg(2, 'quintal') === 200 && M.toKg(1.5, 'ton') === 1500, 'ok', '');
  rec('unit: non-weight unit (bag) rejected', throwsCode(() => M.toKg(5, 'bag')) === 'UNIT_NOT_WEIGHT', 'UNIT_NOT_WEIGHT', String(throwsCode(() => M.toKg(5, 'bag'))));
  rec('unit: product stocked in a non-weight unit cannot receive output', throwsCode(() => M.kgToProductUnit(10, 'piece', 'X')) === 'PRODUCT_UNIT_NOT_WEIGHT', 'PRODUCT_UNIT_NOT_WEIGHT', '');
  rec('unit: kg credited in a quintal product = kg/100', M.kgToProductUnit(6800, 'quintal', 'Akha') === 68, '68', String(M.kgToProductUnit(6800, 'quintal', 'Akha')));
  const spec = M.checkBalance(10000, 6800 + 1200 + 500 + 1300 + 100, 100);
  rec('balance: 10,000 = 9,900 outputs + 100 loss → balanced', spec.ok && spec.differenceKg === 0, 'ok', JSON.stringify(spec));
  const over = M.checkBalance(10000, 12000, 0);
  rec('balance: outputs 12,000 > input 10,000 → not balanced, difference −2,000', !over.ok && over.differenceKg === -2000, '-2000', JSON.stringify(over));
  const gap = M.checkBalance(10000, 9000, 0);
  rec('balance: 1,000 kg unexplained → not balanced, difference +1,000', !gap.ok && gap.differenceKg === 1000, '1000', JSON.stringify(gap));
  rec('balance: 3 g rounding tolerated, 10 g is not', M.checkBalance(10, 9.997, 0).ok && !M.checkBalance(10, 9.99, 0).ok, 'ok', '');
  const rows = M.parseOutputs([{ outputType: 'finished_good', productId: 'p1', quantity: 6800, unit: 'kg' }, { outputType: 'by_product', name: 'Husk', quantity: 1, unit: 'quintal' }]);
  rec('parse: output names/types are free-form (no fixed rice list); quintal → kg', rows.length === 2 && rows[1].name === 'Husk' && rows[1].quantityKg === 100, 'ok', JSON.stringify(rows[1]));
  rec('parse: finished good without a product rejected', throwsCode(() => M.parseOutputs([{ outputType: 'finished_good', name: 'Akha', quantity: 5 }])) === 'PRODUCT_REQUIRED', 'PRODUCT_REQUIRED', '');
  rec('parse: unknown output type rejected', throwsCode(() => M.parseOutputs([{ outputType: 'akha', name: 'x', quantity: 5 }])) === 'INVALID_OUTPUT_TYPE', 'INVALID_OUTPUT_TYPE', '');
  rec('parse: zero / negative / NaN quantity rejected', ['0', -1, 'abc'].every((q) => throwsCode(() => M.parseOutputs([{ outputType: 'by_product', name: 'x', quantity: q }])) === 'INVALID_OUTPUT_QUANTITY'), 'all rejected', '');
  rec('parse: empty output list rejected', throwsCode(() => M.parseOutputs([])) === 'OUTPUTS_REQUIRED', 'OUTPUTS_REQUIRED', '');
  rec('loss: negative rejected, blank = 0', throwsCode(() => M.parseLossKg(-5)) === 'INVALID_LOSS' && M.parseLossKg('') === 0, 'ok', '');
}

async function live() {
  const { PrismaClient } = require(path.join(process.cwd(), 'node_modules/@prisma/client'));
  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^(DATABASE_URL|DIRECT_URL)=(.*)$/); if (!m || process.env[m[1]]) continue;
    let v = m[2].trim(); v = /^["']/.test(v) ? v.replace(/^(["'])(.*?)\1.*$/, '$2') : v.replace(/\s+#.*$/, ''); process.env[m[1]] = v;
  }
  const prisma = new PrismaClient(); const TAG = `isolation-test-prod-${Date.now()}`; const PW = 'Test#12345Password';
  const INFRA = /Can't reach database|Unable to start a transaction|Transaction already closed|Transaction not found|Timed out|Server has closed|ECONN|fetch failed/i;
  const retry = async (fn) => { for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (i >= 5 || !INFRA.test(String(e.message))) throw e; await sleep(15000); } } };
  async function http1(method, url, { token, shopId, body } = {}) {
    const h = { 'Content-Type': 'application/json' }; if (token) h.Authorization = 'Bearer ' + token; if (shopId) h['x-shop-id'] = shopId;
    const res = await fetch(BASE + url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {} return { status: res.status, json, text };
  }
  async function http(method, url, o) { let r = await http1(method, url, o).catch((e) => ({ status: 0, text: String(e) })); for (let i = 0; i < 3 && (r.status === 0 || (r.status === 500 && INFRA.test(r.text))); i++) { await sleep(15000); r = await http1(method, url, o).catch((e) => ({ status: 0, text: String(e) })); } return r; }
  async function tenant(label, pkg) {
    const email = `${TAG}-${label}@example.invalid`;
    const r = await http('POST', '/api/v1/auth/register', { body: { email, password: PW, name: `P ${label}`, shop_name: `${TAG}-${label}-shop`, business_type: 'kirana', package_type: pkg } });
    if (r.status !== 201) throw new Error(`register ${label}: ${r.status} ${String(r.text).slice(0, 150)}`);
    const user = await retry(() => prisma.user.findUnique({ where: { email } })); const shop = await retry(() => prisma.shop.findFirst({ where: { ownerId: user.uuid } }));
    return { token: r.json.access_token, shopId: shop.id };
  }
  try { await prisma.$queryRaw`SELECT 1 FROM production_outputs LIMIT 1`; } catch { rec('LIVE prerequisite: production_outputs table exists', false, 'table present', 'missing — apply db/production_outputs.sql first'); await prisma.$disconnect(); return; }

  const A = await tenant('bada', 'badaudyog'), D = await tenant('dukan', 'dukan'), O = await tenant('other', 'badaudyog');
  const mk = (t, name, cat, stock, unit = 'kg') => retry(() => prisma.product.create({ data: { shopId: t.shopId, name: `${TAG}-${name}`, millCategory: cat, currentStock: stock, baseUnit: unit, sellingPrice: 50, costPrice: 30, gstPercent: 0 } }));
  const paddy = await mk(A, 'Paddy', 'raw_material', 50000);
  const [akha, tukada, konda, bhusa, reject] = [await mk(A, 'Akha Rice', 'finished_goods', 0), await mk(A, 'Tukada', 'finished_goods', 0), await mk(A, 'Konda', 'by_product', 0), await mk(A, 'Bhusa', 'by_product', 0), await mk(A, 'Rejection', 'by_product', 0)];
  const foreign = await mk(O, 'ForeignRice', 'finished_goods', 0);
  const bagProd = await mk(A, 'BagProduct', 'finished_goods', 0, 'bag');
  const mkLot = (num, kg, productId = paddy.id) => retry(() => prisma.rawMaterialLot.create({ data: { shopId: A.shopId, productId, lotNumber: num, weightKg: kg, remainingKg: kg } }));
  const lot = await mkLot('P-001', 50000);
  const P = { token: A.token, shopId: A.shopId };
  const stock = async (id) => (await retry(() => prisma.product.findUnique({ where: { id } }))).currentStock ?? 0;
  const lotRem = async (id) => (await retry(() => prisma.rawMaterialLot.findUnique({ where: { id } }))).remainingKg;
  const mkBatch = (o) => http('POST', '/api/v1/mill/batches', { ...P, body: o });
  const fin = (id, body) => http('POST', `/api/v1/mill/batches/${id}/finalize`, { ...P, body });
  const goodOutputs = [
    { outputType: 'finished_good', productId: akha.id, quantity: 6800, unit: 'kg' },
    { outputType: 'finished_good', productId: tukada.id, quantity: 1200, unit: 'kg' },
    { outputType: 'by_product', productId: konda.id, quantity: 500, unit: 'kg' },
    { outputType: 'by_product', productId: bhusa.id, quantity: 1300, unit: 'kg' },
    { outputType: 'rejection', productId: reject.id, quantity: 100, unit: 'kg' },
  ];

  // ── create
  let r = await mkBatch({ inputKg: 10000, stages: ['Cleaning', 'Grinding', 'Sieving', 'Packing'] });
  rec('create without a raw lot → 400 RAW_LOT_REQUIRED', r.status === 400 && r.json?.code === 'RAW_LOT_REQUIRED', '400', `${r.status} ${r.json?.code}`);
  r = await mkBatch({ rawLotId: lot.id, inputKg: 60000 });
  rec('create with input > lot stock → 400 INSUFFICIENT_RAW_STOCK', r.status === 400 && r.json?.code === 'INSUFFICIENT_RAW_STOCK', '400', `${r.status} ${r.json?.code}`);
  const noProdLot = await mkLot('NOPROD', 1000, null);
  r = await mkBatch({ rawLotId: noProdLot.id, inputKg: 100 });
  rec('create from a lot not linked to a raw material product → 400 RAW_PRODUCT_REQUIRED', r.status === 400 && r.json?.code === 'RAW_PRODUCT_REQUIRED', '400', `${r.status} ${r.json?.code}`);
  r = await mkBatch({ rawLotId: lot.id, inputKg: 10000, batchNumber: 'PB-001', stages: ['Cleaning', 'Grinding', 'Sieving', 'Packing'] });
  const b1 = r.json;
  rec('create PB-001: 10,000 kg from lot P-001, user-defined stages, batch number preserved', r.status === 201 && b1.batchNumber === 'PB-001' && b1.stages.map((s) => s.stageName).join() === 'Cleaning,Grinding,Sieving,Packing' && b1.currentStage === 'Cleaning', '201 PB-001', `${r.status} ${b1?.batchNumber}`);
  rec('create does NOT consume stock yet (lot and Paddy unchanged)', (await lotRem(lot.id)) === 50000 && (await stock(paddy.id)) === 50000, '50000 / 50000', `${await lotRem(lot.id)} / ${await stock(paddy.id)}`);
  r = await http('POST', '/api/v1/mill/batches', { ...P, body: { rawLotId: lot.id, inputKg: 1, batchNumber: 'PB-001' } });
  rec('duplicate batch number → rejected (no 500)', r.status >= 400 && r.status < 500, '4xx', String(r.status));
  r = await http('PATCH', `/api/v1/mill/batches/${b1.id}`, { ...P, body: { status: 'closed', outputKg: 9999 } });
  rec('closing through PATCH is refused (USE_FINALIZE)', r.status === 400 && r.json?.code === 'USE_FINALIZE', '400', `${r.status} ${r.json?.code}`);
  r = await http('PATCH', `/api/v1/mill/batches/${b1.id}/stages/${b1.stages[0].id}`, { ...P, body: { outputKg: 10000, completed: true } });
  rec('completing a stage advances to the NEXT user-defined stage (Grinding), not a fixed rice list', r.status === 200 && r.json?.currentStage === 'Grinding', 'Grinding', String(r.json?.currentStage));

  // ── rejected finalizations leave everything untouched
  const untouched = async (label) => rec(`${label}: nothing changed (lot 50,000 · Paddy 50,000 · Akha 0 · batch still open)`, (await lotRem(lot.id)) === 50000 && (await stock(paddy.id)) === 50000 && (await stock(akha.id)) === 0 && (await retry(() => prisma.productionBatch.findUnique({ where: { id: b1.id } }))).status !== 'closed', 'unchanged', '');
  r = await fin(b1.id, { outputs: [{ outputType: 'finished_good', productId: akha.id, quantity: 12000 }], lossKg: 0 });
  rec('outputs 12,000 > input 10,000 → 400 MASS_BALANCE_MISMATCH', r.status === 400 && r.json?.code === 'MASS_BALANCE_MISMATCH', '400', `${r.status} ${r.json?.code}`); await untouched('over-output');
  r = await fin(b1.id, { outputs: [{ outputType: 'finished_good', productId: akha.id, quantity: 9000 }], lossKg: 0 });
  rec('1,000 kg unexplained → 400 MASS_BALANCE_MISMATCH', r.status === 400 && r.json?.code === 'MASS_BALANCE_MISMATCH', '400', `${r.status} ${r.json?.code}`); await untouched('unexplained difference');
  r = await fin(b1.id, { outputs: [{ outputType: 'finished_good', name: 'Akha', quantity: 9900 }], lossKg: 100 });
  rec('finished good without a product → 400 PRODUCT_REQUIRED (no product is created from free text)', r.status === 400 && r.json?.code === 'PRODUCT_REQUIRED', '400', `${r.status} ${r.json?.code}`);
  r = await fin(b1.id, { outputs: [{ outputType: 'finished_good', productId: foreign.id, quantity: 9900 }], lossKg: 100 });
  rec("another shop's product → 400 PRODUCT_NOT_FOUND", r.status === 400 && r.json?.code === 'PRODUCT_NOT_FOUND', '400', `${r.status} ${r.json?.code}`);
  r = await fin(b1.id, { outputs: [{ outputType: 'finished_good', productId: bagProd.id, quantity: 9900 }], lossKg: 100 });
  rec('product stocked in bags cannot receive a weight output → 400', r.status === 400 && r.json?.code === 'PRODUCT_UNIT_NOT_WEIGHT', '400', `${r.status} ${r.json?.code}`);
  r = await fin(b1.id, { outputs: [{ outputType: 'finished_good', productId: akha.id, quantity: 9900, unit: 'bag' }], lossKg: 100 });
  rec('unit "bag" → 400 UNIT_NOT_WEIGHT', r.status === 400 && r.json?.code === 'UNIT_NOT_WEIGHT', '400', `${r.status} ${r.json?.code}`);
  await untouched('all rejected finalizations');
  await http('POST', `/api/v1/mill/batches/${b1.id}/finalize`, { token: O.token, shopId: O.shopId, body: { outputs: goodOutputs, lossKg: 100 } }).then((x) => rec("another shop cannot finalize this batch (404)", x.status === 404, '404', String(x.status)));
  await untouched('cross-shop attempt');

  // ── the specified scenario
  r = await fin(b1.id, { outputs: goodOutputs, lossKg: 100 });
  rec('FINALIZE PB-001: 10,000 in = 9,900 outputs + 100 loss → 200', r.status === 200, '200', `${r.status} ${r.text?.slice(0, 200)}`);
  const s = { lot: await lotRem(lot.id), paddy: await stock(paddy.id), akha: await stock(akha.id), tukada: await stock(tukada.id), konda: await stock(konda.id), bhusa: await stock(bhusa.id), reject: await stock(reject.id) };
  rec('stock: Paddy 50,000→40,000 · Akha +6,800 · Tukada +1,200 · Konda +500 · Bhusa +1,300 · Rejection +100', s.lot === 40000 && s.paddy === 40000 && s.akha === 6800 && s.tukada === 1200 && s.konda === 500 && s.bhusa === 1300 && s.reject === 100, JSON.stringify({ lot: 40000, paddy: 40000, akha: 6800, tukada: 1200, konda: 500, bhusa: 1300, reject: 100 }), JSON.stringify(s));
  const outs = await retry(() => prisma.productionOutput.findMany({ where: { batchId: b1.id } }));
  rec('traceability: 5 ProductionOutput rows, each with the production batch id, product, kg and lot number PB-001', outs.length === 5 && outs.every((o) => o.batchId === b1.id && o.productId && o.outputLotNumber === 'PB-001') && Math.round(outs.reduce((a, o) => a + o.quantityKg, 0)) === 9900, '5 rows / 9900 kg', `${outs.length}`);
  const lots = await retry(() => prisma.batch.findMany({ where: { shopId: A.shopId, batchNumber: 'PB-001' } }));
  rec('batch-wise stock: a PB-001 lot row per tracked output (Akha lot = 6,800)', lots.length === 5 && lots.find((l) => l.productId === akha.id)?.quantity === 6800, '5 lots', `${lots.length}`);
  const bps = await retry(() => prisma.byProduct.findMany({ where: { batchId: b1.id } }));
  rec('By-Products ledger: Konda + Bhusa recorded against PB-001', bps.length === 2 && bps.some((b) => b.quantityKg === 500) && bps.some((b) => b.quantityKg === 1300), '2 rows', `${bps.length}`);
  const pb = await retry(() => prisma.productionBatch.findUnique({ where: { id: b1.id } }));
  rec('batch closed: finished output 8,000 kg, loss 100 kg, recovery 80%, input unchanged', pb.status === 'closed' && pb.outputKg === 8000 && pb.wastageKg === 100 && pb.recoveryPct === 80 && pb.inputKg === 10000 && pb.closedAt, 'closed / 8000 / 100 / 80', JSON.stringify({ s: pb.status, o: pb.outputKg, w: pb.wastageKg, r: pb.recoveryPct }));
  const mv = await retry(() => prisma.stockMovement.findMany({ where: { shopId: A.shopId, referenceId: b1.id } }));
  rec('stock movements: consume −10,000 (Paddy), 5 output movements, start marker', mv.some((m) => m.type === 'production_consume' && m.quantity === -10000) && mv.filter((m) => m.type.startsWith('production_') && m.quantity > 0).length === 5, 'ok', mv.map((m) => m.type + m.quantity).join());
  const detail = await http('GET', `/api/v1/mill/batches/${b1.id}`, P);
  rec('GET batch detail returns the outputs', detail.status === 200 && detail.json.outputs?.length === 5, '5 outputs', String(detail.json?.outputs?.length));
  const prodList = await http('GET', '/api/v1/products', P);
  rec('Product Master / Stock see the new stock (Akha 6,800 via /products)', prodList.status === 200 && (prodList.json.items || prodList.json).find?.((p) => p.id === akha.id)?.currentStock === 6800, '6800', '');

  // ── after finalization
  r = await fin(b1.id, { outputs: goodOutputs, lossKg: 100 });
  rec('finalizing again → 409 BATCH_ALREADY_FINALIZED, stock not doubled', r.status === 409 && r.json?.code === 'BATCH_ALREADY_FINALIZED' && (await stock(akha.id)) === 6800 && (await lotRem(lot.id)) === 40000, '409', `${r.status} ${r.json?.code}`);
  r = await http('PATCH', `/api/v1/mill/batches/${b1.id}`, { ...P, body: { notes: 'x', inputKg: 5 } });
  rec('editing a finalized batch → 409 BATCH_FINALIZED', r.status === 409 && r.json?.code === 'BATCH_FINALIZED', '409', `${r.status} ${r.json?.code}`);
  r = await http('DELETE', `/api/v1/mill/batches/${b1.id}`, P);
  rec('deleting a finalized batch → 409 (no silent stock change)', r.status === 409 && (await stock(akha.id)) === 6800, '409', String(r.status));

  // ── concurrency A: two DIFFERENT batches, one lot that only covers one of them
  const lot2 = await mkLot('P-002', 10000);
  const c1 = (await mkBatch({ rawLotId: lot2.id, inputKg: 8000, batchNumber: 'PB-C1' })).json, c2 = (await mkBatch({ rawLotId: lot2.id, inputKg: 8000, batchNumber: 'PB-C2' })).json;
  rec('two 8,000 kg batches can both be OPENED against a 10,000 kg lot (nothing consumed yet)', !!c1?.id && !!c2?.id, 'both 201', '');
  const paddyBefore = await stock(paddy.id), akhaBefore = await stock(akha.id);
  const out8 = (n) => ({ outputs: [{ outputType: 'finished_good', productId: akha.id, quantity: 7900 }], lossKg: 100 });
  const [f1, f2] = await Promise.all([fin(c1.id, out8()), fin(c2.id, out8())]);
  const codes = [f1.status, f2.status].sort();
  rec('CONCURRENT finalize on the same limited lot: exactly one succeeds (200), the other is refused (409 INSUFFICIENT_RAW_STOCK)', codes[0] === 200 && codes[1] === 409 && [f1, f2].some((x) => x.json?.code === 'INSUFFICIENT_RAW_STOCK'), '200 + 409', `${f1.status}/${f1.json?.code} ${f2.status}/${f2.json?.code}`);
  rec('no double consumption: lot 10,000→2,000, Paddy −8,000 once, Akha +7,900 once, never negative', (await lotRem(lot2.id)) === 2000 && (await stock(paddy.id)) === paddyBefore - 8000 && (await stock(akha.id)) === akhaBefore + 7900, `lot 2000 / ${paddyBefore - 8000} / ${akhaBefore + 7900}`, `${await lotRem(lot2.id)} / ${await stock(paddy.id)} / ${await stock(akha.id)}`);
  // ── concurrency B: the SAME batch submitted twice at once
  const lot3 = await mkLot('P-003', 5000);
  const d1 = (await mkBatch({ rawLotId: lot3.id, inputKg: 1000, batchNumber: 'PB-D1' })).json;
  const akha2 = await stock(akha.id);
  const dbl = await Promise.all([fin(d1.id, { outputs: [{ outputType: 'finished_good', productId: akha.id, quantity: 1000 }] }), fin(d1.id, { outputs: [{ outputType: 'finished_good', productId: akha.id, quantity: 1000 }] })]);
  rec('CONCURRENT double-submit of one batch: one 200, one 409; consumed and credited exactly once', dbl.map((x) => x.status).sort().join() === '200,409' && (await lotRem(lot3.id)) === 4000 && (await stock(akha.id)) === akha2 + 1000 && (await retry(() => prisma.productionOutput.count({ where: { batchId: d1.id } }))) === 1, '200,409 / 4000 / +1000 / 1 row', `${dbl.map((x) => x.status)} / ${await lotRem(lot3.id)}`);

  // ── extra balance cases + server-side conversion
  const lot5 = await mkLot('P-005', 30000);
  const g1 = (await mkBatch({ rawLotId: lot5.id, inputKg: 10000, batchNumber: 'PB-G1' })).json;
  r = await fin(g1.id, { outputs: [{ outputType: 'finished_good', productId: akha.id, quantity: 10100 }], lossKg: 0 });
  rec('input 10,000 vs outputs 10,100 → 4xx', r.status === 400 && r.json?.code === 'MASS_BALANCE_MISMATCH', '400', `${r.status} ${r.json?.code}`);
  r = await fin(g1.id, { outputs: [{ outputType: 'finished_good', productId: akha.id, quantity: 9500 }], lossKg: 0 });
  rec('input 10,000 vs outputs 9,500, loss 0 → 4xx (unexplained 500)', r.status === 400 && r.json?.code === 'MASS_BALANCE_MISMATCH', '400', `${r.status} ${r.json?.code}`);
  r = await fin(g1.id, { outputs: [{ outputType: 'finished_good', productId: akha.id, quantity: 9500 }], lossKg: 5 });
  rec('outputs 9,500 + loss 5 (495 short) → 4xx', r.status === 400, '400', String(r.status));
  const akha3 = await stock(akha.id);
  r = await fin(g1.id, { outputs: [{ outputType: 'finished_good', productId: akha.id, quantity: 9500, quantityKg: 1, output_type: 'x' }], lossKg: 500 });
  rec('outputs 9,500 + loss 500 → success', r.status === 200 && (await stock(akha.id)) === akha3 + 9500 && (await lotRem(lot5.id)) === 20000, '200 / +9500 / lot 20000', `${r.status}`);
  const g1o = await retry(() => prisma.productionOutput.findMany({ where: { batchId: g1.id } }));
  rec('client-supplied quantityKg is ignored — server stored 9,500', g1o.length === 1 && g1o[0].quantityKg === 9500, '9500', String(g1o[0]?.quantityKg));
  const lot6 = await mkLot('P-006', 5000);
  const g2 = (await mkBatch({ rawLotId: lot6.id, inputKg: 1000, batchNumber: 'PB-G2' })).json;
  r = await fin(g2.id, { outputs: [{ outputType: 'finished_good', productId: akha.id, quantity: 5, unit: 'quintal' }, { outputType: 'by_product', name: 'Dust', quantity: 400000, unit: 'g' }, { outputType: 'rejection', name: 'Stones', quantity: 0.0001, unit: 'ton' }], lossKg: 99.9 });
  const g2o = await retry(() => prisma.productionOutput.findMany({ where: { batchId: g2.id }, orderBy: { quantityKg: 'desc' } }));
  rec('server converts units: 5 quintal=500 kg, 400,000 g=400 kg, 0.0001 ton=0.1 kg; untracked by-product/rejection create no stock rows', r.status === 200 && g2o.map((o) => o.quantityKg).join() === '500,400,0.1' && g2o.filter((o) => !o.productId).length === 2, '500,400,0.1', `${r.status} ${g2o.map((o) => o.quantityKg)}`);
  r = await fin((await mkBatch({ rawLotId: lot6.id, inputKg: 100, batchNumber: 'PB-G3' })).json.id, { outputs: [{ outputType: 'waste', name: 'x', quantity: 100 }] });
  rec('arbitrary output type rejected', r.status === 400 && r.json?.code === 'INVALID_OUTPUT_TYPE', '400', `${r.status} ${r.json?.code}`);
  const negBefore = await retry(() => prisma.product.count({ where: { shopId: A.shopId, currentStock: { lt: 0 } } }));
  rec('no product in the shop went negative', negBefore === 0, '0', String(negBefore));
  const dupMv = await retry(() => prisma.$queryRaw`SELECT reference_id, product_id, type, count(*)::int c FROM stock_movements WHERE shop_id = ${A.shopId}::uuid AND type LIKE 'production_%' AND type <> 'production_start' GROUP BY 1,2,3 HAVING count(*) > 1`);
  rec('no duplicate stock movements per (batch, product, type)', dupMv.length === 0, '0 dupes', JSON.stringify(dupMv));

  // ── open-batch delete + legacy batches
  const e1 = (await mkBatch({ rawLotId: lot3.id, inputKg: 500, batchNumber: 'PB-E1' })).json;
  r = await http('DELETE', `/api/v1/mill/batches/${e1.id}`, P);
  rec('deleting an OPEN batch started under the new flow returns nothing to the lot (it consumed nothing)', r.status === 200 && (await lotRem(lot3.id)) === 4000, '200 / 4000', `${r.status} / ${await lotRem(lot3.id)}`);
  const lot4 = await mkLot('P-004', 3000);
  const legacy = await retry(() => prisma.productionBatch.create({ data: { shopId: A.shopId, batchNumber: 'PB-LEGACY', rawLotId: lot4.id, inputKg: 1000, status: 'open', currentStage: 'cleaning' } }));
  await retry(() => prisma.rawMaterialLot.update({ where: { id: lot4.id }, data: { remainingKg: 2000 } }));   // the old flow took the kilos out at creation
  r = await fin(legacy.id, { outputs: [{ outputType: 'finished_good', productId: akha.id, quantity: 1000 }] });
  rec('a batch started by the OLD flow (no marker) is not charged a second time on finalize', r.status === 200 && (await lotRem(lot4.id)) === 2000, '200 / 2000', `${r.status} / ${await lotRem(lot4.id)}`);

  // ── regressions
  r = await http('GET', '/api/v1/mill/by-products', P);
  rec('By-Products list works and shows the production by-products', r.status === 200 && r.json.filter((b) => b.batch?.batchNumber === 'PB-001').length === 2, '2 rows', String(r.json?.length));
  r = await http('GET', '/api/v1/mill/raw-lots?status=available', P);
  rec('Raw-lots list works (P-001 shows 40,000 remaining)', r.status === 200 && r.json.find((l) => l.lotNumber === 'P-001')?.remainingKg === 40000, '40000', '');
  const dp = await mk(D, 'DukanItem', null, 100, 'pcs');
  r = await http('POST', '/api/v1/billing', { token: D.token, shopId: D.shopId, body: { payment_type: 'Cash', items: [{ product_id: dp.id, quantity: 2, price_per_unit: 50 }] } });
  rec('Dukan billing unaffected (201, stock 100→98)', r.status === 201 && (await stock(dp.id)) === 98, '201 / 98', `${r.status} / ${await stock(dp.id)}`);
  r = await http('GET', '/api/v1/reports/dashboard', P);
  rec('Dashboard endpoint unaffected (200)', r.status === 200 && r.json.summary, '200', String(r.status));
  await prisma.$disconnect();
}

(async () => {
  unit();
  if (LIVE) await live(); else console.log('\n(LIVE=1 not set — API/stock/concurrency tests skipped)');
  const pass = results.filter((x) => x.ok).length;
  console.log(`\n=== ${pass} passed, ${results.length - pass} failed, ${results.length} total ===`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
