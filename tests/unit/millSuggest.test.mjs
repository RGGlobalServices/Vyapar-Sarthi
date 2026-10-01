import test from 'node:test';
import assert from 'node:assert/strict';
import { nameTokens, byProductHints, rankProducts, defaultOutputPicks } from '../../lib/millSuggest.ts';

const P = (id, name, millCategory) => ({ id, name, millCategory });
const products = [
  P('raw', 'Bhagar', 'raw_material'),
  P('fg', 'Bhagar Grain', 'finished_goods'),
  P('rice', 'Basmati Rice', 'finished_goods'),
  P('konda', 'Bhagar Konda', 'by_product'),
  P('husk', 'Rice Husk', 'by_product'),
  P('bran', 'Bran', 'by_product'),
  P('waste', 'Waste', 'waste'),
];

test('tokens drop filler words', () => {
  assert.deepEqual(nameTokens('Bhagar Grain'), ['bhagar']);
  assert.deepEqual(nameTokens('RM-PROD-1790 Paddy'), ['paddy']);
});

test('grain-specific by-product hints', () => {
  assert.ok(byProductHints('Bhagar').includes('konda'));
  assert.ok(byProductHints('Paddy').includes('husk'));
  assert.ok(byProductHints('Wheat').includes('chokar'));
  assert.deepEqual(byProductHints('Spices'), []);
});

test('Bhagar -> ready product is the Bhagar one, not rice and not the raw itself', () => {
  const r = rankProducts('finished_good', 'Bhagar', 'raw', products);
  assert.equal(r.suggested[0].id, 'fg');
  assert.ok(!r.suggested.some((p) => p.id === 'raw' || p.id === 'rice'));
});

test('Bhagar -> by-product suggestions lead with konda, husk/bran also relevant', () => {
  const r = rankProducts('by_product', 'Bhagar', 'raw', products);
  assert.equal(r.suggested[0].id, 'konda');
  assert.ok(r.suggested.some((p) => p.id === 'husk'));
});

test('history beats names', () => {
  const r = rankProducts('finished_good', 'Bhagar', 'raw', products, ['rice']);
  assert.equal(r.suggested[0].id, 'rice');
});

test('WIP / rejected default to the material itself (or its finished form)', () => {
  assert.equal(rankProducts('wip', 'Bhagar', 'raw', products).suggested[0].id, 'raw');
  assert.equal(rankProducts('rejection', 'Bhagar', 'raw', products).suggested[0].id, 'raw');
});

test('default rows: one ready, by-products, one WIP, one rejected', () => {
  const picks = defaultOutputPicks('Bhagar', 'raw', products);
  assert.deepEqual(picks.map((p) => p.kind), ['finished_good', 'by_product', 'by_product', 'wip', 'rejection']);
  assert.equal(picks[0].productId, 'fg');
  assert.equal(picks[1].productId, 'konda');
});

test('unknown material -> empty (but still present) rows, nothing invented', () => {
  const picks = defaultOutputPicks('Zzz', null, [P('a', 'Alpha'), P('b', 'Beta')]);
  assert.equal(picks.filter((p) => p.productId).length, 0);
  assert.equal(picks.length, 4);
});

test('every product is still reachable (suggested + rest cover the list)', () => {
  const r = rankProducts('by_product', 'Bhagar', 'raw', products);
  assert.equal(r.suggested.length + r.rest.length, products.length);
});

test('the material itself is never suggested as its own by-product, even from history', () => {
  const r = rankProducts('by_product', 'Bhagar', 'raw', products, ['raw', 'konda']);
  assert.ok(!r.suggested.some((p) => p.id === 'raw'));
  assert.equal(r.suggested[0].id, 'konda');
});
