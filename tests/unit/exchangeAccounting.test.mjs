/**
 * Regression tests for exchange + return accounting correctness.
 *
 * Tests the pure-math layer that underpins the exchange route
 * (app/api/v1/billing/exchange/route.ts) and the plain-return route
 * (app/api/v1/billing/returns/route.ts), verifying that the dashboard's
 * totalCollection stays correct for all business scenarios.
 *
 * No DB access required — the test simulates the amountPaid update logic
 * and verifies the resulting dashboard collection figure.
 *
 * Scenarios tested:
 *   1. Old ₹2,100 → New ₹3,100 — customer pays ₹1,000 difference (Cash)
 *   2. Old ₹2,100 → New ₹1,000 — customer receives ₹1,100 change
 *   3. Equal-value exchange (₹2,100 ↔ ₹2,100)
 *   4. Exchange where difference goes to Udhar
 *   5. Full product return and cash refund (no exchange)
 *   6. Partial payment on the original invoice (exchange case)
 *   7. Original invoice with outstanding balance + exchange for cheaper item
 *   8. Duplicate / over-return blocked by planReturn logic
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ─── inlined helpers (same logic as lib/server/refunds.ts) ──────────────────

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Exact copy of lib/server/refunds.ts splitRefund (no @/ imports needed).
 * Udhar first, cash second.
 */
function splitRefund(totalRefund, billOutstanding, customerDue) {
  const cap = customerDue === null
    ? billOutstanding
    : Math.min(billOutstanding, Math.max(0, customerDue));
  const udharCleared = round2(Math.min(totalRefund, Math.max(0, cap)));
  return { udharCleared, cashRefunded: round2(totalRefund - udharCleared) };
}

/**
 * Minimal planReturn logic — only the parts needed for over-return / duplicate
 * detection tests (no DB, no ApiError import).
 */
function checkReturnQuantity(saleItemQty, priorReturnedQty, requestedQty) {
  const returnable = saleItemQty - priorReturnedQty;
  if (requestedQty > returnable + 1e-9) {
    throw new Error(`Only ${Math.max(0, returnable)} of this item can still be returned`);
  }
  return true;
}

// ─── core accounting simulator ───────────────────────────────────────────────

/**
 * Simulates the DB writes the exchange route performs and returns the
 * resulting sale amountPaid values the dashboard will SUM.
 *
 *   originalAmountPaidAfter = original sale's amountPaid after exchange update
 *   exchangeAmountPaid      = new exchange sale's amountPaid (unchanged from route)
 *   salesCollection         = what the dashboard sums from sale rows
 *   returnsAmount           = always 0 for exchange (settled=true in note)
 *   totalCollection         = salesCollection - returnsAmount
 *
 * THE FIX (exchange/route.ts line 441): always decrement the original sale's
 * amountPaid by returnValue (capped to prevent negatives), not just by
 * cashRefunded when difference < 0. This removes the double-counting of the
 * trade-in credit from salesCollection.
 */
function simulateExchangeCollection({
  originalAmountPaid,
  returnValue,
  exchangeValue,
  settlementMethod = 'Cash',
}) {
  const difference = round2(exchangeValue - returnValue);

  // Exchange route: set exchangeAmountPaid (unchanged logic from route)
  let exchangeAmountPaid;
  if (difference <= 0) {
    exchangeAmountPaid = exchangeValue;           // fully "paid" via trade-in
  } else if (settlementMethod === 'Udhar') {
    exchangeAmountPaid = returnValue;             // trade-in portion only; diff → udhar
  } else {
    exchangeAmountPaid = exchangeValue;           // trade-in + cash diff
  }

  // THE FIX: always decrement original sale amountPaid by returnValue (capped)
  const amountPaidDecrement = Math.min(returnValue, originalAmountPaid);
  const originalAmountPaidAfter = round2(originalAmountPaid - amountPaidDecrement);

  // Dashboard SUM(amountPaid) over both sale rows
  const salesCollection = round2(originalAmountPaidAfter + exchangeAmountPaid);
  const returnsAmount = 0; // exchange returns always have settled:true in note
  return {
    originalAmountPaidAfter,
    exchangeAmountPaid,
    salesCollection,
    totalCollection: round2(salesCollection - returnsAmount),
  };
}

/**
 * What the BUGGY pre-fix code produced — only decremented by cashRefunded
 * (which is 0 when difference >= 0).
 */
function simulateExchangeCollectionBuggy({
  originalAmountPaid,
  returnValue,
  exchangeValue,
  settlementMethod = 'Cash',
}) {
  const difference = round2(exchangeValue - returnValue);
  let exchangeAmountPaid;
  if (difference <= 0) exchangeAmountPaid = exchangeValue;
  else if (settlementMethod === 'Udhar') exchangeAmountPaid = returnValue;
  else exchangeAmountPaid = exchangeValue;

  // BUG: cashRefunded = 0 when difference >= 0 → amountPaid never decremented
  let cashRefunded = 0;
  if (difference < 0) {
    const excess = -difference;
    const outstandingOnBill = Math.max(0, returnValue - originalAmountPaid);
    ({ cashRefunded } = splitRefund(excess, outstandingOnBill, null));
  }
  const amountPaidDecrementBuggy = Math.min(cashRefunded, originalAmountPaid);
  return round2((originalAmountPaid - amountPaidDecrementBuggy) + exchangeAmountPaid);
}

// ─── Scenario 1: Upgrade exchange — customer pays more ───────────────────────

test('Scenario 1: exchange ₹2,100→₹3,100 — customer pays ₹1,000 diff', () => {
  const { originalAmountPaidAfter, exchangeAmountPaid, totalCollection } =
    simulateExchangeCollection({ originalAmountPaid: 2100, returnValue: 2100, exchangeValue: 3100 });

  // Original sale's amountPaid must be zeroed — trade-in credit fully absorbed
  assert.equal(originalAmountPaidAfter, 0, 'original amountPaid should be 0 after trade-in');
  assert.equal(exchangeAmountPaid, 3100);
  // Dashboard sees ₹3,100 = ₹2,100 original + ₹1,000 extra paid
  assert.equal(totalCollection, 3100);

  // Confirm old code was wrong
  const buggy = simulateExchangeCollectionBuggy({ originalAmountPaid: 2100, returnValue: 2100, exchangeValue: 3100 });
  assert.equal(buggy, 5200, 'buggy code double-counted returnValue → ₹5,200');
});

// ─── Scenario 2: Downgrade exchange — customer receives change ────────────────

test('Scenario 2: exchange ₹2,100→₹1,000 — customer receives ₹1,100 change', () => {
  const { originalAmountPaidAfter, exchangeAmountPaid, totalCollection } =
    simulateExchangeCollection({ originalAmountPaid: 2100, returnValue: 2100, exchangeValue: 1000 });

  assert.equal(originalAmountPaidAfter, 0);
  assert.equal(exchangeAmountPaid, 1000);
  // Net: shop keeps ₹1,000 (received ₹2,100, gave ₹1,100 change)
  assert.equal(totalCollection, 1000);

  const buggy = simulateExchangeCollectionBuggy({ originalAmountPaid: 2100, returnValue: 2100, exchangeValue: 1000 });
  assert.equal(buggy, 2000, 'buggy code produced ₹2,000 instead of ₹1,000');
});

// ─── Scenario 3: Equal-value exchange ────────────────────────────────────────

test('Scenario 3: equal-value exchange ₹2,100↔₹2,100', () => {
  const { originalAmountPaidAfter, exchangeAmountPaid, totalCollection } =
    simulateExchangeCollection({ originalAmountPaid: 2100, returnValue: 2100, exchangeValue: 2100 });

  assert.equal(originalAmountPaidAfter, 0);
  assert.equal(exchangeAmountPaid, 2100);
  // No new cash changed hands — collection equals what the exchange item costs
  assert.equal(totalCollection, 2100);
});

// ─── Scenario 4: Upgrade exchange, difference on Udhar ───────────────────────

test('Scenario 4: exchange ₹2,100→₹3,100, ₹1,000 difference on Udhar', () => {
  const { originalAmountPaidAfter, exchangeAmountPaid, totalCollection } =
    simulateExchangeCollection({
      originalAmountPaid: 2100,
      returnValue: 2100,
      exchangeValue: 3100,
      settlementMethod: 'Udhar',
    });

  assert.equal(originalAmountPaidAfter, 0);
  // Exchange sale's amountPaid = returnValue (only trade-in; diff goes to customer udhar account)
  assert.equal(exchangeAmountPaid, 2100);
  // Dashboard = ₹2,100; ₹1,000 is new udhar (tracked in periodUdhar, not collection)
  assert.equal(totalCollection, 2100);
});

// ─── Scenario 5: Full return — cash refund (no exchange) ─────────────────────

test('Scenario 5: plain full return ₹2,100 — refund to customer', () => {
  // Returns route: amountPaid decremented by cashRefunded (not by returnValue).
  // Bill fully paid; no udhar outstanding.
  const totalRefund = 2100;
  const paidBefore = 2100;
  const outstandingOnBill = 0;
  const { udharCleared, cashRefunded } = splitRefund(totalRefund, outstandingOnBill, null);

  assert.equal(udharCleared, 0, 'no outstanding → no udhar to clear');
  assert.equal(cashRefunded, 2100, 'all refunded as cash');

  // Sale row update in returns route: amountPaid -= min(cashRefunded, paidBefore)
  const amountPaidAfter = paidBefore - Math.min(cashRefunded, paidBefore);
  assert.equal(amountPaidAfter, 0, 'amountPaid goes to 0');

  // materialReturn has settled:true → returnsAmount = 0
  // Dashboard: salesCollection = 0 (no exchange sale, original zeroed)
  assert.equal(amountPaidAfter, 0, 'full refund → collection = 0');
});

test('Scenario 5b: plain return, udhar cleared first then cash', () => {
  // Bill ₹2,100, paid ₹500, outstanding ₹1,600, customer has ₹800 total_due
  const { udharCleared, cashRefunded } = splitRefund(2100, 1600, 800);

  // cap = min(outstanding=1600, customerDue=800) = 800
  assert.equal(udharCleared, 800);
  assert.equal(cashRefunded, 1300);

  // amountPaid drops by cash out (not by udhar cleared — that was never paid in cash)
  const paidBefore = 500;
  const amountPaidAfter = paidBefore - Math.min(cashRefunded, paidBefore);
  assert.equal(amountPaidAfter, 0, 'amountPaid floors at 0, never negative');
});

test('Scenario 5c: plain return, bill partially paid, no udhar', () => {
  // Bill ₹2,100, paid ₹1,000, no outstanding udhar (customer is a guest or credit_limit=0)
  const { udharCleared, cashRefunded } = splitRefund(2100, 1100, null);

  // null customerDue → cap = outstanding on bill = 1100
  assert.equal(udharCleared, 1100);
  assert.equal(cashRefunded, 1000);

  // Sale: amountPaid was 1000, decremented by min(cashRefunded=1000, paid=1000) = 1000
  const amountPaidAfter = 1000 - Math.min(1000, 1000);
  assert.equal(amountPaidAfter, 0);
});

// ─── Scenario 6: Partial payment on original invoice + exchange upgrade ───────

test('Scenario 6: original paid ₹1,000 of ₹2,100 — exchange for ₹3,100 (Cash diff)', () => {
  // Customer only paid ₹1,000 of their ₹2,100 bill.
  // They return the full item and exchange for a ₹3,100 item, paying ₹1,000 diff.
  const { originalAmountPaidAfter, exchangeAmountPaid, totalCollection } =
    simulateExchangeCollection({ originalAmountPaid: 1000, returnValue: 2100, exchangeValue: 3100 });

  // Decrement capped at originalAmountPaid (min(2100, 1000) = 1000) → floor at 0
  assert.equal(originalAmountPaidAfter, 0, 'amountPaid cannot go negative');
  assert.equal(exchangeAmountPaid, 3100);
  // ₹3,100 = ₹1,000 cash (original) + ₹1,100 outstanding forgiven via trade-in + ₹1,000 cash diff
  assert.equal(totalCollection, 3100);
});

test('Scenario 6b: completely unpaid original bill — exchange for any item', () => {
  // Edge: customer had ₹0 amountPaid (pure udhar sale)
  const { originalAmountPaidAfter, exchangeAmountPaid, totalCollection } =
    simulateExchangeCollection({ originalAmountPaid: 0, returnValue: 2100, exchangeValue: 3100 });

  // min(returnValue=2100, 0) = 0, no decrement
  assert.equal(originalAmountPaidAfter, 0);
  assert.equal(exchangeAmountPaid, 3100);
  assert.equal(totalCollection, 3100);
});

// ─── Scenario 7: Outstanding balance + downgrade exchange ────────────────────

test('Scenario 7: paid ₹1,000 of ₹2,100 — exchange for ₹500 (downgrade, change given)', () => {
  // Customer has ₹1,100 outstanding. Returns item, exchanges for ₹500 item.
  // difference = -1600; excess = 1600; outstanding = 1100; customerDue = 1100
  const excess = 2100 - 500; // 1600
  const outstandingOnBill = 2100 - 1000; // 1100
  const { udharCleared, cashRefunded } = splitRefund(excess, outstandingOnBill, 1100);

  assert.equal(udharCleared, 1100, 'outstanding cleared first');
  assert.equal(cashRefunded, 500, 'remaining as cash change');

  // Exchange route: exchangeAmountPaid = exchangeValue = 500 (diff <= 0)
  const exchangeAmountPaid = 500;

  // WITH FIX: original decremented by min(returnValue=2100, amountPaid=1000) = 1000
  const originalAmountPaidAfter = 1000 - Math.min(2100, 1000); // 0
  const salesCollectionFixed = originalAmountPaidAfter + exchangeAmountPaid; // 500
  assert.equal(salesCollectionFixed, 500,
    'net collection = ₹500 after fix');

  // BUGGY: original decremented by min(cashRefunded=500, 1000) = 500 → 500 remaining
  const originalAmountPaidBuggy = 1000 - Math.min(cashRefunded, 1000); // 500
  const salesCollectionBuggy = originalAmountPaidBuggy + exchangeAmountPaid; // 1000
  assert.equal(salesCollectionBuggy, 1000, 'buggy code produced ₹1,000');
  assert.notEqual(salesCollectionBuggy, salesCollectionFixed, 'fix must produce different result');
});

test('Scenario 7b: even exchange when original had outstanding balance', () => {
  // Paid ₹500 of ₹2,100. Exchange ₹2,100 for ₹2,100 (same value). No cash moves.
  const { originalAmountPaidAfter, exchangeAmountPaid, totalCollection } =
    simulateExchangeCollection({ originalAmountPaid: 500, returnValue: 2100, exchangeValue: 2100 });

  // min(2100, 500) = 500 decrement → 0
  assert.equal(originalAmountPaidAfter, 0);
  assert.equal(exchangeAmountPaid, 2100);
  assert.equal(totalCollection, 2100);
});

// ─── Scenario 8: Duplicate / over-return prevention ──────────────────────────

test('Scenario 8: duplicate return attempt blocked (all already returned)', () => {
  // Item qty=1, all 1 already returned
  assert.throws(
    () => checkReturnQuantity(1, 1, 1),
    /can still be returned/,
    'should reject duplicate return of already-returned item'
  );
});

test('Scenario 8b: partial over-return blocked', () => {
  // Item qty=3, 2 already returned, try to return 2 more (only 1 remains)
  assert.throws(
    () => checkReturnQuantity(3, 2, 2),
    /can still be returned/
  );
});

test('Scenario 8c: returning exact remaining qty allowed', () => {
  // Item qty=3, 2 already returned, return the last 1 — should succeed
  assert.doesNotThrow(() => checkReturnQuantity(3, 2, 1));
});

test('Scenario 8d: first-time return (no prior returns) allowed', () => {
  assert.doesNotThrow(() => checkReturnQuantity(5, 0, 5));
});

// ─── amountPaid floor guard ───────────────────────────────────────────────────

test('amountPaid never goes negative: returnValue exceeds amountPaid', () => {
  const originalAmountPaid = 300;
  const returnValue = 2100;
  const decrement = Math.min(returnValue, originalAmountPaid);
  const after = originalAmountPaid - decrement;
  assert.equal(after, 0);
  assert.ok(after >= 0, 'must not be negative');
});

test('amountPaid stays at 0 when original was already 0', () => {
  const decrement = Math.min(2100, 0);
  assert.equal(0 - decrement, 0);
});

test('amountPaid stays unchanged when returnValue is 0', () => {
  const decrement = Math.min(0, 1500);
  assert.equal(1500 - decrement, 1500);
});

// ─── splitRefund edge cases ───────────────────────────────────────────────────

test('splitRefund: no outstanding, all cash', () => {
  const { udharCleared, cashRefunded } = splitRefund(500, 0, 0);
  assert.equal(udharCleared, 0);
  assert.equal(cashRefunded, 500);
});

test('splitRefund: outstanding absorbs refund fully', () => {
  const { udharCleared, cashRefunded } = splitRefund(300, 500, 800);
  assert.equal(udharCleared, 300);
  assert.equal(cashRefunded, 0);
});

test('splitRefund: refund exceeds outstanding — splits correctly', () => {
  const { udharCleared, cashRefunded } = splitRefund(1000, 300, 300);
  assert.equal(udharCleared, 300);
  assert.equal(cashRefunded, 700);
});

test('splitRefund: null customerDue — only bill outstanding caps udhar', () => {
  const { udharCleared, cashRefunded } = splitRefund(1000, 400, null);
  assert.equal(udharCleared, 400);
  assert.equal(cashRefunded, 600);
});

test('splitRefund: zero refund — nothing moves', () => {
  const { udharCleared, cashRefunded } = splitRefund(0, 500, 500);
  assert.equal(udharCleared, 0);
  assert.equal(cashRefunded, 0);
});

// ─── originalOutstandingDelta formula (Phase B udhar fix) ─────────────────────
// Formula: max(0, returnValue - originalAmountPaid)  (only for difference >= 0)
// This is the amount by which customer.totalDue must be decremented when the
// trade-in credit covers originally-outstanding debt on the returned invoice.

function computeOutstandingDelta({ returnValue, originalAmountPaid, difference }) {
  if (difference < 0) return 0; // difference < 0 is handled by splitRefund / udharCleared
  return Math.max(0, returnValue - originalAmountPaid);
}

function applySafeDecrement(delta, customerTotalDue) {
  return Math.min(delta, Math.max(0, customerTotalDue));
}

test('Phase B: fully-paid original bill → delta is 0 (no orphan)', () => {
  // Bill ₹2,100 fully paid; exchange for same or higher value
  const delta = computeOutstandingDelta({ returnValue: 2100, originalAmountPaid: 2100, difference: 0 });
  assert.equal(delta, 0, 'no orphaned outstanding on a fully-paid bill');
});

test('Phase B: fully-paid, upgrade exchange → delta still 0', () => {
  const delta = computeOutstandingDelta({ returnValue: 2100, originalAmountPaid: 2100, difference: 1000 });
  assert.equal(delta, 0);
});

test('Phase B: partially-paid, full return (diff=0) → delta equals outstanding', () => {
  // Paid ₹1,000 of ₹2,100; outstanding = ₹1,100
  const delta = computeOutstandingDelta({ returnValue: 2100, originalAmountPaid: 1000, difference: 0 });
  assert.equal(delta, 1100, 'orphaned outstanding = returnValue − amountPaid');
});

test('Phase B: partially-paid, upgrade exchange → delta equals outstanding', () => {
  // Paid ₹1,000, returnValue=₹2,100, exchangeValue=₹3,100 (diff=₹1,000)
  const delta = computeOutstandingDelta({ returnValue: 2100, originalAmountPaid: 1000, difference: 1000 });
  assert.equal(delta, 1100);
});

test('Phase B: fully-unpaid original, full return → delta = full returnValue', () => {
  // Pure udhar bill, completely returned
  const delta = computeOutstandingDelta({ returnValue: 2100, originalAmountPaid: 0, difference: 0 });
  assert.equal(delta, 2100);
});

test('Phase B: partial return within paid portion → delta is 0', () => {
  // Bill ₹5,000, paid ₹3,000, outstanding ₹2,000. Return only ₹1,000 worth.
  // Trade-in stays within the paid portion; outstanding unchanged.
  const delta = computeOutstandingDelta({ returnValue: 1000, originalAmountPaid: 3000, difference: 0 });
  assert.equal(delta, 0, 'return within paid portion does not touch outstanding');
});

test('Phase B: partial return crossing paid/outstanding boundary', () => {
  // Bill ₹5,000, paid ₹1,000, outstanding ₹4,000. Return ₹3,000.
  // Outstanding reduced by 3000−1000 = 2000.
  const delta = computeOutstandingDelta({ returnValue: 3000, originalAmountPaid: 1000, difference: 0 });
  assert.equal(delta, 2000);
});

test('Phase B: difference < 0 → delta always 0 (handled by splitRefund path)', () => {
  // Even if originalAmountPaid < returnValue, the difference < 0 path uses splitRefund
  const delta = computeOutstandingDelta({ returnValue: 2100, originalAmountPaid: 500, difference: -1000 });
  assert.equal(delta, 0, 'difference < 0 should never use originalOutstandingDelta');
});

test('Phase B: safeDecrement caps at customerTotalDue', () => {
  // Delta is ₹1,100 but customer somehow only has ₹800 total_due (data inconsistency)
  const delta = 1100;
  const safeDec = applySafeDecrement(delta, 800);
  assert.equal(safeDec, 800, 'cap at customer.totalDue to prevent going negative');
});

test('Phase B: safeDecrement when totalDue exactly equals delta', () => {
  const safeDec = applySafeDecrement(1100, 1100);
  assert.equal(safeDec, 1100);
});

test('Phase B: safeDecrement when totalDue is 0 → nothing decremented', () => {
  const safeDec = applySafeDecrement(1100, 0);
  assert.equal(safeDec, 0, 'no decrement when totalDue already 0');
});

test('Phase B: safeDecrement when totalDue is negative → nothing decremented', () => {
  // Defensive guard: totalDue should never be negative but max(0,...) handles it
  const safeDec = applySafeDecrement(1100, -50);
  assert.equal(safeDec, 0);
});

test('Phase B: credit limit check uses reduced curDue after outstanding clearing', () => {
  // lockedCustomer.total_due = 800, originalOutstandingDelta = 500, udharAdded = 400, limit = 1000
  // Pre-fix check: 800 + 400 = 1200 > 1000 → would throw (wrong)
  // Post-fix check: max(0, 800 − 500) + 400 = 300 + 400 = 700 ≤ 1000 → allowed (correct)
  const totalDueLocked = 800;
  const outstandingDelta = 500;
  const udharAdded = 400;
  const creditLimit = 1000;

  const curDueBefore = totalDueLocked;
  const curDueAfter = Math.max(0, totalDueLocked - outstandingDelta);

  assert.ok(curDueBefore + udharAdded > creditLimit, 'old check would incorrectly reject');
  assert.ok(curDueAfter + udharAdded <= creditLimit, 'new check correctly allows');
});
