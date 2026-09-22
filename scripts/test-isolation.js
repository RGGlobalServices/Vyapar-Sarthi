/* eslint-disable */
/**
 * Phase 1 security + shop-isolation regression suite.
 *
 * Run (dev server must be up; DATABASE_URL etc. come from .env.local):
 *   export $(grep -E '^(DATABASE_URL|DIRECT_URL|CRON_SECRET)=' .env.local | xargs -d '\n')
 *   BASE=http://localhost:3001 node scripts/test-isolation.js
 *
 * It registers TWO throwaway tenants (isolation-test-*@example.invalid), seeds
 * fixtures for each straight through Prisma, attacks tenant B's ids with tenant
 * A's token, and after EVERY attack re-reads B's (and A's) rows to prove nothing
 * changed. It never touches any pre-existing shop, and deletes everything it
 * created at the end (see cleanup()).
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

(function loadEnv() {
  const want = ['DATABASE_URL', 'DIRECT_URL', 'CRON_SECRET'];
  let txt = ''; try { txt = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8'); } catch {}
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && want.includes(m[1]) && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
})();

const { PrismaClient } = require(path.join(process.cwd(), 'node_modules/@prisma/client'));

const BASE = process.env.BASE || 'http://localhost:3001';
const prisma = new PrismaClient();
async function dbRetry(fn) {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) {
      if (i >= 8 || !/Can't reach database server|Timed out fetching|P1001|P1002|P2024|Server has closed/i.test(String(e.message))) throw e;
      infraRetries++; await sleepMs(20000);
    }
  }
}
const TAG = `isolation-test-${Date.now()}`;
const results = [];
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null;
const created = { users: [], shops: [] };

function record(name, ok, expected, actual) {
  results.push({ name, ok, expected, actual });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      expected: ${expected}\n      actual:   ${actual}`);
}

const INFRA_RE = /Can't reach database server|Unable to start a transaction|Transaction already closed|Transaction not found|Timed out fetching a new connection|Server has closed the connection|ETIMEDOUT/i;
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
let infraRetries = 0;

async function httpOnce(method, url, { token, shop, body, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (shop) h['x-shop-id'] = shop;
  if (body !== undefined && !h['Content-Type']) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

// Infrastructure tolerance ONLY: a 500 whose body is a DB-unreachable / transaction-timeout message is retried
// (the remote database has been intermittently unreachable and 2-3 s/query). Any other response — including every
// 4xx and any other 5xx — is returned untouched, so a real failure is never masked.
async function http(method, url, opts = {}) {
  let r = await httpOnce(method, url, opts).catch((e) => ({ status: 0, json: null, text: String(e) }));
  for (let i = 0; i < 4 && ((r.status === 500 && INFRA_RE.test(r.text)) || r.status === 0); i++) {
    infraRetries++;
    await sleepMs(20000);
    r = await httpOnce(method, url, opts).catch((e) => ({ status: 0, json: null, text: String(e) }));
  }
  return r;
}

const uuid = () => crypto.randomUUID();

async function register(label) {
  const email = `${TAG}-${label}@example.invalid`;
  const r = await http('POST', '/api/v1/auth/register', {
    body: { email, password: 'Test#12345', name: `Isolation ${label}`, shop_name: `${TAG}-${label}-shop`, business_type: 'kirana', package_type: 'badaudyog' },
  });
  if (r.status !== 201) throw new Error(`register ${label} failed: ${r.status} ${r.text}`);
  const token = r.json.access_token;
  const dbUser = await prisma.user.findUnique({ where: { email } });
  const userId = dbUser.uuid;
  const shop = await prisma.shop.findFirst({ where: { ownerId: userId } });
  created.users.push(userId);
  created.shops.push(shop.id);
  return { email, token, userId, shopId: shop.id };
}

async function seed(t, label) { return dbRetry(() => seedOnce(t, label)); }
async function seedOnce(t, label) {
  const shopId = t.shopId;
  const customer = await prisma.customer.create({ data: { shopId, name: `${TAG}-${label}-cust`, mobile: '9000000000', totalDue: 100 } });
  const supplier = await prisma.supplier.create({ data: { shopId, name: `${TAG}-${label}-supp`, mobile: '9000000001', balance: 50 } });
  const product = await prisma.product.create({ data: { shopId, name: `${TAG}-${label}-prod`, currentStock: 100, sellingPrice: 10, wholesaleCost: 5, minStock: 1, baseUnit: 'pcs' } });
  const code = (n) => `${TAG.slice(-9)}${label}${n}`;
  const godownA = await prisma.godown.create({ data: { shopId, ownerId: t.userId, name: `${TAG}-${label}-g1`, godownCode: code(1) } });
  const godownB = await prisma.godown.create({ data: { shopId, ownerId: t.userId, name: `${TAG}-${label}-g2`, godownCode: code(2) } });
  await prisma.$executeRaw`INSERT INTO godown_products (id, godown_id, product_id, quantity, updated_at) VALUES (gen_random_uuid(), ${godownA.id}::uuid, ${product.id}::uuid, 40, NOW())`;
  const staff = await prisma.staff.create({ data: { shopId, name: `${TAG}-${label}-staff`, mobile: '9000000002', salaryAmount: 1000, salaryType: 'monthly', role: 'Helper' } });
  const order = await prisma.order.create({ data: { shopId, orderNumber: `${TAG}-${label}-ORD`, totalAmount: 5, direction: 'incoming' } });
  const importLog = await prisma.importLog.create({ data: { shopId, importName: `${TAG}-${label}`, source: 'test', totalRows: 1, importedCount: 0, updatedCount: 0, skippedCount: 0, failedCount: 0, errors: [] } });
  const entry = await prisma.weighbridgeEntry.create({ data: { shopId, slipNumber: `${TAG}-${label}-W`, status: 'completed', netWeightKg: 100, grossWeightKg: 150, tareWeightKg: 50, vehicleNumber: 'TEST1' } }).catch((e) => { console.log('   (weighbridge fixture skipped: ' + e.message.split('\n').pop() + ')'); return null; });
  return { customer, supplier, product, godownA, godownB, staff, order, importLog, entry };
}

// A state fingerprint of one tenant's mutable rows.
async function snapshot(t, f) { return dbRetry(() => snapshotOnce(t, f)); }
async function snapshotOnce(t, f) {
  const [prod, cust, supp, gp, adv, sal, ord, sales, purchases, mv, cash, logs, lots] = await Promise.all([
    prisma.product.findUnique({ where: { id: f.product.id }, select: { currentStock: true } }),
    prisma.customer.findUnique({ where: { id: f.customer.id }, select: { totalDue: true } }),
    prisma.supplier.findUnique({ where: { id: f.supplier.id }, select: { balance: true } }),
    prisma.$queryRaw`SELECT COALESCE(SUM(quantity),0)::float AS q, COUNT(*)::int AS n FROM godown_products WHERE product_id = ${f.product.id}::uuid`,
    prisma.advanceSalary.count({ where: { staffId: f.staff.id } }),
    prisma.salaryPayment.count({ where: { staffId: f.staff.id } }),
    prisma.order.count({ where: { shopId: t.shopId } }),
    prisma.sale.count({ where: { shopId: t.shopId } }),
    prisma.purchaseInvoice.count({ where: { shopId: t.shopId } }),
    prisma.stockMovement.count({ where: { shopId: t.shopId } }),
    prisma.cashBook.count({ where: { shopId: t.shopId } }),
    prisma.customer_transactions.count({ where: { customer_id: f.customer.id } }),
    prisma.rawMaterialLot.count({ where: { shopId: t.shopId } }),
  ]);
  const importLog = await prisma.importLog.findUnique({ where: { id: f.importLog.id }, select: { importedCount: true, failedCount: true } });
  return JSON.stringify({ prod, cust, supp, gp, adv, sal, ord, sales, purchases, mv, cash, logs, lots, importLog, godowns: await prisma.godown.count({ where: { shopId: t.shopId } }) });
}

async function cleanup() { return dbRetry(() => cleanupOnce()); }
async function cleanupOnce() {
  console.log('--- cleanup ---');
  // Everything is scoped to shops/users whose name/email carries the isolation-test tag.
  const users = await prisma.user.findMany({ where: { email: { contains: 'isolation-test-' } }, select: { id: true, uuid: true } });
  const shopRows = await prisma.shop.findMany({ where: { OR: [{ name: { contains: 'isolation-test-' } }, { ownerId: { in: users.map((u) => u.uuid).filter(Boolean) } }] }, select: { id: true } });
  const shopIds = shopRows.map((s) => s.id);
  console.log(`   throwaway users: ${users.length}, shops: ${shopIds.length}`);
  if (shopIds.length) {
    const ids = shopIds;
    const child = [
      ['customer_transactions', 'customer_id', 'customers'], ['supplier_transactions', 'supplier_id', 'suppliers'],
      ['godown_products', 'godown_id', 'godowns'], ['sale_items', 'sale_id', 'sales'],
      ['purchase_items', 'purchase_invoice_id', 'purchase_invoices'], ['order_items', 'order_id', 'orders'],
    ];
    for (const [t, col, parent] of child) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "${col}" IN (SELECT id FROM "${parent}" WHERE shop_id = ANY($1::uuid[]))`, ids).catch(() => {});
    }
    const tables = (await prisma.$queryRaw`SELECT DISTINCT table_name FROM information_schema.columns WHERE column_name = 'shop_id' AND table_schema = 'public' AND table_name <> 'shops'`).map((r) => r.table_name);
    for (let pass = 0; pass < 8; pass++) {
      let failed = 0;
      for (const t of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE shop_id = ANY($1::uuid[])`, ids).catch(() => { failed++; });
      }
      if (!failed) break;
    }
    await prisma.$executeRawUnsafe(`DELETE FROM shops WHERE id = ANY($1::uuid[])`, ids).catch((e) => console.log('   shop delete:', e.message.split('\n').pop()));
  }
  // user-level rows (tool_usage, sessions, referral codes, notifications...) keyed by the throwaway users' ids
  const keyStrs = users.flatMap((u) => [String(u.id), u.uuid].filter(Boolean));
  if (keyStrs.length) {
    const userTables = (await prisma.$queryRaw`SELECT DISTINCT table_name, column_name FROM information_schema.columns WHERE column_name IN ('user_id','owner_id') AND table_schema = 'public' AND table_name NOT IN ('users','shops')`);
    for (let pass = 0; pass < 3; pass++) {
      for (const { table_name, column_name } of userTables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "${column_name}"::text = ANY($1::text[])`, keyStrs).catch(() => {});
      }
    }
  }
  for (const u of users) await prisma.user.delete({ where: { id: u.id } }).catch((e) => console.log('   user delete:', e.message.split('\n').pop()));
  const leftUsers = await prisma.user.count({ where: { email: { contains: 'isolation-test-' } } });
  const leftShops = await prisma.shop.count({ where: { name: { contains: 'isolation-test-' } } });
  const leftCust = await prisma.customer.count({ where: { name: { contains: 'isolation-test-' } } });
  const leftProd = await prisma.product.count({ where: { name: { contains: 'isolation-test-' } } });
  console.log(`   leftover rows -> users:${leftUsers} shops:${leftShops} customers:${leftCust} products:${leftProd}`);
  return { leftUsers, leftShops, leftCust, leftProd };
}

async function main() {
  console.log(`BASE=${BASE}  TAG=${TAG}\n`);
  const A = await register('A');
  const B = await register('B');
  const fa = await seed(A, 'A');
  const fb = await seed(B, 'B');
  console.log(`tenant A shop ${A.shopId.slice(0, 8)}, tenant B shop ${B.shopId.slice(0, 8)}\n`);

  if (!ONLY) {
  // ── 1. Unauthenticated / debug routes ─────────────────────────────────────
  for (const p of ['test', 'test-db', 'test-products', 'test-query']) {
    const r = await http('GET', `/api/v1/${p}`);
    record(`debug route /${p} is gone`, r.status === 404, '404', String(r.status));
  }
  let r = await http('GET', '/api/v1/reports/sales-history', { shop: B.shopId });
  record('sales-history: no token, victim shop header', r.status === 401, '401', `${r.status} ${JSON.stringify(r.json)?.slice(0, 80)}`);
  r = await http('GET', '/api/v1/reports/sales-history', { token: A.token, shop: B.shopId });
  record('sales-history: A token + B shop header', r.status === 403, '403 (no B data)', `${r.status} ${r.json && r.json.code}`);
  r = await http('GET', '/api/v1/reports/sales-history', { token: A.token, shop: A.shopId });
  record('sales-history: A token + A shop (control)', r.status === 200, '200', String(r.status));
  r = await http('POST', '/api/v1/payments/refund', { body: { mihpayid: '123', amount: 1 } });
  record('payments/refund: no auth', r.status === 401 || r.status === 403, '401/403', String(r.status));
  r = await http('POST', '/api/v1/payments/refund', { token: A.token, body: { mihpayid: '123', amount: 1 } });
  record('payments/refund: normal user token (not admin)', r.status === 401 || r.status === 403, '401/403', String(r.status));
  r = await http('POST', '/api/v1/wholesale-import/analyze', {});
  record('wholesale-import/analyze: no token', r.status === 401, '401', String(r.status));

  // ── 2. Cron authentication ────────────────────────────────────────────────
  for (const c of ['daily-summary', 'stock-alerts', 'purge-trash', 'process-subscriptions']) {
    const none = await http('GET', `/api/v1/cron/${c}`);
    const wrong = await http('GET', `/api/v1/cron/${c}`, { headers: { Authorization: 'Bearer definitely-wrong' } });
    const qwrong = await http('GET', `/api/v1/cron/${c}?secret=definitely-wrong`);
    record(`cron/${c}: no secret / wrong bearer / wrong ?secret`, none.status === 401 && wrong.status === 401 && qwrong.status === 401, '401,401,401', `${none.status},${wrong.status},${qwrong.status}`);
  }

  // ── 3. x-shop-id handling ─────────────────────────────────────────────────
  r = await http('GET', '/api/v1/customers', { token: A.token, shop: uuid() });
  record('stale/unknown x-shop-id -> 403 SHOP_INVALID', r.status === 403 && r.json && r.json.code === 'SHOP_INVALID', '403 SHOP_INVALID', `${r.status} ${r.json && r.json.code}`);
  r = await http('GET', '/api/v1/customers', { token: A.token, shop: B.shopId });
  record("another tenant's shop id in x-shop-id -> 403", r.status === 403, '403', String(r.status));
  r = await http('GET', '/api/v1/customers', { token: A.token, shop: 'not-a-uuid' });
  record('malformed x-shop-id -> 403 (no shops[0] fallback)', r.status === 403, '403', String(r.status));
  r = await http('GET', '/api/v1/customers', { token: A.token });
  const namesNoHeader = (r.json || []).map((c) => c.name);
  record('absent x-shop-id -> own first shop only', r.status === 200 && namesNoHeader.every((n) => n.includes('-A-')) && namesNoHeader.length > 0, "200, only tenant A's customers", `${r.status} ${namesNoHeader.join(',')}`);
  r = await http('GET', '/api/v1/customers', { shop: A.shopId });
  record('no token -> 401', r.status === 401, '401', String(r.status));

  }
  // ── 4. Foreign / mixed ids, per route ─────────────────────────────────────
  const attacks = [];
  const add = (name, method, url, body, opts = {}) => attacks.push({ name, method, url, body, ...opts });

  add('billing POST: foreign product_id', 'POST', '/api/v1/billing', { items: [{ product_id: fb.product.id, quantity: 1, price_per_unit: 10 }], payment_type: 'Cash', amount_paid: 10 });
  add('billing POST: foreign customer_id (own product)', 'POST', '/api/v1/billing', { customer_id: fb.customer.id, items: [{ product_id: fa.product.id, quantity: 1, price_per_unit: 10 }], payment_type: 'Udhar', amount_paid: 0 });
  add('billing POST: MIXED own + foreign product', 'POST', '/api/v1/billing', { items: [{ product_id: fa.product.id, quantity: 1, price_per_unit: 10 }, { product_id: fb.product.id, quantity: 1, price_per_unit: 10 }], payment_type: 'Cash', amount_paid: 20 });
  add('purchases POST: foreign supplierId', 'POST', '/api/v1/purchases', { supplierId: fb.supplier.id, items: [{ productId: fa.product.id, quantity: 1, cost: 5 }], amountPaid: 0 });
  add('purchases POST: foreign warehouseId', 'POST', '/api/v1/purchases', { supplierId: fa.supplier.id, warehouseId: fb.godownA.id, items: [{ productId: fa.product.id, quantity: 1, cost: 5 }] });
  add('purchases POST: foreign productId', 'POST', '/api/v1/purchases', { supplierId: fa.supplier.id, items: [{ productId: fb.product.id, quantity: 1, cost: 5 }] });
  add('purchases POST: MIXED own + foreign productId', 'POST', '/api/v1/purchases', { supplierId: fa.supplier.id, items: [{ productId: fa.product.id, quantity: 1, cost: 5 }, { productId: fb.product.id, quantity: 1, cost: 5 }] });
  add('stock/adjust: foreign productId', 'POST', '/api/v1/stock/adjust', { productId: fb.product.id, warehouseId: fa.godownA.id, difference: 5, reason: 't' });
  add('stock/adjust: foreign warehouseId', 'POST', '/api/v1/stock/adjust', { productId: fa.product.id, warehouseId: fb.godownA.id, difference: 5, reason: 't' });
  add('stock/adjust: MIXED foreign product + foreign warehouse', 'POST', '/api/v1/stock/adjust', { productId: fb.product.id, warehouseId: fb.godownA.id, difference: 5, reason: 't' });
  add('stock/adjust: MIXED own product + foreign warehouse (variant deltas)', 'POST', '/api/v1/stock/adjust', { productId: fa.product.id, warehouseId: fb.godownA.id, variantDeltas: [{ variantKey: 'M', delta: 2 }], reason: 't' });
  add('stock/transfer: foreign source godown', 'POST', '/api/v1/stock/transfer', { productId: fa.product.id, fromWarehouseId: fb.godownA.id, toWarehouseId: fa.godownB.id, quantity: 1 });
  add('stock/transfer: foreign destination godown', 'POST', '/api/v1/stock/transfer', { productId: fa.product.id, fromWarehouseId: fa.godownA.id, toWarehouseId: fb.godownB.id, quantity: 1 });
  add('stock/transfer: foreign product', 'POST', '/api/v1/stock/transfer', { productId: fb.product.id, fromWarehouseId: fa.godownA.id, toWarehouseId: fa.godownB.id, quantity: 1 });
  add('godowns/transfer: foreign product', 'POST', '/api/v1/godowns/transfer', { productId: fb.product.id, fromGodownId: fa.godownA.id, toGodownId: fa.godownB.id, quantity: 1 });
  add('stock/daily-register: MIXED own + foreign product', 'POST', '/api/v1/stock/daily-register', { entries: [{ productId: fa.product.id, openingQty: 0, receivedQty: 5, closingQty: null }, { productId: fb.product.id, openingQty: 0, receivedQty: 5, closingQty: null }] });
  add('godowns/:id/inventory/:pid DELETE: foreign godown', 'DELETE', `/api/v1/godowns/${fb.godownA.id}/inventory/${fb.product.id}`);
  add('godowns/:id/inventory/:pid DELETE: own godown, foreign product', 'DELETE', `/api/v1/godowns/${fa.godownA.id}/inventory/${fb.product.id}`);
  add('staff/advance (legacy): foreign staffId', 'POST', '/api/v1/staff/advance', { staffId: fb.staff.id, amount: 10 });
  add('staff/salary (legacy): foreign staffId', 'POST', '/api/v1/staff/salary', { staffId: fb.staff.id, monthYear: '2026-01', baseAmount: 1, netAmount: 1 });
  add('staff POST: foreign reportingManagerId', 'POST', '/api/v1/staff', { name: 'x', mobile: '1', salaryAmount: 1, reportingManagerId: fb.staff.id });
  if (fa.entry) add('mill weighbridge convert-to-lot: foreign supplierId', 'POST', `/api/v1/mill/weighbridge/${fa.entry.id}/convert-to-lot`, { supplierId: fb.supplier.id, ratePerKg: 10 });
  add('orders POST: foreign customerId', 'POST', '/api/v1/orders', { orderNumber: 'X1', direction: 'incoming', customerId: fb.customer.id, totalAmount: 5 });
  add('orders POST: foreign productId in items', 'POST', '/api/v1/orders', { orderNumber: 'X2', direction: 'incoming', totalAmount: 5, items: [{ productId: fb.product.id, quantity: 1, price: 1 }] });
  add('orders PUT: foreign supplierId', 'PUT', `/api/v1/orders/${fa.order.id}`, { orderNumber: 'X3', status: 'pending', direction: 'outgoing', supplierId: fb.supplier.id, totalAmount: 5 });
  add('reports/engine ledger: foreign customer', 'GET', `/api/v1/reports/engine?module=crm&report_type=ledger&entity_type=customer&entity_id=${fb.customer.id}`);
  add('reports/engine ledger: foreign supplier', 'GET', `/api/v1/reports/engine?module=crm&report_type=ledger&entity_type=supplier&entity_id=${fb.supplier.id}`);
  add('suppliers/:id DELETE (cascade): foreign supplier', 'DELETE', `/api/v1/suppliers/${fb.supplier.id}?cascade=true`);
  add('wholesale-import/execute: foreign godownId', 'POST', '/api/v1/wholesale-import/execute', { importType: 'stock', data: [{ name: 'x', quantity: 1 }], godownId: fb.godownA.id });
  add('wholesale-import/execute: foreign importLogId', 'POST', '/api/v1/wholesale-import/execute', { importType: 'stock', data: [{ name: 'x', quantity: 1 }], importLogId: fb.importLog.id });
  add('mill/raw-lots POST: foreign supplierId', 'POST', '/api/v1/mill/raw-lots', { lotNumber: 'L1', weightKg: 1, supplierId: fb.supplier.id });
  add('mill/gate-entries POST: foreign partyId', 'POST', '/api/v1/mill/gate-entries', { vehicleNumber: 'T1', partyId: fb.customer.id, direction: 'outward' });
  add('mill/weighbridge POST: foreign productId', 'POST', '/api/v1/mill/weighbridge', { grossWeightKg: 10, vehicleNumber: 'T2', productId: fb.product.id });
  add('logistics/dispatch POST: foreign partyId', 'POST', '/api/v1/logistics/dispatch', { vehicleNumber: 'T3', partyId: fb.customer.id });
  add('challans POST: foreign customerId', 'POST', '/api/v1/challans', { customerId: fb.customer.id, items: [{ productId: fa.product.id, name: 'x', quantity: 1, price: 1 }] });
  add('challans POST: foreign productId', 'POST', '/api/v1/challans', { customerName: 'walk-in', items: [{ productId: fb.product.id, name: 'x', quantity: 1, price: 1 }] });
  add('expenses POST: foreign warehouseId', 'POST', '/api/v1/expenses', { category: 'misc', amount: 1, warehouseId: fb.godownA.id });
  add('returns POST: foreign productId', 'POST', '/api/v1/returns', { productId: fb.product.id, itemName: 'x', quantity: 1, reason: 't', amount: 1 });

  for (const a of attacks) {
    if (ONLY && !ONLY.test(a.name)) continue;
    const before = { A: await snapshot(A, fa), B: await snapshot(B, fb) };
    const res = await http(a.method, a.url, { token: A.token, shop: A.shopId, body: a.body });
    const after = { A: await snapshot(A, fa), B: await snapshot(B, fb) };
    const rejected = res.status >= 400 && res.status < 500;
    const bUnchanged = before.B === after.B;
    const aUnchanged = before.A === after.A;
    const leaked = JSON.stringify(res.json || '').includes(`${TAG}-B-`);
    const ok = rejected && bUnchanged && aUnchanged && !leaked;
    record(a.name, ok, '4xx, B unchanged, A unchanged (no partial write), no B data in response',
      `${res.status}${res.json && (res.json.error || res.json.detail) ? ' ' + (res.json.error || res.json.detail) : ''}; B ${bUnchanged ? 'unchanged' : 'CHANGED'}; A ${aUnchanged ? 'unchanged' : 'CHANGED'}${leaked ? '; LEAKED B DATA' : ''}`);
  }

  if (!ONLY) {
  // ── 5. Positive controls (the same routes must still work with OWN ids) ───
  const ctl = [];
  r = await http('GET', `/api/v1/reports/engine?module=crm&report_type=ledger&entity_type=customer&entity_id=${fa.customer.id}`, { token: A.token, shop: A.shopId });
  record('control: ledger with OWN customer', r.status === 200 && r.json && r.json.entity, '200 + entity', `${r.status}`);
  r = await http('POST', '/api/v1/billing', { token: A.token, shop: A.shopId, body: { items: [{ product_id: fa.product.id, quantity: 2, price_per_unit: 10 }], payment_type: 'Cash', amount_paid: 20 } });
  record('control: billing POST with OWN product', r.status === 200 || r.status === 201, '200/201', `${r.status} ${(r.json && (r.json.error || r.json.detail)) || ''}`);
  r = await http('POST', '/api/v1/stock/adjust', { token: A.token, shop: A.shopId, body: { productId: fa.product.id, warehouseId: fa.godownA.id, difference: 3, reason: 'ctl' } });
  record('control: stock/adjust with OWN ids', r.status === 200, '200', `${r.status} ${(r.json && (r.json.error || r.json.detail)) || ''}`);
  r = await http('POST', '/api/v1/stock/transfer', { token: A.token, shop: A.shopId, body: { productId: fa.product.id, fromWarehouseId: fa.godownA.id, toWarehouseId: fa.godownB.id, quantity: 1 } });
  record('control: stock/transfer with OWN ids', r.status === 200, '200', `${r.status} ${(r.json && (r.json.error || r.json.detail)) || ''}`);
  r = await http('POST', '/api/v1/purchases', { token: A.token, shop: A.shopId, body: { supplierId: fa.supplier.id, warehouseId: fa.godownA.id, items: [{ productId: fa.product.id, quantity: 2, cost: 5 }], amountPaid: 0 } });
  record('control: purchases POST with OWN ids', r.status === 200 || r.status === 201, '200/201', `${r.status} ${(r.json && (r.json.error || r.json.detail)) || ''}`);
  r = await http('POST', '/api/v1/orders', { token: A.token, shop: A.shopId, body: { orderNumber: 'CTL1', direction: 'incoming', customerId: fa.customer.id, totalAmount: 5, items: [{ productId: fa.product.id, quantity: 1, price: 1 }] } });
  record('control: orders POST with OWN ids', r.status === 201, '201', `${r.status} ${(r.json && (r.json.error || r.json.detail)) || ''}`);
  r = await http('POST', '/api/v1/staff/advance', { token: A.token, shop: A.shopId, body: { staffId: fa.staff.id, amount: 10 } });
  record('control: staff/advance (legacy) with OWN staff', r.status === 201, '201', `${r.status}`);
  if (fa.entry) {
    r = await http('POST', `/api/v1/mill/weighbridge/${fa.entry.id}/convert-to-lot`, { token: A.token, shop: A.shopId, body: { supplierId: fa.supplier.id, ratePerKg: 10 } });
    record('control: convert-to-lot with OWN supplier', r.status === 201, '201', `${r.status} ${(r.json && (r.json.error || r.json.detail)) || ''}`);
  }

  // ── 6. Concurrency: interleaved requests for two tenants never cross ──────
  const burst = [];
  for (let i = 0; i < 30; i++) {
    const useA = i % 2 === 0;
    burst.push(http('GET', '/api/v1/customers', { token: useA ? A.token : B.token, shop: useA ? A.shopId : B.shopId }).then((x) => ({ useA, x })));
  }
  const out = await Promise.all(burst);
  const crossed = out.filter(({ useA, x }) => x.status !== 200 || (x.json || []).some((c) => !c.name.includes(useA ? '-A-' : '-B-')));
  record('30 interleaved A/B requests: no cross-tenant rows', crossed.length === 0, '0 crossed', `${crossed.length} crossed`);

  }
  if (ONLY) {
    r = await http('GET', `/api/v1/reports/engine?module=crm&report_type=ledger&entity_type=customer&entity_id=${fa.customer.id}`, { token: A.token, shop: A.shopId });
    record('control: ledger with OWN customer', r.status === 200 && r.json && r.json.entity, '200 + entity', `${r.status} ${(r.json && (r.json.error || r.json.detail)) || ''}`);
    r = await http('GET', `/api/v1/reports/engine?module=crm&report_type=ledger&entity_type=supplier&entity_id=${fa.supplier.id}`, { token: A.token, shop: A.shopId });
    record('control: ledger with OWN supplier', r.status === 200 && r.json && r.json.entity, '200 + entity', `${r.status} ${(r.json && (r.json.error || r.json.detail)) || ''}`);
  }
  if (ONLY && /stock\/adjust/.test(process.env.ONLY)) {
    const rr = await http('POST', '/api/v1/stock/adjust', { token: A.token, shop: A.shopId, body: { productId: fa.product.id, warehouseId: fa.godownA.id, difference: 3, reason: 'ctl' } });
    record('control: stock/adjust with OWN ids', rr.status === 200, '200', `${rr.status} ${(rr.json && (rr.json.error || rr.json.detail)) || ''}`);
  }
  return { A, B };
}

(process.env.CLEANUP_ONLY ? Promise.resolve() : main())
  .catch((e) => { record('suite crashed', false, 'no exception', e.stack || String(e)); })
  .then(async () => {
    const left = await cleanup().catch((e) => { console.log('cleanup error', e.message); return null; });
    const pass = results.filter((r) => r.ok).length;
    const fail = results.length - pass;
    console.log(`\n=== ${pass} passed, ${fail} failed, ${results.length} total ===`);
    console.log('(infrastructure retries used: ' + infraRetries + ')');
    if (left && (left.leftUsers || left.leftShops || left.leftCust || left.leftProd)) console.log('WARNING: test rows remain:', JSON.stringify(left));
    if (fail) { console.log('\nFAILED:'); results.filter((r) => !r.ok).forEach((r) => console.log(' -', r.name, '=>', r.actual)); }
    await prisma.$disconnect();
    process.exit(fail ? 1 : 0);
  });
