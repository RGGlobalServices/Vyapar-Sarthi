import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateFromLots, orderLots, lotLabel } from '../../lib/lots.ts';

const old = { id: 'a1', batchNumber: 'A31', quantity: 3, sellingPrice: 150, createdAt: '2026-01-01' };
const mid = { id: 'b2', batchNumber: 'B07', quantity: 5, sellingPrice: 180, createdAt: '2026-03-01' };
const red = { id: 'c3', batchNumber: 'C1', quantity: 4, createdAt: '2026-02-01', variantKey: 'Red / M' };

test('FIFO: oldest lot first, spills into the next', () => {
  const rem = new Map();
  const a = allocateFromLots([mid, old], rem, 5);
  assert.deepEqual(a.draws, [{ batchId: 'a1', quantity: 3 }, { batchId: 'b2', quantity: 2 }]);
  assert.equal(a.shortfall, 0);
  assert.equal(rem.get('b2'), 3);
});

test('pinned lot is strict (no overflow into other lots) and reports shortage', () => {
  const rem = new Map();
  const a = allocateFromLots([old, mid], rem, 5, { pinnedId: 'a1' });
  assert.deepEqual(a.draws, [{ batchId: 'a1', quantity: 3 }]);
  assert.equal(a.shortfall, 2);
  assert.equal(a.pinnedShort, true);
  assert.equal(rem.has('b2'), false);
});

test('shared running totals across lines of one bill', () => {
  const rem = new Map();
  allocateFromLots([old], rem, 2, { pinnedId: 'a1' });
  const second = allocateFromLots([old], rem, 2, { pinnedId: 'a1' });
  assert.equal(second.draws[0].quantity, 1);
  assert.equal(second.shortfall, 1);
});

test('variant filter: lot for Red / M is not used by Blue / L; untagged lots serve any variant', () => {
  assert.deepEqual(orderLots([red, old], 'Blue / L').map((l) => l.id), ['a1']);
  assert.deepEqual(orderLots([red, old], 'red / m').map((l) => l.id), ['a1', 'c3']);
});

test('lotLabel is stable, not positional', () => {
  assert.equal(lotLabel(old), 'Lot A31');
  assert.equal(lotLabel({ id: 'abcd1234', batchNumber: '' }), 'Lot #ABCD');
});

import { splitAcrossDraws } from '../../lib/lots.ts';

test('splitAcrossDraws is proportional and adds up exactly', () => {
  const parts = splitAcrossDraws([{ batchId: 'a', quantity: 3 }, { batchId: 'b', quantity: 2 }], 5);
  assert.deepEqual(parts, [{ batchId: 'a', quantity: 3 }, { batchId: 'b', quantity: 2 }]);
  const half = splitAcrossDraws([{ batchId: 'a', quantity: 3 }, { batchId: 'b', quantity: 3 }], 3);
  assert.equal(half.reduce((s, p) => s + p.quantity, 0), 3);
  assert.deepEqual(splitAcrossDraws([], 2), []);
});
