const fs = require('fs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const envLocal = fs.readFileSync('.env.local', 'utf8');
const getEnv = (key) => {
  const m = envLocal.match(new RegExp(`^${key}=(.*)$`, 'm'));
  if (!m) return undefined;
  let v = m[1].replace(/\r$/, '').trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
};

const SECRET_KEY = getEnv('SECRET_KEY');
process.env.DATABASE_URL = getEnv('DATABASE_URL');
const prisma = new PrismaClient();

// Same product the user was editing when they hit the "not working" bug.
const OWNER_ID = '8bca0300-64a0-4299-a0ed-b36a41c2a5f4'; // rahul.gosavi8420@gmail.com
const SHOP_ID = '768dd941-620d-45a8-a94b-90ddae19b9ce';   // Fasttrack-cloth
const PRODUCT_ID = '64f4e74d-ea30-415d-90e3-b20038ee8641'; // adarshs (4-variant)
const token = jwt.sign({ sub: OWNER_ID }, SECRET_KEY, { expiresIn: '1h' });

async function currentState() {
  return prisma.product.findUnique({
    where: { id: PRODUCT_ID },
    select: { currentStock: true, size_variants: true },
  });
}

async function put(body) {
  const res = await fetch(`http://localhost:3001/api/v1/products/${PRODUCT_ID}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'x-shop-id': SHOP_ID, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

let failures = 0;
function assert(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`);
  if (!cond) failures++;
}

(async () => {
  const before = await currentState();
  console.log('BEFORE:', JSON.stringify(before, null, 2));

  // The exact operation the user tried: add a new size (Green/M) with 20 stock
  // via the additive-mode form. Client sends the FULL size_variants map,
  // including the new key with its intended value.
  const beforeMap = JSON.parse(before.size_variants || '{}');
  const testMap = { ...beforeMap, 'Green / M': 20, 'Green / L': 20 };
  const testTotal = Object.values(testMap).reduce((s, v) => s + (Number(v) || 0), 0);

  console.log('\nSending PUT with Green/M=20, Green/L=20, total=' + testTotal + '...');
  const put1 = await put({ current_stock: testTotal, size_variants: JSON.stringify(testMap) });
  console.log('PUT status:', put1.status);

  const after1 = await currentState();
  const after1Map = JSON.parse(after1.size_variants || '{}');
  console.log('AFTER PUT:', JSON.stringify(after1Map, null, 2));

  assert('Green / M persisted as 20 (was the bug: landed as 0)', after1Map['Green / M'] === 20);
  assert('Green / L persisted as 20 (was the bug: landed as 0)', after1Map['Green / L'] === 20);
  assert('currentStock matches sum of variants', after1.currentStock === Object.values(after1Map).reduce((s, v) => s + Number(v || 0), 0));
  assert('Pre-existing sizes untouched', after1Map['Blue / XXL'] === 50 && after1Map['Green / XL'] === 74 && after1Map['Black / S'] === 15 && after1Map['Black / M'] === 55);

  // Restore original state so the user's data is left exactly as they found it.
  console.log('\nRestoring original state...');
  await put({ current_stock: 194, size_variants: JSON.stringify({ 'Blue / XXL': 50, 'Green / XL': 74, 'Black / S': 15, 'Black / M': 55 }) });
  const restored = await currentState();
  console.log('RESTORED:', JSON.stringify(restored, null, 2));
  assert('Restored to baseline (194 total, 4 non-zero sizes)',
    restored.currentStock === 194 && Object.keys(JSON.parse(restored.size_variants)).length === 4);

  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILURE(S)`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
})().catch(async (e) => { console.error('SCRIPT ERROR:', e); await prisma.$disconnect(); process.exit(1); });
