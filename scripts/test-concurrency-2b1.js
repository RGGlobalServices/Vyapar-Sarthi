/* eslint-disable */
/**
 * Phase 2B-1 Concurrency & Atomicity Test Suite
 * Tests actual simultaneous HTTP requests (Promise.all) against the live API server.
 * Run with:
 *   BASE=http://localhost:3001 node scripts/test-concurrency-2b1.js
 */

const path = require('path');
const fs = require('fs');
const { PrismaClient } = require(path.join(process.cwd(), 'node_modules/@prisma/client'));

(function loadEnv() {
  let txt = '';
  try { txt = fs.readFileSync('.env.local', 'utf8'); } catch {}
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^(DATABASE_URL|DIRECT_URL)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2].trim();
    if (/^["']/.test(v)) v = v.replace(/^(["'])(.*?)\1.*$/, '$2');
    else v = v.replace(/\s+#.*$/, '');
    process.env[m[1]] = v;
  }
})();

const BASE = process.env.BASE || 'http://localhost:3001';
const prisma = new PrismaClient();
// isolation-test- prefix so `CLEANUP_ONLY=1 node scripts/test-isolation.js` also sweeps any leftovers
const TAG = `isolation-test-2b1-${Date.now()}`;
const results = [];

const rec = (name, ok, exp, act) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      expected: ${exp}\n      actual:   ${act}`);
};

const INFRA = /Can't reach database|Unable to start a transaction|Transaction already closed|Transaction not found|Timed out fetching|ETIMEDOUT|Server has closed/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function http1(method, url, { token, body } = {}) {
  const h = {};
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

// Every non-2xx-4xx outcome is recorded (status, url, body, latency) so an unexplained 500 can be
// classified afterwards: application error vs deadlock (40P01) vs timeout vs infrastructure.
const fiveXX = [];
let maxLatencyMs = 0;
async function http(method, url, o) {
  const t0 = Date.now();
  let r = await http1(method, url, o).catch((e) => ({ status: 0, text: String(e) }));
  for (let i = 0; i < 3 && (r.status === 0 || (r.status === 500 && INFRA.test(r.text))); i++) {
    fiveXX.push({ url, status: r.status, retried: true, body: String(r.text).slice(0, 300) });
    await sleep(2000);
    r = await http1(method, url, o).catch((e) => ({ status: 0, text: String(e) }));
  }
  const ms = Date.now() - t0;
  if (ms > maxLatencyMs) maxLatencyMs = ms;
  if (r.status === 0 || r.status >= 500) fiveXX.push({ url, status: r.status, retried: false, ms, body: String(r.text).slice(0, 400) });
  return r;
}

async function retry(fn) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= 5 || !INFRA.test(String(e.message))) throw e;
      await sleep(2000);
    }
  }
}

async function main() {
  console.log(`\n======================================================`);
  console.log(`  Phase 2B-1 Concurrency & Atomicity Live Test Suite  `);
  console.log(`  Target: ${BASE} | Tag: ${TAG}`);
  console.log(`======================================================\n`);

  let shop, user, token;

  try {
    const email = `${TAG}@example.invalid`;
    let regRes = await http('POST', '/api/v1/auth/register', {
      body: {
        email,
        password: 'Test#12345Password!',
        name: 'Concurrency Tester',
        shop_name: `${TAG}-shop`,
        business_type: 'garments',
        package_type: 'udyog',
      },
    });

    if (regRes.status !== 201) {
      rec('API Registration', false, '201', `${regRes.status} ${regRes.text}`);
      return;
    }

    token = regRes.json.access_token;
    user = await retry(() => prisma.user.findUnique({ where: { email } }));
    shop = await retry(() => prisma.shop.findFirst({ where: { ownerId: user.uuid } }));

    // Helper functions
    const postSale = (body) => http('POST', '/api/v1/billing', { token, body });
    const postReturn = (body) => http('POST', '/api/v1/billing/returns', { token, body });
    const postExchange = (body) => http('POST', '/api/v1/billing/exchange', { token, body });
    const postCustTx = (custId, body) => http('POST', `/api/v1/customers/${custId}/transactions`, { token, body });
    const postGodownTransfer = (body) => http('POST', '/api/v1/godowns/transfer', { token, body });
    const postPurchaseReturn = (purchaseId, body) => http('POST', `/api/v1/purchases/${purchaseId}/return`, { token, body });

    // ----------------------------------------------------
    // 1. C-01: Sales Stock Race (Two simultaneous sales on 10-unit stock)
    // ----------------------------------------------------
    console.log(`\n--- Test 1: C-01 Sales Stock Race ---`);
    const prodC01 = await retry(() =>
      prisma.product.create({
        data: {
          shopId: shop.id,
          name: `Prod C01 ${TAG}`,
          currentStock: 10,
          sellingPrice: 100,
          costPrice: 60,
          baseUnit: 'pcs',
        },
      })
    );

    const saleBodyC01 = {
      items: [{ product_id: prodC01.id, quantity: 10, price_per_unit: 100 }],
      payment_type: 'Cash',
      amount_paid: 1000,
    };

    const [resC01_1, resC01_2] = await Promise.all([
      postSale(saleBodyC01),
      postSale(saleBodyC01),
    ]);

    const statusesC01 = [resC01_1.status, resC01_2.status].sort();
    rec(
      'C-01: Exactly one sale succeeds (201), other fails with conflict (409)',
      statusesC01[0] === 201 && statusesC01[1] === 409,
      '[201, 409]',
      JSON.stringify(statusesC01)
    );

    const dbProdC01 = await retry(() => prisma.product.findUnique({ where: { id: prodC01.id } }));
    rec(
      'C-01 DB Invariant: Final stock is exactly 0 (no oversell)',
      dbProdC01.currentStock === 0,
      '0',
      String(dbProdC01.currentStock)
    );

    // ----------------------------------------------------
    // 2. C-02: Double-Return Race (Two simultaneous full returns on 2-unit bill)
    // ----------------------------------------------------
    console.log(`\n--- Test 2: C-02 Double-Return Race ---`);
    const prodC02 = await retry(() =>
      prisma.product.create({
        data: {
          shopId: shop.id,
          name: `Prod C02 ${TAG}`,
          currentStock: 10,
          sellingPrice: 100,
          costPrice: 60,
          baseUnit: 'pcs',
        },
      })
    );

    const billResC02 = await postSale({
      items: [{ product_id: prodC02.id, quantity: 2, price_per_unit: 100 }],
      payment_type: 'Cash',
      amount_paid: 200,
    });
    const saleIdC02 = billResC02.json?.id || billResC02.json?.sale?.id;
    const saleItemC02 = billResC02.json?.items?.[0] || billResC02.json?.sale?.items?.[0];

    const returnBodyC02 = {
      bill_id: saleIdC02,
      items: [{ item_id: saleItemC02.id, quantity: 2, reason: 'Test' }],
    };

    const [retC02_1, retC02_2] = await Promise.all([
      postReturn(returnBodyC02),
      postReturn(returnBodyC02),
    ]);

    const statusesC02 = [retC02_1.status, retC02_2.status].sort();
    rec(
      'C-02: Exactly one return succeeds (200), duplicate fails (400)',
      statusesC02[0] === 200 && statusesC02[1] === 400,
      '[200, 400]',
      JSON.stringify(statusesC02)
    );

    const returnsInDb = await retry(() =>
      prisma.materialReturn.findMany({ where: { shopId: shop.id, note: { contains: saleIdC02 } } })
    );
    const totalReturnedQty = returnsInDb.reduce((s, r) => s + r.quantity, 0);
    rec(
      'C-02 DB Invariant: Total returned quantity is 2 (not double-refunded)',
      totalReturnedQty === 2,
      '2',
      String(totalReturnedQty)
    );

    // ----------------------------------------------------
    // 3. C-03: Customer Payment Race (Two simultaneous payments on ₹500 due)
    // ----------------------------------------------------
    console.log(`\n--- Test 3: C-03 Customer Payment Race ---`);
    const custC03 = await retry(() =>
      prisma.customer.create({
        data: {
          shopId: shop.id,
          name: `Cust C03 ${TAG}`,
          totalDue: 500,
        },
      })
    );

    const [payC03_1, payC03_2] = await Promise.all([
      postCustTx(custC03.id, { type: 'payment', amount: 500 }),
      postCustTx(custC03.id, { type: 'payment', amount: 500 }),
    ]);

    const statusesC03 = [payC03_1.status, payC03_2.status].sort();
    rec(
      'C-03: Exactly one payment succeeds (200), other rejected (400)',
      statusesC03[0] === 200 && statusesC03[1] === 400,
      '[200, 400]',
      JSON.stringify(statusesC03)
    );

    const dbCustC03 = await retry(() => prisma.customer.findUnique({ where: { id: custC03.id } }));
    rec(
      'C-03 DB Invariant: Customer totalDue is 0 (never negative)',
      Number(dbCustC03.totalDue) === 0,
      '0',
      String(dbCustC03.totalDue)
    );

    // ----------------------------------------------------
    // 4. C-04: Simultaneous Payment + Return Race
    // ----------------------------------------------------
    console.log(`\n--- Test 4: C-04 Payment + Return Race ---`);
    const custC04 = await retry(() =>
      prisma.customer.create({
        data: {
          shopId: shop.id,
          name: `Cust C04 ${TAG}`,
          totalDue: 0,
        },
      })
    );

    const prodC04 = await retry(() =>
      prisma.product.create({
        data: {
          shopId: shop.id,
          name: `Prod C04 ${TAG}`,
          currentStock: 10,
          sellingPrice: 500,
          costPrice: 300,
          baseUnit: 'pcs',
        },
      })
    );

    // Bill for ₹500 Udhar
    const billResC04 = await postSale({
      items: [{ product_id: prodC04.id, quantity: 1, price_per_unit: 500 }],
      customer_id: custC04.id,
      payment_type: 'Udhar',
      amount_paid: 0,
    });
    const saleIdC04 = billResC04.json?.id || billResC04.json?.sale?.id;
    const saleItemC04 = billResC04.json?.items?.[0] || billResC04.json?.sale?.items?.[0];

    // Customer owes exactly 500, all from this bill. A ₹500 payment and a full ₹500 return race
    // for the same balance: unserialised, both decrement it (-> -500). Serialised, whoever locks the
    // customer first wins and the other adapts (return after payment -> cash refund; payment after
    // return -> rejected 400) — the balance must end at exactly 0, never negative.
    const [payC04, retC04] = await Promise.all([
      postCustTx(custC04.id, { type: 'payment', amount: 500 }),
      postReturn({
        bill_id: saleIdC04,
        items: [{ item_id: saleItemC04.id, quantity: 1, reason: 'Test' }],
      }),
    ]);

    const dbCustC04 = await retry(() => prisma.customer.findUnique({ where: { id: custC04.id } }));
    const okC04 =
      retC04.status === 200 &&
      ((payC04.status === 200 && Number(retC04.json.cashRefunded) === 500 && Number(retC04.json.udharCleared) === 0) ||
        (payC04.status === 400 && Number(retC04.json.udharCleared) === 500));
    rec(
      'C-04: payment/return serialised (pay-first -> cash refund 500; return-first -> payment rejected 400)',
      okC04,
      'consistent pair',
      `pay=${payC04.status} ret=${retC04.status} udhar=${retC04.json?.udharCleared} cash=${retC04.json?.cashRefunded}`
    );
    rec(
      'C-04 DB Invariant: Customer totalDue is exactly 0, never negative',
      Number(dbCustC04.totalDue) === 0,
      '0',
      String(dbCustC04.totalDue)
    );

    // ----------------------------------------------------
    // 5. C-05: Credit-Limit Race (Two simultaneous ₹400 sales with ₹500 limit)
    // ----------------------------------------------------
    console.log(`\n--- Test 5: C-05 Credit-Limit Race ---`);
    const custC05 = await retry(() =>
      prisma.customer.create({
        data: {
          shopId: shop.id,
          name: `Cust C05 ${TAG}`,
          totalDue: 0,
          creditLimit: 500,
        },
      })
    );

    const prodC05 = await retry(() =>
      prisma.product.create({
        data: {
          shopId: shop.id,
          name: `Prod C05 ${TAG}`,
          currentStock: 20,
          sellingPrice: 400,
          costPrice: 200,
          baseUnit: 'pcs',
        },
      })
    );

    const udharSaleBodyC05 = {
      items: [{ product_id: prodC05.id, quantity: 1, price_per_unit: 400 }],
      customer_id: custC05.id,
      payment_type: 'Udhar',
      amount_paid: 0,
    };

    const [saleC05_1, saleC05_2] = await Promise.all([
      postSale(udharSaleBodyC05),
      postSale(udharSaleBodyC05),
    ]);

    const statusesC05 = [saleC05_1.status, saleC05_2.status].sort();
    rec(
      'C-05: Exactly one Udhar sale succeeds (201), second exceeds credit limit (400)',
      statusesC05[0] === 201 && statusesC05[1] === 400,
      '[201, 400]',
      JSON.stringify(statusesC05)
    );

    const dbCustC05 = await retry(() => prisma.customer.findUnique({ where: { id: custC05.id } }));
    rec(
      'C-05 DB Invariant: Customer totalDue is ₹400 (<= ₹500 credit limit)',
      Number(dbCustC05.totalDue) === 400,
      '400',
      String(dbCustC05.totalDue)
    );

    // ----------------------------------------------------
    // 6. C-06: Godown Transfer Concurrency & Atomicity
    // ----------------------------------------------------
    console.log(`\n--- Test 6: C-06 Godown Transfer Concurrency & Atomicity ---`);
    const mkGod = (n) => prisma.godown.create({ data: { shopId: shop.id, ownerId: user.uuid, name: `${TAG}-g${n}`, godownCode: `${TAG.slice(-8)}${n}` } });
    const godownSrc = await retry(() => mkGod('src'));
    const godownDst = await retry(() => mkGod('dst'));

    const prodC06 = await retry(() =>
      prisma.product.create({
        data: {
          shopId: shop.id,
          name: `Prod C06 ${TAG}`,
          currentStock: 10,
          baseUnit: 'pcs',
        },
      })
    );

    await retry(() =>
      prisma.$executeRaw`
        INSERT INTO godown_products (id, godown_id, product_id, quantity, updated_at)
        VALUES (gen_random_uuid(), ${godownSrc.id}::uuid, ${prodC06.id}::uuid, 10, NOW())
      `
    );

    const transferBodyC06 = {
      fromGodownId: godownSrc.id,
      toGodownId: godownDst.id,
      productId: prodC06.id,
      quantity: 10,
    };

    const [txG1, txG2] = await Promise.all([
      postGodownTransfer(transferBodyC06),
      postGodownTransfer(transferBodyC06),
    ]);

    const statusesC06 = [txG1.status, txG2.status].sort();
    rec(
      'C-06: Exactly one transfer succeeds (200), second fails (400/409)',
      statusesC06[0] === 200 && [400, 409].includes(statusesC06[1]),
      '[200, 400/409]',
      JSON.stringify(statusesC06)
    );

    const [srcRows, dstRows] = await Promise.all([
      retry(() => prisma.$queryRaw`SELECT quantity FROM godown_products WHERE godown_id = ${godownSrc.id}::uuid AND product_id = ${prodC06.id}::uuid`),
      retry(() => prisma.$queryRaw`SELECT quantity FROM godown_products WHERE godown_id = ${godownDst.id}::uuid AND product_id = ${prodC06.id}::uuid`),
    ]);
    const srcStockQty = Number(srcRows?.[0]?.quantity ?? 0);
    const dstStockQty = Number(dstRows?.[0]?.quantity ?? 0);

    rec(
      'C-06 DB Invariant: Source godown stock is 0, destination is 10 (no negative/partial transfer)',
      srcStockQty === 0 && dstStockQty === 10,
      'src=0, dst=10',
      `src=${srcStockQty}, dst=${dstStockQty}`
    );
    const mvRows = await retry(() => prisma.$queryRaw`SELECT type, COUNT(*)::int AS n FROM stock_movements WHERE shop_id = ${shop.id}::uuid AND product_id = ${prodC06.id}::uuid GROUP BY type`);
    const mvOut = mvRows.find((r) => r.type === 'transfer_out')?.n || 0;
    const mvIn = mvRows.find((r) => r.type === 'transfer_in')?.n || 0;
    rec('C-06 audit: exactly one transfer_out + one transfer_in movement (the failed transfer left none)', mvOut === 1 && mvIn === 1, 'out=1,in=1', `out=${mvOut},in=${mvIn}`);

    // ----------------------------------------------------
    // 7. C-07: Variant Stock JSON Concurrent Mutations
    // ----------------------------------------------------
    console.log(`\n--- Test 7: C-07 Variant Stock JSON Concurrent Mutations ---`);
    const prodC07 = await retry(() =>
      prisma.product.create({
        data: {
          shopId: shop.id,
          name: `Prod C07 ${TAG}`,
          currentStock: 20,
          sellingPrice: 100,
          costPrice: 50,
          baseUnit: 'pcs',
          variants: [
            { color: 'Red', size: 'M', stock: 10, sellingPrice: 100, costPrice: 50 },
            { color: 'Blue', size: 'L', stock: 10, sellingPrice: 100, costPrice: 50 },
          ],
        },
      })
    );

    const saleV1 = {
      items: [{ product_id: prodC07.id, variant: 'Red / M', quantity: 4, price_per_unit: 100 }],
      payment_type: 'Cash',
      amount_paid: 400,
    };

    const saleV2 = {
      items: [{ product_id: prodC07.id, variant: 'Blue / L', quantity: 6, price_per_unit: 100 }],
      payment_type: 'Cash',
      amount_paid: 600,
    };

    const [resV1, resV2] = await Promise.all([postSale(saleV1), postSale(saleV2)]);

    rec(
      'C-07: Both variant sales succeed (201)',
      resV1.status === 201 && resV2.status === 201,
      '201, 201',
      `${resV1.status}, ${resV2.status}`
    );

    const dbProdC07 = await retry(() => prisma.product.findUnique({ where: { id: prodC07.id } }));
    const variants = dbProdC07.variants;
    const redStock = variants.find((v) => v.color === 'Red')?.stock;
    const blueStock = variants.find((v) => v.color === 'Blue')?.stock;

    rec(
      'C-07 DB Invariant: Red/M=6, Blue/L=4, Total=10 (no lost JSON updates)',
      redStock === 6 && blueStock === 4 && dbProdC07.currentStock === 10,
      'Red=6, Blue=4, Total=10',
      `Red=${redStock}, Blue=${blueStock}, Total=${dbProdC07.currentStock}`
    );

    // ----------------------------------------------------
    // 8. C-08: Concurrent Batch Allocation (FIFO)
    // ----------------------------------------------------
    console.log(`\n--- Test 8: C-08 Concurrent Batch Allocation (FIFO) ---`);
    const prodC08 = await retry(() =>
      prisma.product.create({
        data: {
          shopId: shop.id,
          name: `Prod C08 ${TAG}`,
          currentStock: 10,
          sellingPrice: 100,
          costPrice: 50,
          baseUnit: 'pcs',
        },
      })
    );

    const batchC08 = await retry(() =>
      prisma.batch.create({
        data: {
          shopId: shop.id,
          productId: prodC08.id,
          batchNumber: `B08-${TAG}`,
          quantity: 10,
          costPrice: 50,
        },
      })
    );

    const saleB1 = {
      items: [{ product_id: prodC08.id, quantity: 6, price_per_unit: 100 }],
      payment_type: 'Cash',
      amount_paid: 600,
    };

    const [resB1, resB2] = await Promise.all([postSale(saleB1), postSale(saleB1)]);
    const statusesC08 = [resB1.status, resB2.status].sort();

    rec(
      'C-08: Exactly one batch sale succeeds (201), second fails (409)',
      statusesC08[0] === 201 && statusesC08[1] === 409,
      '[201, 409]',
      JSON.stringify(statusesC08)
    );

    const dbBatchC08 = await retry(() => prisma.batch.findUnique({ where: { id: batchC08.id } }));
    const dbProdC08 = await retry(() => prisma.product.findUnique({ where: { id: prodC08.id } }));

    rec(
      'C-08 DB Invariant: Batch quantity = 4, product currentStock = 4 (no batch overdraw)',
      dbBatchC08.quantity === 4 && dbProdC08.currentStock === 4,
      'batch=4, stock=4',
      `batch=${dbBatchC08.quantity}, stock=${dbProdC08.currentStock}`
    );

    // ----------------------------------------------------
    // 9. C-09: Purchase Return Race (Two simultaneous returns of 10 units on 10-unit purchase)
    // ----------------------------------------------------
    console.log(`\n--- Test 9: C-09 Purchase Return Race ---`);
    const supplier = await retry(() =>
      prisma.supplier.create({
        data: {
          shopId: shop.id,
          name: `Supplier C09 ${TAG}`,
        },
      })
    );

    const prodC09 = await retry(() =>
      prisma.product.create({
        data: {
          shopId: shop.id,
          name: `Prod C09 ${TAG}`,
          currentStock: 10,
          costPrice: 50,
          baseUnit: 'pcs',
        },
      })
    );

    const purchase = await retry(() =>
      prisma.purchaseInvoice.create({
        data: {
          shopId: shop.id,
          supplierId: supplier.id,
          invoiceNumber: `PUR-C09-${Date.now()}`,
          totalCost: 500,
          purchaseItems: {
            create: [
              {
                productId: prodC09.id,
                quantity: 10,
                cost: 50,
              },
            ],
          },
        },
        include: { purchaseItems: true },
      })
    );

    const purRetBody = {
      items: [{ productId: prodC09.id, name: prodC09.name, quantity: 10, rate: 50 }],
    };

    const [purRet1, purRet2] = await Promise.all([
      postPurchaseReturn(purchase.id, purRetBody),
      postPurchaseReturn(purchase.id, purRetBody),
    ]);

    const statusesC09 = [purRet1.status, purRet2.status].sort();
    if (statusesC09[0] !== 200 || statusesC09[1] !== 400) {
      console.log('C-09 Details:', { r1: purRet1.json || purRet1.text, r2: purRet2.json || purRet2.text });
    }
    rec(
      'C-09: Exactly one purchase return succeeds (200), duplicate fails (400)',
      statusesC09[0] === 200 && statusesC09[1] === 400,
      '[200, 400]',
      JSON.stringify(statusesC09)
    );

    const dbProdC09 = await retry(() => prisma.product.findUnique({ where: { id: prodC09.id } }));
    rec(
      'C-09 DB Invariant: Product stock restored to 0 (10 - 10 return, not negative)',
      dbProdC09.currentStock === 0,
      '0',
      String(dbProdC09.currentStock)
    );

    // ----------------------------------------------------
    // 10. Multi-Record Failure Rollback Verification
    // ----------------------------------------------------
    console.log(`\n--- Test 10: Multi-Record Failure Rollback ---`);
    // Two racing 2-product sales: the loser passes the pre-transaction check on stale data and only
    // fails INSIDE the transaction. Everything it already did (other product's decrement, sale rows,
    // cash-book) must roll back — a sequential pre-check test cannot prove that.
    const prodRA = await retry(() => prisma.product.create({ data: { shopId: shop.id, name: `Prod RA ${TAG}`, currentStock: 100, sellingPrice: 50, costPrice: 30, baseUnit: 'pcs' } }));
    const prodRB = await retry(() => prisma.product.create({ data: { shopId: shop.id, name: `Prod RB ${TAG}`, currentStock: 10, sellingPrice: 50, costPrice: 30, baseUnit: 'pcs' } }));
    const cashBefore = await retry(() => prisma.cashBook.count({ where: { shopId: shop.id } }));
    const multi = {
      items: [
        { product_id: prodRA.id, quantity: 1, price_per_unit: 50 },
        { product_id: prodRB.id, quantity: 6, price_per_unit: 50 },
      ],
      payment_type: 'Cash',
      amount_paid: 350,
    };
    const [m1, m2] = await Promise.all([postSale(multi), postSale(multi)]);
    const mSt = [m1.status, m2.status].sort();
    rec('Rollback: one 2-product sale succeeds, the racing one is rejected 409', mSt[0] === 201 && mSt[1] === 409, '[201, 409]', JSON.stringify(mSt));
    const [dRA, dRB, cashAfter, itemsRB] = await Promise.all([
      retry(() => prisma.product.findUnique({ where: { id: prodRA.id } })),
      retry(() => prisma.product.findUnique({ where: { id: prodRB.id } })),
      retry(() => prisma.cashBook.count({ where: { shopId: shop.id } })),
      retry(() => prisma.saleItem.count({ where: { productId: { in: [prodRA.id, prodRB.id] } } })),
    ]);
    rec(
      'Rollback DB Invariant: exactly ONE sale worth of stock/cash/items remains (RA=99, RB=4, +1 cash row, 2 sale items)',
      dRA.currentStock === 99 && dRB.currentStock === 4 && cashAfter === cashBefore + 1 && itemsRB === 2,
      'RA=99 RB=4 cash+1 items=2',
      `RA=${dRA.currentStock} RB=${dRB.currentStock} cash+${cashAfter - cashBefore} items=${itemsRB}`
    );

    // ----------------------------------------------------
    // 11. Variant oversell under contention (flat stock ample, the variant is not)
    // ----------------------------------------------------
    console.log(`\n--- Test 11: Variant oversell race ---`);
    const prodV = await retry(() =>
      prisma.product.create({
        data: {
          shopId: shop.id, name: `Prod V ${TAG}`, currentStock: 30, sellingPrice: 100, costPrice: 50, baseUnit: 'pcs',
          variants: [
            { color: 'Red', size: 'M', stock: 10, sellingPrice: 100, costPrice: 50 },
            { color: 'Blue', size: 'L', stock: 20, sellingPrice: 100, costPrice: 50 },
          ],
        },
      })
    );
    const vs = { items: [{ product_id: prodV.id, variant: 'Red / M', quantity: 6, price_per_unit: 100 }], payment_type: 'Cash', amount_paid: 600 };
    const [v1, v2] = await Promise.all([postSale(vs), postSale(vs)]);
    const vSt = [v1.status, v2.status].sort();
    const dV = await retry(() => prisma.product.findUnique({ where: { id: prodV.id } }));
    const redV = dV.variants.find((v) => v.color === 'Red')?.stock;
    rec('Variant: one 6-unit sale of a 10-unit variant succeeds, the other 409', vSt[0] === 201 && vSt[1] === 409, '[201, 409]', JSON.stringify(vSt));
    rec('Variant DB Invariant: Red/M = 4 (not clamped/negative), flat stock = 24', redV === 4 && dV.currentStock === 24, 'Red=4 total=24', `Red=${redV} total=${dV.currentStock}`);

    // ----------------------------------------------------
    // 12. Purchase return: duplicate lines in ONE request
    // ----------------------------------------------------
    console.log(`\n--- Test 12: Purchase return duplicate lines ---`);
    const prodP12 = await retry(() => prisma.product.create({ data: { shopId: shop.id, name: `Prod P12 ${TAG}`, currentStock: 10, costPrice: 50, baseUnit: 'pcs' } }));
    const purchase12 = await retry(() =>
      prisma.purchaseInvoice.create({
        data: {
          shopId: shop.id, supplierId: supplier.id, invoiceNumber: `PUR-P12-${Date.now()}`, totalCost: 500,
          purchaseItems: { create: [{ productId: prodP12.id, quantity: 10, cost: 50 }] },
        },
      })
    );
    const dupRes = await postPurchaseReturn(purchase12.id, {
      items: [
        { productId: prodP12.id, name: prodP12.name, quantity: 6, rate: 50 },
        { productId: prodP12.id, name: prodP12.name, quantity: 6, rate: 50 },
      ],
    });
    const dP12 = await retry(() => prisma.product.findUnique({ where: { id: prodP12.id } }));
    rec('Purchase return: 6+6 lines of a 10-unit purchase rejected (aggregated), stock untouched', dupRes.status === 400 && dP12.currentStock === 10, '400, stock 10', `${dupRes.status}, stock=${dP12.currentStock}`);

    // ----------------------------------------------------
    // 13. Mixed concurrent traffic across the same products + customer: no deadlock
    // ----------------------------------------------------
    console.log(`\n--- Test 13: Mixed concurrency, deadlock check ---`);
    const custM = await retry(() => prisma.customer.create({ data: { shopId: shop.id, name: `Cust M ${TAG}`, totalDue: 0 } }));
    const prodM1 = await retry(() => prisma.product.create({ data: { shopId: shop.id, name: `Prod M1 ${TAG}`, currentStock: 100, sellingPrice: 100, costPrice: 50, baseUnit: 'pcs' } }));
    const prodM2 = await retry(() => prisma.product.create({ data: { shopId: shop.id, name: `Prod M2 ${TAG}`, currentStock: 100, sellingPrice: 100, costPrice: 50, baseUnit: 'pcs' } }));
    const seed = await postSale({ items: [{ product_id: prodM1.id, quantity: 4, price_per_unit: 100 }, { product_id: prodM2.id, quantity: 4, price_per_unit: 100 }], customer_id: custM.id, payment_type: 'Udhar', amount_paid: 0 });
    const ops = await Promise.all([
      postSale({ items: [{ product_id: prodM2.id, quantity: 1, price_per_unit: 100 }, { product_id: prodM1.id, quantity: 1, price_per_unit: 100 }], customer_id: custM.id, payment_type: 'Udhar', amount_paid: 0 }),
      postSale({ items: [{ product_id: prodM1.id, quantity: 1, price_per_unit: 100 }, { product_id: prodM2.id, quantity: 1, price_per_unit: 100 }], customer_id: custM.id, payment_type: 'Udhar', amount_paid: 0 }),
      postReturn({ bill_id: seed.json.id, items: seed.json.items.map((it) => ({ item_id: it.id, quantity: 2 })) }),
      postCustTx(custM.id, { type: 'payment', amount: 100 }),
      postCustTx(custM.id, { type: 'payment', amount: 100 }),
    ]);
    ops.filter((r) => r.status >= 500).forEach((r) => console.log('   5xx body:', String(r.text).slice(0, 400)));
    rec('Mixed ops: no 5xx / deadlock (40P01) errors', ops.every((r) => r.status < 500), 'no 5xx', JSON.stringify(ops.map((r) => r.status)));
    const dM = await retry(() => prisma.customer.findUnique({ where: { id: custM.id } }));
    rec('Mixed ops DB Invariant: customer totalDue never negative', Number(dM.totalDue) >= 0, '>= 0', String(dM.totalDue));

    // ----------------------------------------------------
    // 14. Opposite-direction godown transfers (A->B and B->A) — classic lock-order deadlock shape
    // ----------------------------------------------------
    console.log(`\n--- Test 14: Opposite-direction transfers (deadlock shape), 6 rounds ---`);
    const mkG = (n) => prisma.godown.create({ data: { shopId: shop.id, ownerId: user.uuid, name: `${TAG}-x${n}`, godownCode: `${TAG.slice(-7)}x${n}` } });
    const gX = await retry(() => mkG('1'));
    const gY = await retry(() => mkG('2'));
    const prodT = await retry(() => prisma.product.create({ data: { shopId: shop.id, name: `Prod T ${TAG}`, currentStock: 100, baseUnit: 'pcs' } }));
    await retry(() => prisma.$executeRaw`INSERT INTO godown_products (id, godown_id, product_id, quantity, updated_at) VALUES (gen_random_uuid(), ${gX.id}::uuid, ${prodT.id}::uuid, 50, NOW()), (gen_random_uuid(), ${gY.id}::uuid, ${prodT.id}::uuid, 50, NOW())`);
    const statusesT = [];
    for (let round = 0; round < 6; round++) {
      const [ta, tb] = await Promise.all([
        postGodownTransfer({ fromGodownId: gX.id, toGodownId: gY.id, productId: prodT.id, quantity: 5 }),
        postGodownTransfer({ fromGodownId: gY.id, toGodownId: gX.id, productId: prodT.id, quantity: 5 }),
      ]);
      statusesT.push(ta.status, tb.status);
    }
    const tRows = await retry(() => prisma.$queryRaw`SELECT COALESCE(SUM(quantity),0)::float AS q FROM godown_products WHERE product_id = ${prodT.id}::uuid`);
    rec('Opposite transfers: no 5xx/deadlock across 6 rounds of A->B || B->A', statusesT.every((s) => s === 200), 'all 200', JSON.stringify(statusesT));
    rec('Opposite transfers DB Invariant: total godown quantity conserved (100)', Number(tRows[0].q) === 100, '100', String(tRows[0].q));

    // ----------------------------------------------------
    // 15. stock/adjust: concurrent decrements of the same warehouse stock
    // ----------------------------------------------------
    console.log(`\n--- Test 15: stock/adjust concurrent decrements ---`);
    const postAdjust = (body) => http('POST', '/api/v1/stock/adjust', { token, body });
    const gAdj = await retry(() => mkG('3'));
    const prodAdj = await retry(() => prisma.product.create({ data: { shopId: shop.id, name: `Prod Adj ${TAG}`, currentStock: 10, baseUnit: 'pcs' } }));
    await retry(() => prisma.$executeRaw`INSERT INTO godown_products (id, godown_id, product_id, quantity, updated_at) VALUES (gen_random_uuid(), ${gAdj.id}::uuid, ${prodAdj.id}::uuid, 10, NOW())`);
    const [adj1, adj2] = await Promise.all([
      postAdjust({ productId: prodAdj.id, warehouseId: gAdj.id, difference: -8, reason: 'test' }),
      postAdjust({ productId: prodAdj.id, warehouseId: gAdj.id, difference: -8, reason: 'test' }),
    ]);
    const adjSt = [adj1.status, adj2.status].sort();
    const dAdj = await retry(() => prisma.product.findUnique({ where: { id: prodAdj.id } }));
    const gpAdj = await retry(() => prisma.$queryRaw`SELECT quantity::float AS q FROM godown_products WHERE godown_id = ${gAdj.id}::uuid AND product_id = ${prodAdj.id}::uuid`);
    rec('stock/adjust: one -8 succeeds (200), the other rejected (400)', adjSt[0] === 200 && adjSt[1] === 400, '[200, 400]', JSON.stringify(adjSt));
    rec('stock/adjust DB Invariant: product=2 and warehouse=2 (never negative, in step)', dAdj.currentStock === 2 && Number(gpAdj[0].q) === 2, 'product=2 wh=2', `product=${dAdj.currentStock} wh=${gpAdj[0]?.q}`);

    // ----------------------------------------------------
    // 16. stock/adjust: concurrent per-variant decrements (variant stock 5, two -4)
    // ----------------------------------------------------
    console.log(`\n--- Test 16: stock/adjust concurrent variant decrements ---`);
    const gVar = await retry(() => mkG('4'));
    const prodAV = await retry(() => prisma.product.create({ data: { shopId: shop.id, name: `Prod AV ${TAG}`, currentStock: 40, baseUnit: 'pcs', variants: [{ color: 'Red', size: 'M', stock: 5 }, { color: 'Blue', size: 'L', stock: 35 }] } }));
    await retry(() => prisma.$executeRaw`INSERT INTO godown_products (id, godown_id, product_id, quantity, updated_at) VALUES (gen_random_uuid(), ${gVar.id}::uuid, ${prodAV.id}::uuid, 40, NOW())`);
    const vAdj = { productId: prodAV.id, warehouseId: gVar.id, variantDeltas: [{ variantKey: 'Red / M', delta: -4 }], reason: 'test' };
    const [va1, va2] = await Promise.all([postAdjust(vAdj), postAdjust(vAdj)]);
    const vaSt = [va1.status, va2.status].sort();
    const dAV = await retry(() => prisma.product.findUnique({ where: { id: prodAV.id } }));
    const redAV = dAV.variants.find((v) => v.color === 'Red')?.stock;
    rec('stock/adjust variant: one -4 on a 5-unit variant succeeds, the other rejected (400)', vaSt[0] === 200 && vaSt[1] === 400, '[200, 400]', JSON.stringify(vaSt));
    rec('stock/adjust variant DB Invariant: Red/M=1 and product total=36 (variant and total stay in step)', redAV === 1 && dAV.currentStock === 36, 'Red=1 total=36', `Red=${redAV} total=${dAV.currentStock}`);

  } catch (err) {
    console.error('Test execution error:', err);
    rec('Uncaught execution exception', false, 'no error', String(err));
  } finally {
    // Cleanup created test resources
    if (shop?.id) {
      console.log(`\nCleaning up test shop ${shop.id}...`);
      await retry(async () => {
        await prisma.saleItemBatch.deleteMany({ where: { batch: { shopId: shop.id } } });
        await prisma.batch.deleteMany({ where: { shopId: shop.id } });
        await prisma.saleItem.deleteMany({ where: { sale: { shopId: shop.id } } });
        await prisma.sale.deleteMany({ where: { shopId: shop.id } });
        await prisma.materialReturn.deleteMany({ where: { shopId: shop.id } });
        await prisma.cashBook.deleteMany({ where: { shopId: shop.id } });
        const custs = await prisma.customer.findMany({ where: { shopId: shop.id }, select: { id: true } });
        const custIds = custs.map((c) => c.id);
        if (custIds.length) {
          await prisma.customer_transactions.deleteMany({ where: { customer_id: { in: custIds } } });
        }
        await prisma.customer.deleteMany({ where: { shopId: shop.id } });
        await prisma.stockMovement.deleteMany({ where: { shopId: shop.id } });
        const sups = await prisma.supplier.findMany({ where: { shopId: shop.id }, select: { id: true } });
        const supIds = sups.map((s) => s.id);
        if (supIds.length) {
          await prisma.supplierTransaction.deleteMany({ where: { supplierId: { in: supIds } } });
        }
        await prisma.purchaseReturnItem.deleteMany({ where: { purchaseReturn: { shopId: shop.id } } });
        await prisma.purchaseReturn.deleteMany({ where: { shopId: shop.id } });
        await prisma.purchaseItem.deleteMany({ where: { purchaseInvoice: { shopId: shop.id } } });
        await prisma.purchaseInvoice.deleteMany({ where: { shopId: shop.id } });
        await prisma.supplier.deleteMany({ where: { shopId: shop.id } });
        await prisma.$executeRaw`DELETE FROM godown_products WHERE godown_id IN (SELECT id FROM godowns WHERE shop_id = ${shop.id}::uuid)`;
        await prisma.godown.deleteMany({ where: { shopId: shop.id } });
        await prisma.product.deleteMany({ where: { shopId: shop.id } });
        if (user?.id) {
          await prisma.user.deleteMany({ where: { id: user.id } });
        }
        await prisma.shop.deleteMany({ where: { id: shop.id } });
      });
      console.log(`Cleanup completed.`);
    }
  }

  console.log(`\n5xx/transport failures recorded: ${fiveXX.length}`);
  fiveXX.forEach((f) => console.log('   5XX', JSON.stringify(f)));
  console.log(`Max request latency observed: ${maxLatencyMs} ms (a deadlock is reported by Postgres within ~1s as 40P01; a wait hidden by the 60s timeout would show here)`);

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n======================================================`);
  console.log(`  Phase 2B-1 Concurrency Results: ${passed}/${results.length} PASS, ${failed} FAIL`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
