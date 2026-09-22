/* eslint-disable */
/**
 * Phase 1.5 subscription / payment security regression suite.
 *
 *   export $(grep -E '^(DATABASE_URL|DIRECT_URL|PAYU_KEY|PAYU_SALT|RENEWAL_LINK_SECRET|CRON_SECRET)=' .env.local | xargs -d '\n')
 *   BASE=http://localhost:3001 node scripts/test-payments-security.js            # default server config
 *   MODE=flagon BASE=http://localhost:3001 node scripts/test-payments-security.js # server started with ALLOW_TEST_PLAN_ACTIVATION=true
 *
 * Uses a throwaway tenant (isolation-test-pay-*@example.invalid) that is removed
 * at the end. PayU callbacks are signed LOCALLY with the dev server's own PayU
 * key/salt — nothing is sent to PayU. Real shops are never touched.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Module = require('module');
const { spawnSync } = require('child_process');
const ts = require(path.join(process.cwd(), 'node_modules/typescript'));
const { PrismaClient } = require(path.join(process.cwd(), 'node_modules/@prisma/client'));

// Read only the keys this suite needs from .env.local (values may contain '#' comments).
(function loadEnv() {
  const want = ['DATABASE_URL', 'DIRECT_URL', 'PAYU_KEY', 'PAYU_SALT', 'RENEWAL_LINK_SECRET', 'CRON_SECRET'];
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
const MODE = process.env.MODE || 'default';
const KEY = process.env.PAYU_KEY, SALT = process.env.PAYU_SALT, RSECRET = process.env.RENEWAL_LINK_SECRET;
const prisma = new PrismaClient();
const TAG = `isolation-test-pay-${Date.now()}`;
const results = [];

function record(name, ok, expected, actual) {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      expected: ${expected}\n      actual:   ${actual}`);
}

// ── tiny loader so the REAL .ts source files are unit-tested (not copies) ─────
function loadTs(rel, env) {
  const file = path.join(process.cwd(), rel);
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(process.cwd());
  const req = m.require.bind(m);
  m.require = (id) => {
    if (id.startsWith('.')) { const p = path.resolve(path.dirname(file), id); return loadTs(path.relative(process.cwd(), fs.existsSync(p + '.ts') ? p + '.ts' : p), env); }
    return req(id);
  };
  m._compile(out, file);
  return m.exports;
}

async function http(method, url, { token, body, form, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (form) { h['Content-Type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form).toString(); }
  else if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + url, { method, headers: h, body: payload, redirect: 'manual' });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, location: res.headers.get('location') || '' };
}

const sha512 = (s) => crypto.createHash('sha512').update(s).digest('hex');
const requestHash = (f) => sha512(`${KEY}|${f.txnid}|${f.amount}|${f.productinfo}|${f.firstname}|${f.email}|${f.udf1 || ''}|${f.udf2 || ''}|${f.udf3 || ''}||||||||${SALT}`); // udf3 | udf4 | udf5 | 6 blanks | salt = 8 pipes
const responseHash = (f) => sha512(`${SALT}|${f.status}||||||${f.udf5 || ''}|${f.udf4 || ''}|${f.udf3 || ''}|${f.udf2 || ''}|${f.udf1 || ''}|${f.email}|${f.firstname}|${f.productinfo}|${f.amount}|${f.txnid}|${KEY}`);
function signedCallback(f) { const d = { ...f }; d.hash = responseHash(d); return d; }

const pricing = loadTs('lib/subscriptionPricing.ts');
const price = (plan, cycle) => pricing.getTotalAmount(plan, cycle);

async function shopState(shopId, userUuid) {
  const s = await prisma.shop.findUnique({ where: { id: shopId }, select: { subscriptionPlan: true, packageType: true, subscriptionStatus: true, subscriptionExpiry: true, billingCycle: true, lastTxnId: true, billingAmount: true } });
  const u = await prisma.user.findUnique({ where: { uuid: userUuid }, select: { maxShops: true } });
  return JSON.stringify({ ...s, maxShops: u.maxShops });
}
const successTxns = (shopId) => prisma.paymentTransaction.count({ where: { shopId, status: 'success' } });

async function main() {
  console.log(`BASE=${BASE}  MODE=${MODE}  TAG=${TAG}\n`);
  if (!KEY || !SALT) throw new Error('PAYU_KEY / PAYU_SALT must be exported (dev/test keys)');

  // ── unit: guard policy ──────────────────────────────────────────────────
  const guard = loadTs('lib/server/planActivationGuard.ts');
  const A = guard.testActivationAllowed;
  record('guard: production + flag=true', A({ NODE_ENV: 'production', ALLOW_TEST_PLAN_ACTIVATION: 'true' }) === false, 'false', String(A({ NODE_ENV: 'production', ALLOW_TEST_PLAN_ACTIVATION: 'true' })));
  record('guard: production, no flag', A({ NODE_ENV: 'production' }) === false, 'false', String(A({ NODE_ENV: 'production' })));
  record('guard: development, flag unset', A({ NODE_ENV: 'development' }) === false, 'false', String(A({ NODE_ENV: 'development' })));
  record("guard: development, flag='1' (not exactly 'true')", A({ NODE_ENV: 'development', ALLOW_TEST_PLAN_ACTIVATION: '1' }) === false, 'false', String(A({ NODE_ENV: 'development', ALLOW_TEST_PLAN_ACTIVATION: '1' })));
  record('guard: development + flag=true (only enabling combination)', A({ NODE_ENV: 'development', ALLOW_TEST_PLAN_ACTIVATION: 'true' }) === true, 'true', String(A({ NODE_ENV: 'development', ALLOW_TEST_PLAN_ACTIVATION: 'true' })));
  const fixedNow = new Date('2026-01-10T00:00:00Z');
  const ex = guard.activationExpiry('monthly', 30, fixedNow);
  record('guard: expiry is server-derived (monthly = +30d, ignores any input)', ex.toISOString() === '2026-02-09T00:00:00.000Z', '2026-02-09', ex.toISOString().slice(0, 10));

  // ── throwaway tenant ────────────────────────────────────────────────────
  const email = `${TAG}@example.invalid`;
  let r = await http('POST', '/api/v1/auth/register', { body: { email, password: 'Test#12345', name: 'Pay Test', shop_name: `${TAG}-shop`, business_type: 'kirana', package_type: 'dukan' } });
  if (r.status !== 201) throw new Error('register failed ' + r.status + ' ' + r.text.slice(0, 200));
  const token = r.json.access_token;
  const dbUser = await prisma.user.findUnique({ where: { email } });
  const shop = await prisma.shop.findFirst({ where: { ownerId: dbUser.uuid } });
  const S = shop.id, U = dbUser.uuid;

  if (MODE === 'default') {
    // ══ 1. activate-plan is closed (same behaviour as production) ══════════
    const before = await shopState(S, U);
    const abuse = { plan: 'badaudyog', cycle: '5_years', trial_end: '2099-12-31' };
    r = await http('POST', '/api/v1/payments/activate-plan', { token, body: abuse });
    record('activate-plan: normal (trial) user, top plan + far trial_end', [403, 404].includes(r.status), '403/404', String(r.status));
    record('  ...subscription fields unchanged', (await shopState(S, U)) === before, 'identical', (await shopState(S, U)) === before ? 'identical' : 'CHANGED');

    r = await http('POST', '/api/v1/payments/activate-plan', { token, body: { plan: 'badaudyog' } });
    record('activate-plan: top plan attempt only', [403, 404].includes(r.status), '403/404', String(r.status));
    r = await http('POST', '/api/v1/payments/activate-plan', { token, body: { trial_end: '2099-01-01' } });
    record('activate-plan: arbitrary future trial_end only', [403, 404].includes(r.status), '403/404', String(r.status));
    r = await http('POST', '/api/v1/payments/activate-plan', { body: abuse });
    record('activate-plan: no token', [401, 403, 404].includes(r.status), '401/403/404', String(r.status));

    await prisma.shop.update({ where: { id: S }, data: { subscriptionStatus: 'expired', subscriptionExpiry: new Date(Date.now() - 864e5) } });
    const beforeExpired = await shopState(S, U);
    r = await http('POST', '/api/v1/payments/activate-plan', { token, body: abuse });
    record('activate-plan: EXPIRED shop tries to upgrade itself', [403, 404].includes(r.status), '403/404', String(r.status));
    record('  ...subscription fields unchanged', (await shopState(S, U)) === beforeExpired, 'identical', (await shopState(S, U)) === beforeExpired ? 'identical' : 'CHANGED');
    await prisma.shop.update({ where: { id: S }, data: { subscriptionStatus: 'trial', subscriptionExpiry: new Date(Date.now() + 5 * 864e5) } });

    // ══ 2. packageType tampering ═══════════════════════════════════════════
    const pkgBefore = (await prisma.shop.findUnique({ where: { id: S } })).packageType;
    r = await http('PATCH', '/api/v1/shop/profile', { token, body: { packageType: 'badaudyog' } });
    let after = await prisma.shop.findUnique({ where: { id: S } });
    record('PATCH /shop/profile {packageType:badaudyog} alone', [200, 400].includes(r.status) && after.packageType === pkgBefore, `ignored/rejected, packageType stays '${pkgBefore}'`, `${r.status}, packageType='${after.packageType}'`);
    r = await http('PATCH', '/api/v1/shop/profile', { token, body: { name: `${TAG}-renamed`, packageType: 'badaudyog', package_type: 'badaudyog' } });
    after = await prisma.shop.findUnique({ where: { id: S } });
    record('PATCH /shop/profile with a legit field + packageType', r.status === 200 && after.packageType === pkgBefore && after.name === `${TAG}-renamed`, "200, name updated, packageType unchanged", `${r.status}, name='${after.name.slice(-8)}', packageType='${after.packageType}'`);
    const g = await http('GET', '/api/v1/shop/profile', { token });
    record('  ...GET /shop/profile still reports the plan-derived package', g.status === 200 && (g.json.packageType || g.json.package_type) === pkgBefore, pkgBefore, String(g.json && (g.json.packageType || g.json.package_type)));

    // ══ 3. payu-success ═══════════════════════════════════════════════════
    // 3.0 legitimate flow: real create-order -> simulated PayU success callback
    r = await http('POST', '/api/v1/payments/create-order', { body: { plan: 'shop', cycle: 'monthly', firstname: 'Pay', email, phone: '9000000000' } });
    const o = r.json || {};
    record('create-order still returns a correctly signed request', r.status === 200 && o.hash === requestHash({ txnid: o.txnid, amount: o.amount, productinfo: o.productinfo, firstname: o.firstname, email: o.email, udf1: o.udf1, udf2: o.udf2, udf3: o.udf3 }), 'hash matches independent recomputation', `${r.status}, ${o.hash === requestHash({ txnid: o.txnid, amount: o.amount, productinfo: o.productinfo, firstname: o.firstname, email: o.email, udf1: o.udf1, udf2: o.udf2, udf3: o.udf3 }) ? 'match' : 'MISMATCH'}`);
    const cb1 = signedCallback({ status: 'success', txnid: o.txnid, amount: o.amount, productinfo: o.productinfo, firstname: o.firstname, email: o.email, udf1: o.udf1, udf2: o.udf2, udf3: o.udf3, mihpayid: 'MIH-' + Date.now(), mode: 'CC' });
    r = await http('POST', '/api/v1/payments/payu-success', { form: cb1 });
    let st = await prisma.shop.findUnique({ where: { id: S } });
    const okRedirect = r.status === 303 && r.location.includes('payment_success=1') && !r.location.includes('error=') && !r.location.includes('already_processed');
    const expiryDays = Math.round((new Date(st.subscriptionExpiry) - Date.now()) / 864e5);
    record('1) first valid callback -> one activation + one transaction', okRedirect && st.subscriptionStatus === 'active' && st.subscriptionPlan === 'shop' && (await successTxns(S)) === 1 && Math.abs(expiryDays - 30) <= 1, "303 success, status active, 1 txn, expiry ~+30d", `${r.status} ${r.location.replace(/^https?:\/\/[^/]+/, '')}; ${st.subscriptionStatus}/${st.subscriptionPlan}; txns=${await successTxns(S)}; +${expiryDays}d`);
    const afterFirst = await shopState(S, U);

    r = await http('POST', '/api/v1/payments/payu-success', { form: cb1 });
    record('2) same callback replayed -> no second activation / no duplicate transaction', r.status === 303 && r.location.includes('already_processed=1') && (await successTxns(S)) === 1 && (await shopState(S, U)) === afterFirst, "already_processed, still 1 txn, state identical", `${r.status} ${r.location.replace(/^https?:\/\/[^/]+/, '')}; txns=${await successTxns(S)}; state ${(await shopState(S, U)) === afterFirst ? 'identical' : 'CHANGED'}`);

    // 3) underpayment with a VALID hash (paying the Dukaan price for Udyog)
    const tx3 = `TXN_UNDER_${Date.now()}`;
    const under = signedCallback({ status: 'success', txnid: tx3, amount: String(price('shop', 'monthly')), productinfo: 'Udyog Plan', firstname: 'Pay', email, udf1: 'wholesale', udf2: U, udf3: 'monthly' });
    const beforeUnder = await shopState(S, U);
    r = await http('POST', '/api/v1/payments/payu-success', { form: under });
    record('3) valid hash + LOWER amount than plan price -> rejected', r.location.includes('error=amount_mismatch') && (await shopState(S, U)) === beforeUnder && (await prisma.paymentTransaction.count({ where: { txnid: tx3 } })) === 0, 'amount_mismatch, no activation, no txn row', `${r.status} ${r.location.replace(/^https?:\/\/[^/]+/, '')}; ${(await shopState(S, U)) === beforeUnder ? 'unchanged' : 'CHANGED'}`);

    // yearly plan paid at the monthly price
    const tx3b = `TXN_UNDERY_${Date.now()}`;
    r = await http('POST', '/api/v1/payments/payu-success', { form: signedCallback({ status: 'success', txnid: tx3b, amount: String(price('vyapar', 'monthly')), productinfo: 'x', firstname: 'Pay', email, udf1: 'vyapar', udf2: U, udf3: 'yearly' }) });
    record('3b) yearly cycle paid at the monthly price -> rejected', r.location.includes('error=amount_mismatch') && (await shopState(S, U)) === beforeUnder, 'amount_mismatch', `${r.location.replace(/^https?:\/\/[^/]+/, '')}`);

    // 4) correct amount, different plan + txnid -> succeeds (and is independent of #1)
    const tx4 = `TXN_OK2_${Date.now()}`;
    r = await http('POST', '/api/v1/payments/payu-success', { form: signedCallback({ status: 'success', txnid: tx4, amount: String(price('vyapar', 'monthly')), productinfo: 'Vyapar Plan', firstname: 'Pay', email, udf1: 'vyapar', udf2: U, udf3: 'monthly', mihpayid: 'MIH2' }) });
    st = await prisma.shop.findUnique({ where: { id: S } });
    record('4+6) valid hash + correct amount, DIFFERENT txnid -> processed independently', r.location.includes('payment_success=1') && !r.location.includes('already_processed') && st.subscriptionPlan === 'vyapar' && (await successTxns(S)) === 2, 'success, plan vyapar, 2 txns total', `${r.location.replace(/^https?:\/\/[^/]+/, '')}; plan=${st.subscriptionPlan}; txns=${await successTxns(S)}`);

    // 5) invalid hash
    const tx5 = `TXN_BADHASH_${Date.now()}`;
    const bad = { status: 'success', txnid: tx5, amount: String(price('badaudyog', 'monthly')), productinfo: 'x', firstname: 'Pay', email, udf1: 'badaudyog', udf2: U, udf3: 'monthly', hash: 'f'.repeat(128) };
    const beforeBad = await shopState(S, U);
    r = await http('POST', '/api/v1/payments/payu-success', { form: bad });
    record('5) invalid hash -> rejected', r.location.includes('error=hash_mismatch') && (await shopState(S, U)) === beforeBad, 'hash_mismatch, unchanged', `${r.location.replace(/^https?:\/\/[^/]+/, '')}`);
    const tamper = { ...signedCallback({ status: 'success', txnid: `TXN_TAMPER_${Date.now()}`, amount: String(price('shop', 'monthly')), productinfo: 'x', firstname: 'Pay', email, udf1: 'shop', udf2: U, udf3: 'monthly' }), udf1: 'badaudyog' };
    r = await http('POST', '/api/v1/payments/payu-success', { form: tamper });
    record('5b) plan swapped AFTER signing (udf1 tampered) -> rejected', r.location.includes('error=hash_mismatch') && (await shopState(S, U)) === beforeBad, 'hash_mismatch, unchanged', `${r.location.replace(/^https?:\/\/[^/]+/, '')}`);
    r = await http('POST', '/api/v1/payments/payu-success', { form: signedCallback({ status: 'success', txnid: `TXN_UNKPLAN_${Date.now()}`, amount: '1', productinfo: 'x', firstname: 'Pay', email, udf1: 'not-a-plan', udf2: U, udf3: 'monthly' }) });
    record('5c) validly-signed but unknown plan -> not activated', r.location.includes('error=invalid_plan') && (await shopState(S, U)) === beforeBad, 'invalid_plan, unchanged', `${r.location.replace(/^https?:\/\/[^/]+/, '')}`);
    r = await http('POST', '/api/v1/payments/payu-success', { form: signedCallback({ status: 'failure', txnid: `TXN_FAIL_${Date.now()}`, amount: String(price('shop', 'monthly')), productinfo: 'x', firstname: 'Pay', email, udf1: 'shop', udf2: U, udf3: 'monthly' }) });
    record('5d) signed status=failure -> not activated', r.location.includes('error=payment_failure') && (await shopState(S, U)) === beforeBad, 'payment_failure, unchanged', `${r.location.replace(/^https?:\/\/[^/]+/, '')}`);

    // concurrent replay: 6 identical simultaneous callbacks must produce ONE activation
    const txc = `TXN_RACE_${Date.now()}`;
    const raceCb = signedCallback({ status: 'success', txnid: txc, amount: String(price('shop', 'monthly')), productinfo: 'Dukaan', firstname: 'Pay', email, udf1: 'shop', udf2: U, udf3: 'monthly', mihpayid: 'MIHR' });
    const before2 = await successTxns(S);
    const race = await Promise.all(Array.from({ length: 6 }, () => http('POST', '/api/v1/payments/payu-success', { form: raceCb })));
    const created = (await successTxns(S)) - before2;
    const fresh = race.filter((x) => x.location.includes('payment_success=1') && !x.location.includes('already_processed')).length;
    record('replay attack: 6 SIMULTANEOUS identical callbacks -> exactly one activation', created === 1 && fresh === 1, '1 txn created, 1 fresh + 5 already_processed', `txns created=${created}; fresh=${fresh}; already=${race.filter((x) => x.location.includes('already_processed')).length}; errors=${race.filter((x) => x.location.includes('error=')).length}`);

    // ══ 4. renewal tokens ═════════════════════════════════════════════════
    if (!RSECRET) throw new Error('RENEWAL_LINK_SECRET must be exported');
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const sign = (encoded, secret) => crypto.createHmac('sha256', secret).update(encoded).digest('hex');
    const mk = (payload, secret) => { const e = b64(payload); return `${e}.${sign(e, secret)}`; };
    const exp = Date.now() + 3600e3;

    process.env.RENEWAL_LINK_SECRET = RSECRET;
    const rl = loadTs('lib/server/renewalLinks.ts');
    const good = rl.generateRenewalToken(S, 'wholesale', 'yearly');
    const vp = rl.verifyRenewalToken(good);
    record('renewal token: valid new token verifies', !!vp && vp.shopId === S && vp.plan === 'wholesale' && vp.cycle === 'yearly' && !('amount' in vp), 'payload {shopId,plan,cycle,exp}, no amount', JSON.stringify(vp && Object.keys(vp)));
    const [enc, sig] = good.split('.');
    record('renewal token: forged signature', rl.verifyRenewalToken(`${enc}.${'0'.repeat(64)}`) === null, 'null', String(rl.verifyRenewalToken(`${enc}.${'0'.repeat(64)}`)));
    record('renewal token: signed with an attacker key', rl.verifyRenewalToken(mk({ shopId: S, plan: 'badaudyog', cycle: '5_years', exp }, 'attacker-secret-attacker-secret')) === null, 'null', 'null');
    const oldTok = mk({ shopId: S, plan: 'badaudyog', amount: 1, cycle: '5_years', exp }, 'change-me-cron-secret');
    record("renewal token: OLD default-secret ('change-me-cron-secret') token", rl.verifyRenewalToken(oldTok) === null, 'null', String(rl.verifyRenewalToken(oldTok)));
    const cronTok = mk({ shopId: S, plan: 'shop', cycle: 'monthly', exp }, process.env.CRON_SECRET || 'unused-cron-secret-value');
    record('renewal token: signed with CRON_SECRET (must not be reused)', rl.verifyRenewalToken(cronTok) === null, 'null', String(rl.verifyRenewalToken(cronTok)));
    const payloadOf = (t) => JSON.parse(Buffer.from(t.split('.')[0], 'base64url').toString());
    const reenc = (o, t) => `${b64(o)}.${t.split('.')[1]}`;
    record('renewal token: modified amount (added, not re-signed)', rl.verifyRenewalToken(reenc({ ...payloadOf(good), amount: 1 }, good)) === null, 'null', 'null');
    record('renewal token: modified plan (not re-signed)', rl.verifyRenewalToken(reenc({ ...payloadOf(good), plan: 'shop' }, good)) === null, 'null', 'null');
    record('renewal token: modified cycle (not re-signed)', rl.verifyRenewalToken(reenc({ ...payloadOf(good), cycle: 'monthly' }, good)) === null, 'null', 'null');
    record('renewal token: expired', rl.verifyRenewalToken(mk({ shopId: S, plan: 'shop', cycle: 'monthly', exp: Date.now() - 1000 }, RSECRET)) === null, 'null', 'null');
    // fail closed when the secret is absent / weak
    delete process.env.RENEWAL_LINK_SECRET;
    const rl2 = loadTs('lib/server/renewalLinks.ts');
    let threw = false; try { rl2.generateRenewalToken(S, 'shop', 'monthly'); } catch { threw = true; }
    record('renewal token: NO secret configured -> cannot issue, cannot verify (fail closed)', threw && rl2.verifyRenewalToken(good) === null, 'generate throws, verify null', `throws=${threw}, verify=${rl2.verifyRenewalToken(good)}`);
    process.env.RENEWAL_LINK_SECRET = 'short';
    const rl3 = loadTs('lib/server/renewalLinks.ts');
    let threw3 = false; try { rl3.generateRenewalToken(S, 'shop', 'monthly'); } catch { threw3 = true; }
    record('renewal token: too-short secret rejected', threw3, 'throws', String(threw3));
    process.env.RENEWAL_LINK_SECRET = RSECRET;

    // live renewal-pay: the shop must need renewal
    await prisma.shop.update({ where: { id: S }, data: { subscriptionStatus: 'expired', subscriptionExpiry: new Date(Date.now() - 864e5) } });
    const field = (html, name) => { const m = html.match(new RegExp(`name="${name}" value="([^"]*)"`)); return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"') : null; };
    const expected = price('wholesale', 'yearly');
    r = await http('GET', `/api/v1/payments/renewal-pay?token=${good}`);
    const formAmount = field(r.text, 'amount');
    const formHash = r.status === 200 ? requestHash({ txnid: field(r.text, 'txnid'), amount: formAmount, productinfo: field(r.text, 'productinfo'), firstname: field(r.text, 'firstname'), email: field(r.text, 'email'), udf1: field(r.text, 'udf1'), udf2: '', udf3: field(r.text, 'udf3') }) : null;
    record('renewal-pay: valid token -> PayU form with SERVER-computed amount', r.status === 200 && Number(formAmount) === expected && field(r.text, 'udf1') === 'wholesale' && field(r.text, 'udf3') === 'yearly' && formHash === field(r.text, 'hash'), `200, amount=${expected}, udf wholesale/yearly, hash valid`, `${r.status}, amount=${formAmount}, udf=${field(r.text, 'udf1')}/${field(r.text, 'udf3')}, hash ${formHash === field(r.text, 'hash') ? 'valid' : 'INVALID'}`);
    const cheap = mk({ shopId: S, plan: 'wholesale', cycle: 'yearly', amount: 1, exp }, RSECRET);
    r = await http('GET', `/api/v1/payments/renewal-pay?token=${cheap}`);
    record('renewal-pay: correctly-signed token that EMBEDS amount=1 -> amount ignored', r.status === 200 && Number(field(r.text, 'amount')) === expected, `amount stays ${expected}`, `${r.status}, amount=${field(r.text, 'amount')}`);
    for (const [label, t] of [['forged signature', `${enc}.${'0'.repeat(64)}`], ['old default-secret token', oldTok], ['modified plan', reenc({ ...payloadOf(good), plan: 'shop' }, good)], ['modified cycle', reenc({ ...payloadOf(good), cycle: 'monthly' }, good)], ['modified amount', reenc({ ...payloadOf(good), amount: 1 }, good)]]) {
      r = await http('GET', `/api/v1/payments/renewal-pay?token=${t}`);
      record(`renewal-pay: ${label} -> rejected`, r.status === 400 && !field(r.text, 'hash'), '400, no payment form', `${r.status}${field(r.text, 'hash') ? ' FORM ISSUED' : ''}`);
    }
  }

  if (MODE === 'flagon') {
    // Server was started with ALLOW_TEST_PLAN_ACTIVATION=true (non-production): the retained test path.
    const abuse = { plan: 'wholesale', cycle: 'monthly', trial_end: '2099-12-31' };
    r = await http('POST', '/api/v1/payments/activate-plan', { token, body: abuse });
    const st = await prisma.shop.findUnique({ where: { id: S } });
    const days = Math.round((new Date(st.subscriptionExpiry) - Date.now()) / 864e5);
    record('test mode ON: trial shop activates, but client trial_end=2099 is IGNORED (expiry server-derived)', r.status === 200 && st.subscriptionPlan === 'wholesale' && Math.abs(days - 30) <= 1, '200, expiry ~+30d (not 2099)', `${r.status}, expiry +${days}d, plan=${st.subscriptionPlan}`);
    await prisma.shop.update({ where: { id: S }, data: { subscriptionStatus: 'expired', subscriptionExpiry: new Date(Date.now() - 864e5), subscriptionPlan: 'shop' } });
    const before = await shopState(S, U);
    r = await http('POST', '/api/v1/payments/activate-plan', { token, body: { plan: 'badaudyog', cycle: '5_years', trial_end: '2099-12-31' } });
    record('test mode ON: EXPIRED shop cannot upgrade itself', r.status === 403 && (await shopState(S, U)) === before, '403, fields unchanged', `${r.status}, ${(await shopState(S, U)) === before ? 'unchanged' : 'CHANGED'}`);
    r = await http('POST', '/api/v1/payments/activate-plan', { body: abuse });
    record('test mode ON: no token still rejected', [401, 403].includes(r.status), '401/403', String(r.status));
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
