const fs = require('fs');
const jwt = require('jsonwebtoken');

const envLocal = fs.readFileSync('.env.local', 'utf8');
const getEnv = (key) => {
  const m = envLocal.match(new RegExp(`^${key}=(.*)$`, 'm'));
  if (!m) return undefined;
  let v = m[1].replace(/\r$/, '').trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
};

const SECRET_KEY = getEnv('SECRET_KEY');
const BASE = 'http://localhost:3001/api/v1';
const OWNER_ID = '68e91687-cbb6-4e50-8653-a0fb718b14ed';
const ACTIVE_SHOP = 'ce100f00-f7b4-410f-8e9d-ca4ab649eaa7'; // Rahul footwear (the "currently active" shop)
const OTHER_SHOP = '27ac555b-d4dd-43bb-8913-0d722c6bb51e';  // Adarsh Kirana Wholesalers (the clicked row's real shop)
const PRODUCT_ID = 'a08d6bf5-3c55-4095-8a3a-6468d9e96b63';  // "Fortune Sunflower Oil 1L", belongs to OTHER_SHOP

const token = jwt.sign({ sub: OWNER_ID }, SECRET_KEY, { expiresIn: '1h' });

(async () => {
  // Before the fix: opening the sheet with only the globally-active shop's
  // header (the old behavior) — reproduces the reported "Product not found".
  const before = await fetch(`${BASE}/products/${PRODUCT_ID}/erp-details`, {
    headers: { Authorization: `Bearer ${token}`, 'x-shop-id': ACTIVE_SHOP },
  });
  console.log(`WITHOUT explicit shopId (old behavior) -> ${before.status}`, before.status !== 200 ? await before.text() : '');

  // After the fix: ProductDetailsSheet now passes the row's own shopId.
  const after = await fetch(`${BASE}/products/${PRODUCT_ID}/erp-details`, {
    headers: { Authorization: `Bearer ${token}`, 'x-shop-id': OTHER_SHOP },
  });
  const afterBody = await after.json();
  console.log(`WITH explicit shopId (fixed behavior) -> ${after.status}`, after.status === 200 ? `product: ${afterBody.product?.name}` : afterBody);

  const reproduced = before.status === 404;
  const fixed = after.status === 200 && afterBody.product?.id === PRODUCT_ID;
  console.log(reproduced ? 'PASS — bug reproduced without the fix' : 'FAIL — expected 404 without explicit shopId');
  console.log(fixed ? 'PASS — fetch succeeds with the correct shopId header' : 'FAIL — expected 200 with explicit shopId');
  process.exit(reproduced && fixed ? 0 : 1);
})();
