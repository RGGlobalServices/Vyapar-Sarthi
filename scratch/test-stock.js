function resolveStock(p) {
  if (!p) return { known: false, qty: 0 };
  let sv = p.size_variants ?? p.sizeVariants;
  if (typeof sv === 'string') { try { sv = JSON.parse(sv); } catch { sv = null; } }
  if (sv && typeof sv === 'object' && Object.keys(sv).length > 0) {
    const sum = Object.values(sv).reduce((t, v) => t + (Number(v) || 0), 0);
    return { known: true, qty: sum };
  }
  const raw = p.currentStock ?? p.current_stock ?? p.stock;
  if (raw === undefined || raw === null || raw === '') return { known: false, qty: 0 };
  const n = Number(raw);
  return { known: true, qty: isFinite(n) ? n : 0 };
}
const blocked = (p) => { const r = resolveStock(p); return r.known && r.qty <= 0; };
const cases = [
  ['Baby Romper (currentStock 50)',      { currentStock: 50 },              false],
  ['Genuinely 0 (currentStock 0)',       { currentStock: 0 },               true ],
  ['snake_case current_stock 26',        { current_stock: 26 },             false],
  ['string "50"',                        { currentStock: '50' },            false],
  ['variant product (sizes sum 22)',     { size_variants: '{"Black/S":20,"Black/M":2}' }, false],
  ['variant product all zero',           { size_variants: {"Black/S":0} },  true ],
  ['incomplete object (no stock field)', { name: 'X', sellingPrice: 100 },  false],
  ['manual add object',                  { name: 'Y', sellingPrice: 50, baseUnit: 'pcs' }, false],
];
let pass = 0;
for (const [label, prod, expectBlocked] of cases) {
  const got = blocked(prod);
  const ok = got === expectBlocked;
  if (ok) pass++;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${label.padEnd(38)} blocked=${got} (expected ${expectBlocked})`);
}
console.log(`\n${pass}/${cases.length} passed`);
