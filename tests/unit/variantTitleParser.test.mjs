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
