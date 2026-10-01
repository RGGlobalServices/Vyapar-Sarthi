import test from 'node:test';
import assert from 'node:assert/strict';
import { unitToKg, packsToKg, quickBalance, lossToBalance, yieldPct, QUICK_SOURCES } from '../../lib/quickEntry.ts';

test('units convert to kg; a non-weight unit is rejected (null)', () => {
  assert.equal(unitToKg(2, 'quintal'), 200);
  assert.equal(unitToKg(1.5, 'ton'), 1500);
  assert.equal(unitToKg(250, 'g'), 0.25);
  assert.equal(unitToKg(10, undefined), 10);
  assert.equal(unitToKg(3, 'bag'), null);
});

test('bags x pack size -> kg, zero until both are filled', () => {
  assert.equal(packsToKg(40, 50), 2000);
  assert.equal(packsToKg('12', '25.5'), 306);
  assert.equal(packsToKg(0, 50), 0);
  assert.equal(packsToKg(10, ''), 0);
});

test('balance: input = outputs + loss', () => {
  assert.equal(quickBalance(2000, 1300, 100).state, 'unaccounted');
  assert.equal(quickBalance(2000, 1300, 100).remainingKg, 600);
  const ok = quickBalance(2000, 1300, 700);
  assert.equal(ok.balanced, true);
  assert.equal(ok.state, 'balanced');
  assert.equal(quickBalance(2000, 1900, 300).state, 'over');
  assert.equal(quickBalance(0, 0, 0).state, 'empty');
});

test('5 g tolerance, same as the server', () => {
  assert.equal(quickBalance(1000, 999.996, 0).balanced, true);
  assert.equal(quickBalance(1000, 999.99, 0).balanced, false);
});

test('"rest is waste" never goes negative', () => {
  assert.equal(lossToBalance(2000, 1300), 700);
  assert.equal(lossToBalance(2000, 2100), 0);
});

test('yield %', () => {
  assert.equal(yieldPct(650, 1000), 65);
  assert.equal(yieldPct(1, 3), 33.3);
  assert.equal(yieldPct(5, 0), null);
});

test('the four input sources', () => {
  assert.deepEqual([...QUICK_SOURCES], ['raw_lot', 'job_work', 'wip', 'rejection']);
});
