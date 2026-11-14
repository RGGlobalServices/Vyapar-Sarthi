import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveScan, matchVariantByCode, matchProductByCode, variantCodeContains, variantBarcodes, itemCodeMatches } from '../../lib/barcodeLookup.ts';

const cord = { id: 'cord', name: 'M&M CORD SET', barcode: 'PRD-4E5CD76B', metadata: { size_prices: { 24: { barcode: 'PRD-4E5CD76B-24' }, 26: { barcode: 'PRD-4E5CD76B-26' } } } };
const shirt = { id: 'shirt', name: 'SHIRT', barcode: '8901234567890', sku: 'SH-1', metadata: { size_prices: { 'Blue / M': { barcode: '8901234500011' } } } };
const single = { id: 'single', name: 'JEANS', barcode: 'PRD-79C9EBD6', metadata: {} };
const products = [cord, shirt, single];

test('variant scan resolves to the exact variant, not the parent product (the reported bug)', () => {
  const hit = resolveScan(products, 'PRD-4E5CD76B-24');
  assert.equal(hit.product.id, 'cord');
  assert.equal(hit.variantKey, '24');
  assert.equal(resolveScan(products, 'prd-4e5cd76b-26').variantKey, '26');           // case-insensitive
  assert.equal(resolveScan(products, '8901234500011').variantKey, 'Blue / M');
});

test('the old matcher shows why: substring rule alone grabs the parent', () => {
  assert.equal(matchProductByCode(products, 'PRD-4E5CD76B-24')?.id, 'cord');           // parent, no size — what billing used to add
});

test('product-level codes still resolve with no variant', () => {
  assert.deepEqual(resolveScan(products, '8901234567890'), { product: shirt });
  assert.deepEqual(resolveScan(products, 'sh-1'), { product: shirt });
  assert.deepEqual(resolveScan(products, 'PRD-79C9EBD6'), { product: single });
});

test('a variant code that is not saved yet still falls back to the parent (shopkeeper picks the size)', () => {
  const r = resolveScan(products, 'PRD-4E5CD76B-99');
  assert.equal(r.product.id, 'cord');
  assert.equal(r.variantKey, undefined);
});

test('unknown / empty codes do not match', () => {
  assert.equal(resolveScan(products, 'ZZZ-NOT-A-CODE'), undefined);
  assert.equal(resolveScan(products, '   '), undefined);
  assert.equal(matchVariantByCode(products, ''), undefined);
});

test('shared PRD-NEW placeholder variant codes are never matched (they collide across products)', () => {
  const a = { id: 'a', name: 'A', barcode: 'AAA-1111', metadata: { size_prices: { S: { barcode: 'PRD-NEW-S' } } } };
  const b = { id: 'b', name: 'B', barcode: 'BBB-2222', metadata: { size_prices: { S: { barcode: 'PRD-NEW-S' } } } };
  assert.equal(matchVariantByCode([a, b], 'PRD-NEW-S'), undefined);
});

test('metadata may be a JSON string or missing', () => {
  const p = { id: 'p', name: 'P', barcode: 'P-0001', metadata: JSON.stringify({ size_prices: { L: { barcode: 'LCODE-1' } } }) };
  assert.equal(matchVariantByCode([p], 'lcode-1').variantKey, 'L');
  assert.deepEqual(variantBarcodes({ metadata: null }), []);
  assert.deepEqual(variantBarcodes({ metadata: 'not json' }), []);
  assert.deepEqual(variantBarcodes({ metadata: { size_prices: 'oops' } }), []);
});

test('search helper: partial variant code matches the parent', () => {
  assert.equal(variantCodeContains(cord, 'cd76b-2'), true);
  assert.equal(variantCodeContains(cord, '8901'), false);
  assert.equal(variantCodeContains(shirt, '8901234500011'), true);
  assert.equal(variantCodeContains(single, 'prd'), false);
  assert.equal(variantCodeContains(cord, ''), false);
});

test('index is rebuilt for a new list (no stale cache)', () => {
  const list1 = [cord];
  assert.equal(matchVariantByCode(list1, '8901234500011'), undefined);
  assert.equal(matchVariantByCode([...list1, shirt], '8901234500011').product.id, 'shirt');
});

test('itemCodeMatches: product barcode, SKU, carton and variant codes (Retail Stock search ignored all of them)', () => {
  const p = { barcode: '8901234567890', sku: 'SH-1', cartonBarcode: 'CTN-77', metadata: { size_prices: { M: { barcode: 'VAR-M-001' } } } };
  for (const q of ['8901234', 'sh-1', 'ctn-77', 'var-m-0']) assert.equal(itemCodeMatches(p, q), true, q);
  assert.equal(itemCodeMatches(p, 'nothing'), false);
  assert.equal(itemCodeMatches(p, ''), false);
  assert.equal(itemCodeMatches({ barcode: null, sku: undefined, metadata: undefined }, 'abc'), false);
});

import { deriveVariantFromCode, matchLegacyPlaceholder, variantKeysOf, variantSuffix } from '../../lib/barcodeLookup.ts';

const cordV = { id: '4e5cd76b-b8b4-47c5-9f9d-bd78f133456c', name: 'CORD', barcode: 'PRD-4E5CD76B', productType: 'variant', size_variants: '{"24":6,"26":6}', variants: [{ size: '24', stock: 6 }, { size: '26', stock: 6 }], metadata: {} };
const masti = { id: '3e120b93-0000-4000-8000-000000000000', name: 'MASTI', barcode: null, productType: 'variant', size_variants: null, variants: [{ color: 'Plain', size: '16', stock: 2 }, { color: 'Plain', size: '18', stock: 2 }], metadata: {} };
const shirtV = { id: 'cd97558f-0000-4000-8000-000000000000', name: 'SHIRT', barcode: 'MSH-101', productType: 'variant', variants: [{ size: 'M', stock: 1 }], metadata: {} };

test('variantSuffix matches the generator rule', () => {
  assert.equal(variantSuffix('Plain / 16'), 'PLAIN-16');
  assert.equal(variantSuffix('COFFEE / Free Size'), 'COFFEE-FREE-SIZE');
  assert.equal(variantSuffix('24'), '24');
});

test('variantKeysOf: size_variants, variants[] and saved keys, no duplicates', () => {
  assert.deepEqual(variantKeysOf(cordV), ['24', '26']);
  assert.deepEqual(variantKeysOf(masti), ['Plain / 16', 'Plain / 18']);
  assert.deepEqual(variantKeysOf({ variants: [{ color: 'Red', stock: 1 }] }), ['Red']);
});

test('a label code that was never saved still resolves to its exact size (product barcode or PRD-<id8> base)', () => {
  assert.deepEqual(deriveVariantFromCode([cordV, masti], 'PRD-4E5CD76B-26'), { product: cordV, variantKey: '26' });
  assert.deepEqual(deriveVariantFromCode([cordV, masti], 'prd-3e120b93-plain-18'), { product: masti, variantKey: 'Plain / 18' });
  assert.deepEqual(deriveVariantFromCode([shirtV], 'MSH-101-M'), { product: shirtV, variantKey: 'M' });
  assert.equal(deriveVariantFromCode([cordV], 'PRD-4E5CD76B-99'), undefined);          // no such size
  assert.equal(deriveVariantFromCode([cordV], 'PRD-4E5CD76B'), undefined);             // bare product code is not a variant label
  assert.equal(deriveVariantFromCode([{ ...cordV, productType: 'single' }], 'PRD-4E5CD76B-24'), undefined);
});

test('old PRD-NEW-<size> labels resolve only when exactly one variant product has that size', () => {
  assert.deepEqual(matchLegacyPlaceholder([cordV, masti, shirtV], 'PRD-NEW-24'), { product: cordV, variantKey: '24' });
  assert.deepEqual(matchLegacyPlaceholder([cordV, masti], 'PRD-NEW-PLAIN-16'), { product: masti, variantKey: 'Plain / 16' });
  const other = { ...cordV, id: '99999999-0000-4000-8000-000000000000', barcode: 'PRD-99999999' };
  assert.equal(matchLegacyPlaceholder([cordV, other], 'PRD-NEW-24'), undefined);      // two products have size 24 -> never guess
  assert.equal(matchLegacyPlaceholder([cordV], 'PRD-NEW-30'), undefined);
  assert.equal(matchLegacyPlaceholder([cordV], 'PRD-4E5CD76B-24'), undefined);        // not a placeholder
});

test('resolveScan uses derived + legacy matching before the lenient parent fallback', () => {
  assert.deepEqual(resolveScan([cordV], 'PRD-4E5CD76B-24'), { product: cordV, variantKey: '24' });
  assert.deepEqual(resolveScan([cordV, masti], 'PRD-NEW-PLAIN-18'), { product: masti, variantKey: 'Plain / 18' });
  assert.deepEqual(resolveScan([cordV], 'PRD-4E5CD76B'), { product: cordV });          // bare parent code still resolves to the product
});
