const fs = require('fs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const envLocal = fs.readFileSync('.env.local', 'utf8');
const getEnv = (key) => {
  const m = envLocal.match(new RegExp(`^${key}=(.*)$`, 'm'));
  if (!m) return undefined;
  let v = m[1].replace(/\r$/, '').trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v;
};

const SECRET_KEY = getEnv('SECRET_KEY');
process.env.DATABASE_URL = getEnv('DATABASE_URL');

const BASE = 'http://localhost:3001/api/v1';
const SHOP_ID = 'ce100f00-f7b4-410f-8e9d-ca4ab649eaa7'; // Rahul footwear (wholesale)
const OWNER_ID = '68e91687-cbb6-4e50-8653-a0fb718b14ed';
const PARTY_ID = '01c0ed05-3d24-48cd-a8dd-16e4b9f3c550'; // "ashish"

const token = jwt.sign({ sub: OWNER_ID }, SECRET_KEY, { expiresIn: '1h' });
const prisma = new PrismaClient();

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-shop-id': SHOP_ID,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function getDue() {
  const c = await prisma.customer.findUnique({ where: { id: PARTY_ID }, select: { totalDue: true } });
  return c.totalDue;
}

let failures = 0;
function assert(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`);
  if (!cond) failures++;
}

(async () => {
  const baseline = await getDue();
  console.log('baseline totalDue:', baseline);

  // 1. Create a draft sheet
  const create = await call('POST', '/collections', { name: 'TEST Collection Round-Trip', date: new Date().toISOString() });
  assert('create sheet -> 201', create.status === 201);
  const sheetId = create.data.id;
  assert('created sheet has status draft', create.data.status === 'draft');

  // 2. Add a party entry -> should immediately decrement totalDue
  const addEntry = await call('POST', `/collections/${sheetId}/entries`, { customerId: PARTY_ID, amount: 500, paymentMode: 'Cash', note: 'test' });
  assert('add entry -> 201', addEntry.status === 201);
  const entryId = addEntry.data.id;
  assert('add entry returns customerTransactionId', !!addEntry.data.customerTransactionId);
  const afterAdd = await getDue();
  assert(`totalDue decremented by 500 (${baseline} -> ${afterAdd})`, afterAdd === baseline - 500);

  // 3. Edit the entry's amount -> should reverse+reapply, net a DIFFERENT decrement
  const editEntry = await call('PATCH', `/collections/${sheetId}/entries/${entryId}`, { amount: 300, paymentMode: 'UPI' });
  assert('edit entry -> 200', editEntry.status === 200);
  const afterEdit = await getDue();
  assert(`totalDue reflects the edited amount (${baseline} -> ${afterEdit})`, afterEdit === baseline - 300);

  // 4. Delete the entry -> should reverse fully back to baseline
  const delEntry = await call('DELETE', `/collections/${sheetId}/entries/${entryId}`);
  assert('delete entry -> 200', delEntry.status === 200);
  const afterDelEntry = await getDue();
  assert(`totalDue back to baseline after entry delete (${baseline} -> ${afterDelEntry})`, afterDelEntry === baseline);

  // 5. Add another entry, then delete the WHOLE SHEET -> should also reverse back to baseline
  const addEntry2 = await call('POST', `/collections/${sheetId}/entries`, { customerId: PARTY_ID, amount: 750, paymentMode: 'Cheque' });
  assert('add second entry -> 201', addEntry2.status === 201);
  const afterAdd2 = await getDue();
  assert(`totalDue decremented by 750 (${baseline} -> ${afterAdd2})`, afterAdd2 === baseline - 750);

  const delSheet = await call('DELETE', `/collections/${sheetId}`);
  assert('delete whole sheet -> 200', delSheet.status === 200);
  const afterDelSheet = await getDue();
  assert(`totalDue back to baseline after sheet delete (${baseline} -> ${afterDelSheet})`, afterDelSheet === baseline);

  // 6. Finalize workflow on a fresh sheet
  const create2 = await call('POST', '/collections', { name: 'TEST Finalize Flow', date: new Date().toISOString() });
  const sheetId2 = create2.data.id;
  await call('POST', `/collections/${sheetId2}/entries`, { customerId: PARTY_ID, amount: 200, paymentMode: 'Cash' });
  const finalize = await call('POST', `/collections/${sheetId2}/finalize`, {});
  assert('finalize -> 200', finalize.status === 200);
  assert('finalize sets status finalized', finalize.data.status === 'finalized');
  const afterFinalize = await getDue();
  assert(`finalize itself does not change balance further (${baseline} -> ${afterFinalize})`, afterFinalize === baseline - 200);
  // idempotent re-finalize
  const finalize2 = await call('POST', `/collections/${sheetId2}/finalize`, {});
  assert('re-finalize is idempotent (still 200)', finalize2.status === 200);

  // 7. List/search
  const list = await call('GET', '/collections?q=TEST%20Finalize');
  assert('search by name finds the finalized sheet', Array.isArray(list.data) && list.data.some(s => s.id === sheetId2));

  // 8. Cross-tier gating: a Vyapar/Dukan shop owner must get 403
  const vyaparShop = await prisma.shop.findFirst({ where: { packageType: { in: ['vyapar', 'dukan'] } }, select: { id: true, ownerId: true } });
  if (vyaparShop) {
    const vyaparToken = jwt.sign({ sub: vyaparShop.ownerId }, SECRET_KEY, { expiresIn: '1h' });
    const res = await fetch(`${BASE}/collections`, { headers: { Authorization: `Bearer ${vyaparToken}`, 'x-shop-id': vyaparShop.id } });
    assert(`Vyapar/Dukan shop gets 403 from /collections (got ${res.status})`, res.status === 403);
  } else {
    console.log('SKIP — no Vyapar/Dukan shop found to test gating against');
  }

  // Cleanup: reverse the finalized sheet's real payment, delete both test sheets
  await call('DELETE', `/collections/${sheetId2}`);
  const afterCleanup = await getDue();
  assert(`final cleanup restores baseline exactly (${baseline} -> ${afterCleanup})`, afterCleanup === baseline);

  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILURE(S)`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error('SCRIPT ERROR:', e);
  await prisma.$disconnect();
  process.exit(1);
});
