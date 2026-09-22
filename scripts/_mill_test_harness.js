/* eslint-disable */
// Shared helpers for the live mill test scripts (test-byproducts.js, test-jobwork.js). Not a test itself.
const path = require('path'), fs = require('fs');
module.exports = async function harness(prefix) {
  if (process.env.LIVE !== '1') { console.log('Set LIVE=1 (needs the dev server + DB).'); process.exit(0); }
  const BASE = process.env.BASE || 'http://127.0.0.1:3001';
  const { PrismaClient } = require(path.join(process.cwd(), 'node_modules/@prisma/client'));
  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = line.match(/^(DATABASE_URL|DIRECT_URL)=(.*)$/); if (!m || process.env[m[1]]) continue; let v = m[2].trim(); v = /^["']/.test(v) ? v.replace(/^(["'])(.*?)\1.*$/, '$2') : v.replace(/\s+#.*$/, ''); process.env[m[1]] = v; }
  const prisma = new PrismaClient(); const TAG = `isolation-test-${prefix}-${Date.now()}`;
  const results = [];
  const rec = (name, ok, exp, act) => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      expected: ${exp}\n      actual:   ${act}`}`); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  const mk = (t, n, cat, stock = 0, unit = 'kg') => retry(() => prisma.product.create({ data: { shopId: t.shopId, name: `${TAG}-${n}`, millCategory: cat, currentStock: stock, baseUnit: unit, sellingPrice: 0, gstPercent: 0 } }));
  const stock = async (id) => (await retry(() => prisma.product.findUnique({ where: { id } }))).currentStock ?? 0;
  const finish = async () => {
    await prisma.$disconnect();
    const pass = results.filter((x) => x.ok).length;
    console.log(`\n=== ${pass} passed, ${results.length - pass} failed, ${results.length} total ===`);
    process.exit(pass === results.length ? 0 : 1);
  };
  return { prisma, TAG, rec, retry, http, tenant, mk, stock, finish, sleep };
};
