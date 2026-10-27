import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVariantTitle, groupRowsByBase } from '../../lib/variantTitleParser.ts';
import { parseSizeRange } from '../../lib/sizeRange.ts';

// Real titles from the SV SONS tax invoice
const cases = [
  ['JAANZARA TG0968CD 36X40 PLAIN', 'JAANZARA TG0968CD', '36X40', 'Plain'],
  ['ZUNI & ZUNI 21069/A 22X32 COFFI', 'ZUNI & ZUNI 21069/A', '22X32', 'Coffi'],
  ['K BEAUTY 7273 32X34 OFF WHITE', 'K BEAUTY 7273', '32X34', 'Off White'],
  ['DAFFILS C2031 32X36 ICE BLUE', 'DAFFILS C2031', '32X36', 'Ice Blue'],
  ['SWIM SEA AP-20 32X38 PLAIN', 'SWIM SEA AP-20', '32X38', 'Plain'],
  ['S P LN699 20X30 DMV', 'S P LN699', '20X30', 'Dmv'],
  ['MIMI GIRLS TP8018 20X30 WR', 'MIMI GIRLS TP8018', '20X30', 'Wr'],
];
for (const [title, base, size, color] of cases) {
  test(`parse: ${title}`, () => {
    const p = parseVariantTitle(title);
    assert.equal(p.baseName, base);
    assert.equal(p.size, size);
    assert.equal(p.color, color);
  });
}

test('letter size and Size word', () => {
  assert.deepEqual(
    (({ baseName, size }) => ({ baseName, size }))(parseVariantTitle('Cotton Shirt Red L')),
    { baseName: 'Cotton Shirt Red', size: 'L' });
  assert.equal(parseVariantTitle('Bata Sandal Size 9').size, '9');
});

test('no variant in title stays whole, low confidence', () => {
  const p = parseVariantTitle('Tata Salt 1kg');
  assert.equal(p.baseName, 'Tata Salt 1kg');
  assert.equal(p.confidence, 'low');
});

test('grouping: same model different size/colour -> one group', () => {
  const g = groupRowsByBase([
    { name: 'K BEAUTY 7273 32X34 OFF WHITE' },
    { name: 'K beauty 7273 32X36 CREAM' },
    { name: 'K BEAUTY 7286 32X34 PEACH' },
    { name: 'Tata Salt 1kg' },
  ]);
  assert.equal(g.length, 3);
  assert.equal(g[0].rows.length, 2);
  assert.deepEqual(g[0].rows.map(r => r._size), ['32X34', '32X36']);
});

test('parseSizeRange: dimension mode keeps 36X40 as one size; default still expands', () => {
  assert.deepEqual(parseSizeRange('36x40', { dimensions: true }), ['36X40']);
  assert.equal(parseSizeRange('6*8').length, 3);
  assert.equal(parseSizeRange('S-XL', { dimensions: true }).length, 4);
});

// ── Regression: splitTitles dimension-expansion bug ──────────────────────────
// parseSizeRange for DIM-parsed sizes must NOT expand when dimensions:true is
// passed. These cases all come from real textile-wholesale bills.
test('splitTitles regression: textile dimension sizes stay as one size (not expanded)', () => {
  // The bug: without dimensions:true, "36X40" → ["36","38","40"] (3 rows!)
  // The fix: splitTitles now passes dimensions:true for non-shoe products.
  assert.deepEqual(parseSizeRange('36X40', { hint: 'auto', dimensions: true }), ['36X40']);
  assert.deepEqual(parseSizeRange('20X30', { hint: 'auto', dimensions: true }), ['20X30']);
  assert.deepEqual(parseSizeRange('22X32', { hint: 'auto', dimensions: true }), ['22X32']);
  assert.deepEqual(parseSizeRange('32X36', { hint: 'auto', dimensions: true }), ['32X36']);
  assert.deepEqual(parseSizeRange('32X38', { hint: 'auto', dimensions: true }), ['32X38']);
  assert.deepEqual(parseSizeRange('20X30', { hint: 'auto', dimensions: true }), ['20X30']);
});

test('splitTitles: kids/apparel size range (16X20) expands even with dimensions:true', () => {
  // "16X20" is a kids cloth size range (16→18→20), not a fabric dimension.
  // Rule: only suppress when BOTH numbers ≥ 20 — real fabric widths are never < 20.
  assert.deepEqual(parseSizeRange('16X20', { hint: 'auto', dimensions: true }), ['16', '18', '20']);
  assert.deepEqual(parseSizeRange('16x20', { hint: 'auto', dimensions: true }), ['16', '18', '20']);
  assert.deepEqual(parseSizeRange('16*20', { hint: 'auto', dimensions: true }), ['16', '18', '20']);
  // Footwear range: step 1
  assert.deepEqual(parseSizeRange('16x20', { hint: 'shoes' }), ['16', '17', '18', '19', '20']);
});

test('splitTitles regression: shoe size ranges still expand when hint=shoes', () => {
  // Shoe products (hint:'shoes') must NOT pass dimensions:true, so 6*8 expands.
  assert.deepEqual(parseSizeRange('6X8', { hint: 'shoes' }), ['6', '7', '8']);
  assert.deepEqual(parseSizeRange('6X10', { hint: 'shoes' }), ['6', '7', '8', '9', '10']);
});

test('mojadi/juti: small numeric sizes ≤16 always step 1 (shoe heuristic)', () => {
  // Mojadi/juti use Indian UK sizing 6–10; even without shoes hint,
  // the "both ≤ 16 → step 1" heuristic produces the correct result.
  assert.deepEqual(parseSizeRange('6*10', { hint: 'auto', dimensions: true }), ['6', '7', '8', '9', '10']);
  assert.deepEqual(parseSizeRange('7-10', { hint: 'auto', dimensions: true }), ['7', '8', '9', '10']);
  // Explicit shoes hint
  assert.deepEqual(parseSizeRange('6*10', { hint: 'shoes' }), ['6', '7', '8', '9', '10']);
});

test('underwear/innerwear: cm waist sizes expand at step 5', () => {
  // Brief/trunk/baniyan use waist circumference in cm: 70,75,80,85,90
  // Hint 'underwear' → step 5 for multiples-of-5 ranges.
  assert.deepEqual(parseSizeRange('70-90', { hint: 'underwear' }), ['70', '75', '80', '85', '90']);
  assert.deepEqual(parseSizeRange('70*100', { hint: 'underwear' }), ['70', '75', '80', '85', '90', '95', '100']);
  assert.deepEqual(parseSizeRange('75-90', { hint: 'underwear' }), ['75', '80', '85', '90']);
  // Alpha sizes work as usual (pass-through to alpha expander)
  assert.deepEqual(parseSizeRange('S-XL', { hint: 'underwear' }), ['S', 'M', 'L', 'XL']);
  // dimensions:true must NOT block underwear cm expansion (70*90 is a cm range, not a fabric dimension)
  assert.deepEqual(parseSizeRange('70*90', { hint: 'underwear', dimensions: true }), ['70', '75', '80', '85', '90']);
  assert.deepEqual(parseSizeRange('70x90', { hint: 'underwear', dimensions: true }), ['70', '75', '80', '85', '90']);
});

test('underwear cm auto-heuristic: ≥60 multiples of 5 → step 5 without explicit hint', () => {
  // When hint is 'auto', sizes like 70-90 (both ≥60, both %5===0) use step 5.
  assert.deepEqual(parseSizeRange('70-90', { hint: 'auto' }), ['70', '75', '80', '85', '90']);
  assert.deepEqual(parseSizeRange('70*100', { hint: 'auto' }), ['70', '75', '80', '85', '90', '95', '100']);
  // Edge: 60-80 also qualifies
  assert.deepEqual(parseSizeRange('60-80', { hint: 'auto' }), ['60', '65', '70', '75', '80']);
  // Below 60 should NOT trigger step 5 (e.g. trouser size 28-38 step 2)
  assert.deepEqual(parseSizeRange('28-38', { hint: 'auto' }), ['28', '30', '32', '34', '36', '38']);
  // NxM format: 70*90 and 70x90 should ALSO expand at step 5 when hint='auto'
  // (both ≥60, both %5 → likelyUnderwearCm → dimension guard skipped → step 5)
  assert.deepEqual(parseSizeRange('70*90', { hint: 'auto', dimensions: true }), ['70', '75', '80', '85', '90']);
  assert.deepEqual(parseSizeRange('70x90', { hint: 'auto', dimensions: true }), ['70', '75', '80', '85', '90']);
  assert.deepEqual(parseSizeRange('75*95', { hint: 'auto', dimensions: true }), ['75', '80', '85', '90', '95']);
  // Textile dimensions (non-underwear range) still stay as single size
  assert.deepEqual(parseSizeRange('36X40', { hint: 'auto', dimensions: true }), ['36X40']);
  assert.deepEqual(parseSizeRange('32X36', { hint: 'auto', dimensions: true }), ['32X36']);
});

test('splitTitles regression: single-char color codes are preserved as-is', () => {
  // Colors like "B", "R", "G" from bill abbreviations must survive roundtrip.
  const p1 = parseVariantTitle('BRAND MODEL 36X40 B');
  assert.equal(p1.size, '36X40');
  assert.equal(p1.color, 'B');
  assert.notEqual(p1.confidence, 'low');

  const p2 = parseVariantTitle('MIMI GIRLS TP8018 20X30 WR');
  assert.equal(p2.size, '20X30');
  assert.equal(p2.color, 'Wr');

  // Multi-word colors are preserved in full
  const p3 = parseVariantTitle('K BEAUTY 7273 32X34 OFF WHITE');
  assert.equal(p3.color, 'Off White');
});
