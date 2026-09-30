// Run: node --test tests/unit
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  variantKeyOf, keysMatch, normalizeVariants, applyDelta, sizeMapToVariants, variantsToSizeMap, parseSizeVariantsMap,
} from '../../lib/variants.ts';

test('variantKeyOf: colour+size vs bare size', () => {
  assert.equal(variantKeyOf({ color: 'Red', size: 'M' }), 'Red / M');
  assert.equal(variantKeyOf({ color: '', size: '22X32' }), '22X32');
  assert.equal(variantKeyOf({ color: ' Red ', size: ' M ' }), 'Red / M');
});

test('keysMatch ignores case and spacing', () => {
  assert.ok(keysMatch('Off White / 32X34', 'off  white / 32x34'));
  assert.ok(!keysMatch('Red / M', 'Red / L'));
});

test('normalizeVariants: variants[] drives size_variants + stock', () => {
  const n = normalizeVariants({ variants: [
    { color: 'Red', size: 'M', stock: 5, sellingPrice: 100 },
    { color: 'Red', size: 'L', stock: 3 },
    { color: 'red', size: 'm', stock: 2 }, // duplicate key -> merged
  ] });
  assert.equal(n.currentStock, 10);
  assert.deepEqual(n.sizeVariants, { 'Red / M': 7, 'Red / L': 3 });
  assert.equal(n.variants.length, 2);
  assert.equal(n.variants[0].sellingPrice, 100);
});

test('normalizeVariants: size_variants string keeps prices from existing rows', () => {
  const n = normalizeVariants({
    sizeVariants: JSON.stringify({ 'Blue / S': 4, 'Blue / M': 0 }),
    existingVariants: [{ color: 'Blue', size: 'S', stock: 9, sellingPrice: 250, mrp: 300 }],
  });
  assert.equal(n.currentStock, 4);
  assert.equal(n.variants[0].sellingPrice, 250);
  assert.equal(n.variants[0].stock, 4);
  assert.equal(n.variants.length, 2);
});

test('normalizeVariants: nothing sent -> untouched', () => {
  const n = normalizeVariants({});
  assert.equal(n.hasVariants, false);
  assert.equal(n.currentStock, null);
});

test('applyDelta updates all mirrors, clamps at 0, null on unknown key', () => {
  const rows = [{ color: 'Cream', size: '34X40', stock: 4 }];
  const r = applyDelta(rows, 'cream / 34x40', -3);
  assert.equal(r.next, 1);
  assert.equal(r.currentStock, 1);
  assert.deepEqual(JSON.parse(r.sizeVariantsJson), { 'Cream / 34X40': 1 });
  assert.equal(applyDelta(rows, 'Cream / 34X40', -99).next, 0);
  assert.equal(applyDelta(rows, 'Green / 34X40', -1), null);
});

test('round trip map <-> rows, bad JSON safe', () => {
  const rows = sizeMapToVariants({ 'A / 1': 2, '9': 3 });
  assert.deepEqual(variantsToSizeMap(rows), { 'A / 1': 2, '9': 3 });
  assert.deepEqual(parseSizeVariantsMap('not json'), {});
});

import { variantGridKeys, splitList } from '../../lib/variants.ts';

test('variantGridKeys: colour x size, sizes only, colour only', () => {
  assert.deepEqual(variantGridKeys(['Red', 'Blue'], ['S', 'M']).map(r => r.key), ['Red / S', 'Red / M', 'Blue / S', 'Blue / M']);
  assert.deepEqual(variantGridKeys([], ['S', 'M']).map(r => r.key), ['S', 'M']);
  assert.deepEqual(variantGridKeys(['Red'], []).map(r => r.key), ['Red / Free Size']);
  assert.deepEqual(variantGridKeys([], []), []);
});

test('splitList dedupes and trims', () => {
  assert.deepEqual(splitList('S, m ,s;  XL\nL'), ['S', 'm', 'XL', 'L']);
});

import { openVariantStores, adjustVariantStores, closeVariantStores } from '../../lib/variants.ts';

test('adjustVariantStores: sell decrements both stores, case-insensitive key', () => {
  const st = openVariantStores({
    size_variants: JSON.stringify({ 'Red / M': 5 }),
    variants: [{ color: 'Red', size: 'M', stock: 5, sellingPrice: 100 }],
  });
  assert.equal(adjustVariantStores(st, 'red / m', -2), 'ok');
  const out = closeVariantStores(st);
  assert.deepEqual(JSON.parse(out.size_variants), { 'Red / M': 3 });
  assert.equal(out.variants[0].stock, 3);
  assert.equal(out.variants[0].sellingPrice, 100);
});

test('adjustVariantStores: insufficient / missing / clamp / createIfMissing', () => {
  const st = openVariantStores({ size_variants: '{"S":1}', variants: null });
  assert.equal(adjustVariantStores(st, 'S', -5, { rejectNegative: true }), 'insufficient');
  assert.equal(st.mapDirty, false);
  assert.equal(adjustVariantStores(st, 'XL', -1), 'missing');
  assert.equal(adjustVariantStores(st, 'S', -5), 'ok');
  assert.deepEqual(JSON.parse(closeVariantStores(st).size_variants), { S: 0 });
  const st2 = openVariantStores({ size_variants: '{"S":1}', variants: null });
  assert.equal(adjustVariantStores(st2, 'M', 3, { createIfMissing: true }), 'ok');
  assert.deepEqual(JSON.parse(closeVariantStores(st2).size_variants), { S: 1, M: 3 });
});

test('closeVariantStores derives the missing store', () => {
  const onlyMap = openVariantStores({ size_variants: '{"Blue / S":4}', variants: null });
  adjustVariantStores(onlyMap, 'Blue / S', -1);
  const o1 = closeVariantStores(onlyMap);
  assert.equal(o1.variants[0].color, 'Blue');
  assert.equal(o1.variants[0].stock, 3);
  const onlyRows = openVariantStores({ size_variants: null, variants: [{ color: '', size: '9', stock: 2 }] });
  adjustVariantStores(onlyRows, '9', 3);
  const o2 = closeVariantStores(onlyRows);
  assert.deepEqual(JSON.parse(o2.size_variants), { '9': 5 });
});

import { variantLabel, variantAvailable } from '../../lib/variants.ts';

test('variantLabel and variantAvailable', () => {
  assert.equal(variantLabel('Red / M'), 'Red / M');
  assert.equal(variantLabel('Red / '), 'Red');
  assert.equal(variantLabel('22X32'), '22X32');
  assert.equal(variantLabel(''), '');
  const p = { size_variants: '{"Red / M": 4}', variants: [{ color: 'Blue', size: 'S', stock: 9 }] };
  assert.equal(variantAvailable(p, 'red / m'), 4);
  assert.equal(variantAvailable(p, 'Blue / S'), 9);
  assert.equal(variantAvailable(p, 'Green / L'), null);
});
