import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMillInvoice,
  normalizeMillCharges,
  normalizeMillDiscount,
  parseStrictNumber,
  rupeesToPaiseExact,
  MillBillingError,
  MILL_MAX_CHARGE_PAISE,
  MILL_MAX_CHARGES_TOTAL_PAISE,
} from '../../lib/millBilling.ts';

// ── helpers ──────────────────────────────────────────────────────────────────

function line(rate, quantity, gstRate = 0, costTotal = 0) {
  return { rate, quantity, gstRate, costTotal };
}

function nonGstBill(lines, discount = null, charges = {}) {
  return { lines, discount, billType: 'non_gst', interState: false, charges: normalizeMillCharges(charges) };
}

function gstBill(lines, discount = null, charges = {}, interState = false) {
  return { lines, discount, billType: 'gst', interState, charges: normalizeMillCharges(charges) };
}

// ── parseStrictNumber ─────────────────────────────────────────────────────────

test('parseStrictNumber: accepts integers and decimals', () => {
  assert.equal(parseStrictNumber(100, 'x'), 100);
  assert.equal(parseStrictNumber('45.50', 'x'), 45.5);
  assert.equal(parseStrictNumber(0, 'x'), 0);
});

test('parseStrictNumber: rejects non-numeric strings', () => {
  assert.throws(() => parseStrictNumber('abc', 'x'), MillBillingError);
  assert.throws(() => parseStrictNumber('1e3', 'x'), MillBillingError);
  assert.throws(() => parseStrictNumber('', 'x'), MillBillingError);
  assert.throws(() => parseStrictNumber(null, 'x'), MillBillingError);
  assert.throws(() => parseStrictNumber(NaN, 'x'), MillBillingError);
});

// ── rupeesToPaiseExact ───────────────────────────────────────────────────────

test('rupeesToPaiseExact: converts correctly', () => {
  assert.equal(rupeesToPaiseExact(100, 'x'), 10000);
  assert.equal(rupeesToPaiseExact(100.50, 'x'), 10050);
  assert.equal(rupeesToPaiseExact(0, 'x'), 0);
});

test('rupeesToPaiseExact: rejects more than 2 decimal places', () => {
  assert.throws(() => rupeesToPaiseExact(100.123, 'x'), MillBillingError);
});

// ── normalizeMillCharges ─────────────────────────────────────────────────────

test('normalizeMillCharges: null/undefined → all zero', () => {
  const c = normalizeMillCharges(null);
  assert.deepEqual(c, { freight: 0, hamali: 0, loading: 0, unloading: 0, other: 0 });
});

test('normalizeMillCharges: partial object fills the rest with 0', () => {
  const c = normalizeMillCharges({ freight: 500, hamali: 200 });
  assert.equal(c.freight, 500);
  assert.equal(c.hamali, 200);
  assert.equal(c.loading, 0);
});

test('normalizeMillCharges: legacy "transport" maps to "freight"', () => {
  const c = normalizeMillCharges({ transport: 1000 });
  assert.equal(c.freight, 1000);
});

test('normalizeMillCharges: both transport and freight → error', () => {
  assert.throws(() => normalizeMillCharges({ transport: 100, freight: 200 }), MillBillingError);
});

test('normalizeMillCharges: unknown key → error', () => {
  assert.throws(() => normalizeMillCharges({ gst: 100 }), MillBillingError);
});

test('normalizeMillCharges: negative charge → error', () => {
  assert.throws(() => normalizeMillCharges({ freight: -100 }), MillBillingError);
});

test('normalizeMillCharges: single charge over ₹10L limit → error', () => {
  assert.throws(() => normalizeMillCharges({ freight: 1_000_001 }), MillBillingError);
});

test('normalizeMillCharges: total charges over ₹25L limit → error', () => {
  assert.throws(
    () => normalizeMillCharges({ freight: 600000, hamali: 600000, loading: 600000, unloading: 600000, other: 600000 }),
    MillBillingError
  );
});

// ── normalizeMillDiscount ─────────────────────────────────────────────────────

test('normalizeMillDiscount: null/empty → null', () => {
  assert.equal(normalizeMillDiscount(null), null);
  assert.equal(normalizeMillDiscount(''), null);
  assert.equal(normalizeMillDiscount(undefined), null);
});

test('normalizeMillDiscount: bare number = fixed discount', () => {
  const d = normalizeMillDiscount(500);
  assert.deepEqual(d, { type: 'fixed', value: 500 });
});

test('normalizeMillDiscount: {type: "percentage", value: 10}', () => {
  const d = normalizeMillDiscount({ type: 'percentage', value: 10 });
  assert.deepEqual(d, { type: 'percentage', value: 10 });
});

test('normalizeMillDiscount: percentage > 100 → error', () => {
  assert.throws(() => normalizeMillDiscount({ type: 'percentage', value: 101 }), MillBillingError);
});

test('normalizeMillDiscount: negative → error', () => {
  assert.throws(() => normalizeMillDiscount(-100), MillBillingError);
});

// ── calculateMillInvoice: non-GST bills ──────────────────────────────────────

test('non-GST: single line, no discount, no charges', () => {
  const r = calculateMillInvoice(nonGstBill([line(33.5, 1000)]));
  assert.equal(r.goodsSubtotal, 33500);
  assert.equal(r.discount, 0);
  assert.equal(r.taxable, 33500);
  assert.equal(r.totalGst, 0);
  assert.equal(r.chargesTotal, 0);
  assert.equal(r.grandTotal, 33500);
  assert.equal(r.gstBilled, false);
});

test('non-GST: rate × qty with round-off (33.5 × 123 = 4120.50 → grandTotal 4121)', () => {
  const r = calculateMillInvoice(nonGstBill([line(33.5, 123)]));
  // 33.5 × 123 = 4120.50 → round-off +0.50 → grandTotal = 4121
  assert.equal(r.grandTotal, 4121);
  assert.equal(r.roundOff, 0.5);
});

test('non-GST: multiple lines, grand total = sum of all', () => {
  const r = calculateMillInvoice(nonGstBill([
    line(100, 50),   // 5000
    line(200, 30),   // 6000
    line(50, 100),   // 5000
  ]));
  assert.equal(r.goodsSubtotal, 16000);
  assert.equal(r.grandTotal, 16000);
});

test('non-GST: fixed discount applied to goods only', () => {
  const r = calculateMillInvoice(nonGstBill(
    [line(100, 100)],        // goods = 10000
    { type: 'fixed', value: 500 }
  ));
  assert.equal(r.goodsSubtotal, 10000);
  assert.equal(r.discount, 500);
  assert.equal(r.taxable, 9500);
  assert.equal(r.grandTotal, 9500);
});

test('non-GST: percentage discount', () => {
  const r = calculateMillInvoice(nonGstBill(
    [line(100, 100)],       // goods = 10000
    { type: 'percentage', value: 10 }
  ));
  assert.equal(r.discount, 1000);
  assert.equal(r.taxable, 9000);
  assert.equal(r.grandTotal, 9000);
});

test('non-GST: discount capped at goods subtotal (cannot go negative)', () => {
  const r = calculateMillInvoice(nonGstBill(
    [line(100, 10)],       // goods = 1000
    { type: 'fixed', value: 9999 }  // huge discount → capped at 1000
  ));
  assert.equal(r.discount, 1000);
  assert.equal(r.taxable, 0);
  assert.equal(r.grandTotal, 0);
});

test('non-GST: charges added to grand total (no GST on charges)', () => {
  const r = calculateMillInvoice(nonGstBill(
    [line(100, 100)],
    null,
    { freight: 500, hamali: 200 }
  ));
  assert.equal(r.chargesTotal, 700);
  assert.equal(r.grandTotal, 10700);
});

test('non-GST: round-off brings grand total to whole rupee', () => {
  // 33.5 × 3 = 100.5 → grandTotal should be 101 (round-off = +0.5)
  const r = calculateMillInvoice(nonGstBill([line(33.5, 3)]));
  assert.equal(r.grandTotal % 1, 0);
  assert.ok(Math.abs(r.roundOff) <= 0.5);
});

// ── calculateMillInvoice: GST bills ──────────────────────────────────────────

test('GST intra-state: CGST + SGST, no IGST', () => {
  const r = calculateMillInvoice(gstBill(
    [line(100, 100, 5)],  // goods = 10000, GST 5%
  ));
  assert.equal(r.gstBilled, true);
  assert.equal(r.interState, false);
  assert.equal(r.taxable, 10000);
  assert.equal(r.totalGst, 500);
  assert.equal(r.cgst, 250);
  assert.equal(r.sgst, 250);
  assert.equal(r.igst, 0);
  assert.equal(r.grandTotal, 10500);
});

test('GST inter-state: IGST only, no CGST/SGST', () => {
  const r = calculateMillInvoice(gstBill(
    [line(100, 100, 5)],
    null, {}, true  // interState = true
  ));
  assert.equal(r.igst, 500);
  assert.equal(r.cgst, 0);
  assert.equal(r.sgst, 0);
  assert.equal(r.totalGst, 500);
});

test('GST: discount applies before GST (GST on taxable, not gross)', () => {
  const r = calculateMillInvoice(gstBill(
    [line(100, 100, 18)],    // gross = 10000
    { type: 'fixed', value: 1000 }  // taxable = 9000
  ));
  assert.equal(r.taxable, 9000);
  // GST 18% on 9000 = 1620
  assert.equal(r.totalGst, 1620);
  assert.equal(r.goodsWithGst, 10620);
});

test('GST: charges get no GST (only goods are taxed)', () => {
  const r = calculateMillInvoice(gstBill(
    [line(100, 100, 5)],    // GST on goods only
    null,
    { freight: 1000 }
  ));
  // GST = 5% of 10000 = 500
  assert.equal(r.totalGst, 500);
  // charges go on top of goodsWithGst
  assert.equal(r.grandTotal, 10000 + 500 + 1000);  // 11500
});

test('GST: multiple rate groups summed correctly', () => {
  const r = calculateMillInvoice(gstBill([
    line(1000, 1, 5),   // 5% group: taxable = 1000
    line(1000, 1, 18),  // 18% group: taxable = 1000
  ]));
  assert.equal(r.groups.length, 2);
  const g5  = r.groups.find(g => g.rate === 5);
  const g18 = r.groups.find(g => g.rate === 18);
  assert.equal(g5.gst, 50);
  assert.equal(g18.gst, 180);
  assert.equal(r.totalGst, 230);
});

test('GST: 0% rate line adds to taxable but contributes no GST', () => {
  const r = calculateMillInvoice(gstBill([
    line(1000, 1, 0),   // 0% — taxable but no GST
    line(1000, 1, 5),   // 5%
  ]));
  assert.equal(r.taxable, 2000);
  assert.equal(r.totalGst, 50);  // only the 5% line contributes
});

// ── calculateMillInvoice: profit ─────────────────────────────────────────────

test('profit: taxable goods − cost (GST and charges excluded)', () => {
  const r = calculateMillInvoice(gstBill(
    [line(100, 100, 5, 7000)],  // costTotal = 7000, taxable = 10000
    null,
    { freight: 500 }
  ));
  // profit = taxable(10000) - cost(7000) = 3000
  // freight and GST are excluded from profit
  assert.equal(r.totalProfit, 3000);
});

test('profit: proportional across multiple lines', () => {
  const r = calculateMillInvoice(nonGstBill([
    line(100, 50, 0, 4000),   // gross=5000, cost=4000 → line profit=1000
    line(200, 30, 0, 5000),   // gross=6000, cost=5000 → line profit=1000
  ]));
  assert.equal(r.totalProfit, 2000);
});

// ── calculateMillInvoice: edge cases ─────────────────────────────────────────

test('throws on empty lines array', () => {
  assert.throws(() => calculateMillInvoice(nonGstBill([])), MillBillingError);
});

test('throws on quantity ≤ 0', () => {
  assert.throws(() => calculateMillInvoice(nonGstBill([line(100, 0)])), MillBillingError);
  assert.throws(() => calculateMillInvoice(nonGstBill([line(100, -1)])), MillBillingError);
});

test('throws on negative rate', () => {
  assert.throws(() => calculateMillInvoice(nonGstBill([line(-100, 10)])), MillBillingError);
});

test('zero-rate line is valid (free goods)', () => {
  const r = calculateMillInvoice(nonGstBill([line(0, 100)]));
  assert.equal(r.grandTotal, 0);
});

test('grandTotal is always a whole rupee (round-off applied)', () => {
  // Use a rate that produces fractional paise to test rounding
  const r = calculateMillInvoice(nonGstBill([line(33.33, 3)]));
  assert.equal(r.grandTotal % 1, 0);
});

test('grandTotal = preRoundTotal + roundOff', () => {
  const r = calculateMillInvoice(nonGstBill([line(150, 7)]));
  assert.equal(Math.round((r.preRoundTotal + r.roundOff) * 100), Math.round(r.grandTotal * 100));
});
