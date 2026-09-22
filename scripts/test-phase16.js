/* eslint-disable */
/**
 * Phase 1.6 tests: APP_URL production hardening, renewal URL/legacy-plan helpers,
 * and stock/adjust atomicity.
 *
 *   node scripts/test-phase16.js               # unit + direct-DB atomicity tests
 *   LIVE=1 BASE=http://localhost:3001 node scripts/test-phase16.js   # + live checks against the dev server
 *
 * DB tests use throwaway shops named isolation-test-* (removed at the end). No secret
 * or environment values are printed.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Module = require('module');
const { spawnSync } = require('child_process');
const ts = require(path.join(process.cwd(), 'node_modules/typescript'));
const { PrismaClient } = require(path.join(process.cwd(), 'node_modules/@prisma/client'));

(function loadEnv() {
  const want = ['DATABASE_URL', 'DIRECT_URL', 'RENEWAL_LINK_SECRET', 'APP_URL'];
  let txt = ''; try { txt = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8'); } catch {}
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || !want.includes(m[1]) || process.env[m[1]]) continue;
    let v = m[2].trim();
    if (/^["']/.test(v)) v = v.replace(/^(["'])(.*?)\1.*$/, '$2'); else v = v.replace(/\s+#.*$/, '');
    process.env[m[1]] = v;
  }
})();

const BASE = process.env.BASE || 'http://localhost:3001';
const LIVE = process.env.LIVE === '1';
const prisma = new PrismaClient();
const TAG = `isolation-test-p16-${Date.now()}`;
const results = [];
function record(name, ok, expected, actual) {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      expected: ${expected}\n      actual:   ${actual}`);
}

class StubApiError extends Error { constructor(status, msg, code) { super(msg); this.status = status; this.code = code; } }
function loadTs(rel) {
  const file = path.join(process.cwd(), rel);
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(process.cwd());
  const req = m.require.bind(m);
  m.require = (id) => {
    if (id === '@/lib/server/http') return { ApiError: StubApiError };
    if (id.startsWith('.')) { const p = path.resolve(path.dirname(file), id); return loadTs(path.relative(process.cwd(), fs.existsSync(p + '.ts') ? p + '.ts' : p)); }
    return req(id);
  };
  m._compile(out, file);
  return m.exports;
}
async function http(method, url, { body, headers = {} } = {}) {
  const h = { ...headers }; if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

async function main() {
  // ══ 1. APP_URL resolver ═══════════════════════════════════════════════════
  const { resolveAppUrl } = loadTs('lib/server/appUrl.ts');
  let msg = throws(() => resolveAppUrl({ NODE_ENV: 'production' }));
  record('APP_URL: production + missing -> configuration failure', !!msg && /APP_URL must be set in production/.test(msg), 'throws "APP_URL must be set in production"', msg || 'no error');
  msg = throws(() => resolveAppUrl({ NODE_ENV: 'production', APP_URL: '   ' }));
  record('APP_URL: production + blank -> configuration failure', !!msg, 'throws', msg || 'no error');
  let v = resolveAppUrl({ NODE_ENV: 'production', APP_URL: 'https://app.example.com' });
  record('APP_URL: production + valid https -> works', v === 'https://app.example.com', 'https://app.example.com', v);
  v = resolveAppUrl({ NODE_ENV: 'production', APP_URL: 'https://app.example.com///' });
  record('APP_URL: trailing slashes normalised', v === 'https://app.example.com', 'no trailing slash', v);
  msg = throws(() => resolveAppUrl({ NODE_ENV: 'production', APP_URL: 'http://localhost:3000' }));
  record('APP_URL: production + localhost -> rejected', !!msg && /localhost/.test(msg), 'throws', msg || 'no error');
  msg = throws(() => resolveAppUrl({ NODE_ENV: 'production', APP_URL: 'http://127.0.0.1:3000' }));
  record('APP_URL: production + 127.0.0.1 -> rejected', !!msg, 'throws', msg || 'no error');
  msg = throws(() => resolveAppUrl({ NODE_ENV: 'production', APP_URL: 'not a url' }));
  record('APP_URL: production + invalid URL -> rejected', !!msg, 'throws', msg || 'no error');
  msg = throws(() => resolveAppUrl({ NODE_ENV: 'production', APP_URL: 'ftp://app.example.com' }));
  record('APP_URL: production + non-http scheme -> rejected', !!msg, 'throws', msg || 'no error');
  v = resolveAppUrl({ NODE_ENV: 'development' });
  record('APP_URL: development + missing -> existing local default kept', v === 'http://localhost:3000', 'http://localhost:3000', v);
  v = resolveAppUrl({});
  record('APP_URL: NODE_ENV unset + missing -> local default kept', v === 'http://localhost:3000', 'http://localhost:3000', v);
  v = resolveAppUrl({ NODE_ENV: 'development', APP_URL: 'http://localhost:3001' });
  record('APP_URL: development + explicit localhost still allowed', v === 'http://localhost:3001', 'http://localhost:3001', v);
  v = resolveAppUrl({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' });
  record('APP_URL: `next build` (production, no runtime env) does not fail the build', v === 'http://localhost:3000', 'no throw', v);

  // ══ 2. renewal URL helpers + legacy plans ═════════════════════════════════
  const rl = loadTs('lib/server/renewalLinks.ts');
  const base = 'https://app.example.com';
  const url = rl.buildRenewalUrl(base, 'TOKEN.SIG');
  record('renewal URL uses the configured APP_URL', url === `${base}/api/v1/payments/renewal-pay?token=TOKEN.SIG`, `${base}/api/v1/payments/renewal-pay?token=...`, url.replace('TOKEN.SIG', '<token>'));
  record('in-app renewal URL uses the configured APP_URL', rl.buildInAppRenewalUrl(base, 'vyapar', 'yearly') === `${base}/en/payment?plan=vyapar&cycle=yearly`, 'base + /en/payment?...', rl.buildInAppRenewalUrl(base, 'vyapar', 'yearly'));
  record("legacy plan 'starter' -> Dukaan (documented alias)", rl.sellablePlanFor('starter') === 'shop', 'shop', String(rl.sellablePlanFor('starter')));
  record("legacy plan 'professional' -> no one-click plan", rl.sellablePlanFor('professional') === null, 'null', String(rl.sellablePlanFor('professional')));
  record('current plans map to themselves', ['shop', 'vyapar', 'wholesale', 'badaudyog'].every((p) => rl.sellablePlanFor(p) === p), 'identity', 'ok');
  record("legacy 'professional' in-app link goes to Settings (no unbuyable plan in the URL)", rl.buildInAppRenewalUrl(base, 'professional', 'monthly') === `${base}/en/settings`, `${base}/en/settings`, rl.buildInAppRenewalUrl(base, 'professional', 'monthly'));
  record("legacy 'starter' in-app link uses the sellable plan", rl.buildInAppRenewalUrl(base, 'starter', 'monthly') === `${base}/en/payment?plan=shop&cycle=monthly`, 'plan=shop', rl.buildInAppRenewalUrl(base, 'starter', 'monthly'));
  const billingSrc = fs.readFileSync(path.join(process.cwd(), 'lib/server/billing.ts'), 'utf8');
  record('billing.ts builds reminder links only through the helpers with config.appUrl', /buildRenewalUrl\(config\.appUrl/.test(billingSrc) && /buildInAppRenewalUrl\(config\.appUrl/.test(billingSrc) && !/\$\{config\.appUrl\}\/api\/v1\/payments\/renewal-pay/.test(billingSrc), 'helpers used, no inline URL', 'as expected');

  // ══ 3. stock adjustment atomicity (direct DB, long tx timeout) ════════════
  const { applyStockAdjustment } = loadTs('lib/server/stockAdjust.ts');
  const owner = crypto.randomUUID();
  const mkShop = (n) => prisma.shop.create({ data: { ownerId: owner, name: `${TAG}-${n}`, businessType: 'kirana', packageType: 'dukan', subscriptionPlan: 'shop', subscriptionStatus: 'trial' } });
  const A = await mkShop('A'), B = await mkShop('B');
  const mkProd = (s, n) => prisma.product.create({ data: { shopId: s.id, name: `${TAG}-p${n}`, currentStock: 100, baseUnit: 'pcs' } });
  const pA = await mkProd(A, 'A'), pB = await mkProd(B, 'B');
  const mkGod = (s, n) => prisma.godown.create({ data: { shopId: s.id, ownerId: owner, name: `${TAG}-g${n}`, godownCode: `${TAG.slice(-8)}${n}` } });
  const gA = await mkGod(A, 'A'), gB = await mkGod(B, 'B');
  await prisma.$executeRaw`INSERT INTO godown_products (id, godown_id, product_id, quantity, updated_at) VALUES (gen_random_uuid(), ${gA.id}::uuid, ${pA.id}::uuid, 40, NOW()), (gen_random_uuid(), ${gB.id}::uuid, ${pB.id}::uuid, 40, NOW())`;

  const snap = async () => {
    const prods = await prisma.product.findMany({ where: { id: { in: [pA.id, pB.id] } }, select: { id: true, currentStock: true } });
    const gps = await prisma.$queryRaw`SELECT godown_id::text AS g, product_id::text AS p, quantity::float AS q FROM godown_products WHERE godown_id IN (${gA.id}::uuid, ${gB.id}::uuid) ORDER BY g, p`;
    return JSON.stringify({ prods: prods.sort((x, y) => x.id.localeCompare(y.id)), gps });
  };
  const run = (args) => prisma.$transaction((tx) => applyStockAdjustment(tx, args), { timeout: 180000, maxWait: 90000 });
  const attempt = async (name, args, expectStatus) => {
    const before = await snap();
    let err = null; try { await run(args); } catch (e) { err = e; }
    const after = await snap();
    record(name, !!err && err.status === expectStatus && before === after, `${expectStatus} and NOTHING changed (either shop)`, `${err ? (err.status || err.code || 'error') + ' ' + err.message.split('\n').pop().slice(0, 40) : 'no error'}; ${before === after ? 'unchanged' : 'CHANGED'}`);
  };

  // valid request: exactly the intended change, both rows together
  const b0 = JSON.parse(await snap());
  await run({ shopId: A.id, warehouseId: gA.id, productId: pA.id, difference: 5 });
  const b1 = JSON.parse(await snap());
  const gpA = (o) => o.gps.find((x) => x.g === gA.id).q, gpB = (o) => o.gps.find((x) => x.g === gB.id).q;
  const stock = (o, id) => o.prods.find((x) => x.id === id).currentStock;
  record('valid request: warehouse +5 AND product +5, nothing else', gpA(b1) === gpA(b0) + 5 && stock(b1, pA.id) === stock(b0, pA.id) + 5 && gpB(b1) === gpB(b0) && stock(b1, pB.id) === stock(b0, pB.id), 'A warehouse 40->45, A product 100->105, B untouched', `A wh ${gpA(b0)}->${gpA(b1)}, A prod ${stock(b0, pA.id)}->${stock(b1, pA.id)}, B wh ${gpB(b1)}, B prod ${stock(b1, pB.id)}`);
  await run({ shopId: A.id, warehouseId: gA.id, productId: pA.id, difference: -2 });
  const b2 = JSON.parse(await snap());
  record('valid negative adjustment: both -2 together', gpA(b2) === gpA(b1) - 2 && stock(b2, pA.id) === stock(b1, pA.id) - 2, '45->43 and 105->103', `wh ${gpA(b1)}->${gpA(b2)}, prod ${stock(b1, pA.id)}->${stock(b2, pA.id)}`);

  await attempt('foreign warehouse (own product): rejected, no stock mutation', { shopId: A.id, warehouseId: gB.id, productId: pA.id, difference: 7 }, 404);
  await attempt('foreign product (own warehouse): rejected, warehouse write rolled back', { shopId: A.id, warehouseId: gA.id, productId: pB.id, difference: 7 }, 404);
  await attempt('MIXED: foreign product + foreign warehouse: rejected, nothing changes', { shopId: A.id, warehouseId: gB.id, productId: pB.id, difference: 7 }, 404);
  await attempt('nonexistent warehouse id: rejected, nothing changes', { shopId: A.id, warehouseId: crypto.randomUUID(), productId: pA.id, difference: 7 }, 404);
  await attempt('nonexistent product id: rejected, nothing changes', { shopId: A.id, warehouseId: gA.id, productId: crypto.randomUUID(), difference: 7 }, 404);

  // ══ 4. LIVE: callback / renewal URLs use the server's configured APP_URL ═══
  if (LIVE) {
    const configured = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
    const expected = configured || 'http://localhost:3000';
    const email = `${TAG}@example.invalid`;
    let r = await http('POST', '/api/v1/auth/register', { body: { email, password: 'Test#12345', name: 'P16', shop_name: `${TAG}-live`, business_type: 'kirana', package_type: 'dukan' } });
    if (r.status !== 201) throw new Error('register failed ' + r.status);
    r = await http('POST', '/api/v1/payments/create-order', { body: { plan: 'shop', cycle: 'monthly', firstname: 'P16', email, phone: '9000000000' } });
    const o = r.json || {};
    record('PayU callback URLs (surl/furl) use the configured APP_URL', r.status === 200 && o.surl === `${expected}/api/v1/payments/payu-success` && o.furl === `${expected}/api/v1/payments/payu-failure`, `${expected} + /api/v1/payments/payu-success|failure`, `${r.status}; surl base ${o.surl && o.surl.startsWith(expected) ? 'matches' : 'DIFFERENT'}; furl base ${o.furl && o.furl.startsWith(expected) ? 'matches' : 'DIFFERENT'}`);

    const dbUser = await prisma.user.findUnique({ where: { email } });
    const shop = await prisma.shop.findFirst({ where: { ownerId: dbUser.uuid } });
    await prisma.shop.update({ where: { id: shop.id }, data: { subscriptionStatus: 'expired', subscriptionExpiry: new Date(Date.now() - 864e5) } });
    process.env.RENEWAL_LINK_SECRET = process.env.RENEWAL_LINK_SECRET || '';
    const token = loadTs('lib/server/renewalLinks.ts').generateRenewalToken(shop.id, 'wholesale', 'monthly');
    r = await http('GET', `/api/v1/payments/renewal-pay?token=${token}`);
    const field = (html, n) => { const m = html.match(new RegExp(`name="${n}" value="([^"]*)"`)); return m ? m[1] : null; };
    record('renewal-pay PayU form callbacks use the configured APP_URL', r.status === 200 && field(r.text, 'surl') === `${expected}/api/v1/payments/payu-success` && field(r.text, 'furl') === `${expected}/api/v1/payments/payu-failure`, `${expected}/...`, `${r.status}; surl ${field(r.text, 'surl') && field(r.text, 'surl').startsWith(expected) ? 'matches' : 'DIFFERENT'}`);
    r = await http('GET', `/api/v1/payments/renewal-pay?token=${token.slice(0, -4)}dead`);
    record('renewal-pay invalid-link page links back to the configured APP_URL', r.status === 400 && r.text.includes(`href="${expected}/payment"`), `href="${expected}/payment"`, `${r.status}; ${r.text.includes(`href="${expected}/payment"`) ? 'matches' : 'DIFFERENT'}`);
  }
}

main()
  .catch((e) => record('suite crashed', false, 'no exception', e.stack || String(e)))
  .then(async () => {
    console.log('\n--- cleanup ---');
    const c = spawnSync(process.execPath, ['scripts/test-isolation.js'], { env: { ...process.env, CLEANUP_ONLY: '1' }, encoding: 'utf8' });
    console.log((c.stdout || '').split('\n').filter((l) => /leftover|throwaway/.test(l)).join('\n'));
    const pass = results.filter((r) => r.ok).length, fail = results.length - pass;
    console.log(`\n=== ${pass} passed, ${fail} failed, ${results.length} total ===`);
    if (fail) results.filter((r) => !r.ok).forEach((r) => console.log(' FAILED:', r.name));
    await prisma.$disconnect();
    process.exit(fail ? 1 : 0);
  });
