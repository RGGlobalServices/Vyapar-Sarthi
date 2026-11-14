import test from 'node:test';
import assert from 'node:assert/strict';
import { priceForMode, makeBasis, inclusiveFromEntered, switchSpMode, round2 } from '../../lib/priceGst.ts';

// The reported bug: a product stored at ₹20 incl. 5% GST, flagged "Excluding", must not become ₹21 after an untouched Edit→Save.
test('untouched Edit→Save never changes the stored price, in any mode', () => {
  for (const mode of ['inclusive', 'exclusive', null]) {
    for (const gst of [0, 5, 12, 18, 28]) {
      for (const stored of [20, 99, 739.5, 775.95, 1299, 408.74, 0.01]) {
        const basis = makeBasis(stored, gst, mode);
        assert.equal(inclusiveFromEntered(basis.display, gst, mode, basis), stored, `${mode} gst=${gst} stored=${stored}`);
      }
    }
  }
});

test('Excluding mode shows the base price, not the stored inclusive price', () => {
  assert.equal(priceForMode(105, 5, 'exclusive'), 100);
  assert.equal(priceForMode(105, 5, 'inclusive'), 105);
  assert.equal(priceForMode(739, 5, 'exclusive'), 703.81);
  assert.equal(priceForMode(100, 0, 'exclusive'), 100);
});

test('typing a new Excluding price saves it as the inclusive price, rounded to paise', () => {
  assert.equal(inclusiveFromEntered('100', 5, 'exclusive', null), 105);
  assert.equal(inclusiveFromEntered('100', 18, 'exclusive', null), 118);
  assert.equal(inclusiveFromEntered('84.75', 18, 'exclusive', null), 100.01);    // 84.75*1.18 = 100.005 → paise, no float noise
  assert.equal(inclusiveFromEntered('720', 5, 'inclusive', null), 720);
  assert.equal(inclusiveFromEntered('', 5, 'exclusive', null), 0);
});

test('an edited price is converted, an edited GST% re-converts the unchanged box', () => {
  const basis = makeBasis(105, 5, 'exclusive');                                  // box shows 100
  assert.equal(inclusiveFromEntered('110', 5, 'exclusive', basis), 115.5);
  assert.equal(inclusiveFromEntered(basis.display, 12, 'exclusive', basis), 112); // GST changed → 100 base at 12%
});

test('Including⇄Excluding toggle round-trips exactly (no paise drift)', () => {
  for (const [stored, gst] of [[100, 18], [739, 5], [1299, 12], [20, 5], [999, 28]]) {
    const b0 = makeBasis(stored, gst, 'inclusive');
    const toEx = switchSpMode(b0.display, gst, 'inclusive', 'exclusive', b0);
    const back = switchSpMode(toEx.display, gst, 'exclusive', 'inclusive', toEx.basis);
    assert.equal(inclusiveFromEntered(back.display, gst, 'inclusive', back.basis), stored);
    assert.equal(back.display, String(round2(stored)));
  }
});

test('zero / empty price stays empty in the form', () => {
  assert.equal(makeBasis(0, 5, 'exclusive').display, '');
});
