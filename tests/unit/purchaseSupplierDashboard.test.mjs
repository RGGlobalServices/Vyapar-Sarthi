/**
 * Unit Regression Test Suite for VyaparSarthii Bada Udyog Pack:
 * 1. Purchase Discount Integrity (Import, Edit, Preservation, Tax & Valuation)
 * 2. Supplier Payment Allocation (Partial Payments, Multiple Partial, Final Settlement, Status)
 * 3. Purchase Edit After Payment (Reversal & Reapply, Ledger & Stock Consistency)
 * 4. Dashboard Purchases Metrics (Invoice Date vs Creation Date, Filtering, No Double Counting)
 * 5. Financial Precision & Rounding Verification
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ─── 1. Purchase Discount & Total Calculations ──────────────────────────────

function computePurchaseTotals({ items, discount = 0, charges = 0 }) {
  let goodsTotal = 0;
  let totalGst = 0;
  for (const item of items) {
    const factor = Number(item.conversionFactor) || 1;
    const baseQuantity = Number(item.quantity) * factor;
    const baseCost = Number(item.cost) / factor;
    goodsTotal += baseQuantity * baseCost;
    if (item.gst) totalGst += Number(item.gst);
  }
  const discountAmt = Math.max(0, Number(discount) || 0);
  const chargesTotal = Math.max(0, Number(charges) || 0);
  // totalCost = goodsTotal + GST + charges - discount
  const totalCost = Math.max(0, round2(goodsTotal + totalGst + chargesTotal - discountAmt));
  return { goodsTotal: round2(goodsTotal), totalGst: round2(totalGst), discountAmt, chargesTotal, totalCost };
}

function restoreDiscountForEdit(fullInvoice) {
  // If explicitly stored in discount column, always take that
  if (fullInvoice.discount != null && fullInvoice.discount > 0) {
    return Number(fullInvoice.discount);
  }
  // Fallback for legacy rows: goodsTotal + gst + charges - totalCost
  const goodsTotal = (fullInvoice.purchaseItems || []).reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.cost) || 0), 0);
  const chargesSum = (Array.isArray(fullInvoice.charges) ? fullInvoice.charges : []).reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const gstSum = (fullInvoice.purchaseItems || []).reduce((s, it) => s + (Number(it.gst) || 0), 0) || (Number(fullInvoice.gst) || 0);
  return Math.max(0, round2(goodsTotal + gstSum + chargesSum - (Number(fullInvoice.totalCost) || 0)));
}

test('Purchase Discount: computes net purchase with fixed discount and GST', () => {
  const result = computePurchaseTotals({
    items: [
      { quantity: 10, cost: 1000, gst: 180 }, // 10,000 + 180 gst
      { quantity: 5, cost: 2000, gst: 180 },  // 10,000 + 180 gst
    ],
    discount: 1500, // Fixed bill discount ₹1,500
    charges: 200,   // Hamali ₹200
  });

  assert.equal(result.goodsTotal, 20000);
  assert.equal(result.totalGst, 360);
  assert.equal(result.chargesTotal, 200);
  assert.equal(result.discountAmt, 1500);
  // 20000 + 360 + 200 - 1500 = 19060
  assert.equal(result.totalCost, 19060);
});

test('Purchase Discount: restores discount accurately in edit mode', () => {
  const invoice = {
    totalCost: 19060,
    gst: 360,
    discount: 1500,
    charges: [{ name: 'Hamali', amount: 200 }],
    purchaseItems: [
      { quantity: 10, cost: 1000, gst: 180 },
      { quantity: 5, cost: 2000, gst: 180 },
    ],
  };

  const restored = restoreDiscountForEdit(invoice);
  assert.equal(restored, 1500, 'Should restore the exact saved discount');

  // Verify legacy fallback when discount column is missing/null
  const legacyInvoice = { ...invoice, discount: null };
  const restoredLegacy = restoreDiscountForEdit(legacyInvoice);
  assert.equal(restoredLegacy, 1500, 'Legacy calculation with GST + charges must recover the exact discount');
});

test('Purchase Discount: changing discount updates totalCost without double counting', () => {
  const items = [{ quantity: 10, cost: 5000, gst: 0 }]; // 50,000
  
  // 1. Initial import with ₹2,000 discount
  const init = computePurchaseTotals({ items, discount: 2000 });
  assert.equal(init.totalCost, 48000);

  // 2. Open in edit mode: discount is restored as 2000
  const invoiceDoc = { totalCost: init.totalCost, gst: 0, discount: init.discountAmt, purchaseItems: items };
  const restoredDiscount = restoreDiscountForEdit(invoiceDoc);
  assert.equal(restoredDiscount, 2000);

  // 3. User updates discount to ₹5,000 and saves
  const updated = computePurchaseTotals({ items, discount: 5000 });
  assert.equal(updated.totalCost, 45000);
  assert.equal(updated.discountAmt, 5000);

  // 4. User clears discount to ₹0 and saves
  const cleared = computePurchaseTotals({ items, discount: 0 });
  assert.equal(cleared.totalCost, 50000);
  assert.equal(cleared.discountAmt, 0);
});

// ─── 2. Supplier Ledger Replay & Payment Allocation ────────────────────────

function replaySupplierLedger(transactions) {
  const sorted = [...transactions].sort((a, b) => {
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (at !== bt) return at - bt;
    const aWeight = (a.type === 'payment' || a.type === 'purchase_return' || a.type === 'discount') ? 2 : 1;
    const bWeight = (b.type === 'payment' || b.type === 'purchase_return' || b.type === 'discount') ? 2 : 1;
    if (aWeight !== bWeight) return aWeight - bWeight;
    return (a.sequence || 0) - (b.sequence || 0);
  });

  const allPurchases = [];
  const purchasesByBill = new Map();

  for (const t of sorted) {
    const isCredit = (t.type === 'payment' || t.type === 'purchase_return' || t.type === 'discount');
    const amount = Number(t.amount) || 0;
    if (!isCredit && amount > 1e-6) {
      const p = {
        id: t.id,
        billNumber: t.billNumber || '',
        date: t.createdAt,
        originalAmount: amount,
        paidAmount: 0,
        remaining: amount,
        status: 'unpaid',
        paymentStatus: 'UNPAID',
      };
      allPurchases.push(p);
      if (p.billNumber) {
        const list = purchasesByBill.get(p.billNumber) || [];
        list.push(p);
        purchasesByBill.set(p.billNumber, list);
      }
    }
  }

  // Apply credits/payments
  for (const t of sorted) {
    const isCredit = (t.type === 'payment' || t.type === 'purchase_return' || t.type === 'discount');
    if (!isCredit) continue;
    let toApply = Number(t.amount) || 0;
    if (toApply <= 1e-6) continue;

    // 1. Bill-specific match
    if (t.billNumber && purchasesByBill.has(t.billNumber)) {
      for (const p of purchasesByBill.get(t.billNumber)) {
        if (p.remaining > 1e-6) {
          const take = Math.min(p.remaining, toApply);
          p.remaining = round2(p.remaining - take);
          p.paidAmount = round2(p.paidAmount + take);
          toApply = round2(toApply - take);
          if (toApply <= 1e-6) break;
        }
      }
    }

    // 2. FIFO remainder
    if (toApply > 1e-6) {
      for (const p of allPurchases) {
        if (p.remaining > 1e-6) {
          const take = Math.min(p.remaining, toApply);
          p.remaining = round2(p.remaining - take);
          p.paidAmount = round2(p.paidAmount + take);
          toApply = round2(toApply - take);
          if (toApply <= 1e-6) break;
        }
      }
    }
  }

  // Finalize statuses
  for (const p of allPurchases) {
    if (p.remaining <= 0.005) {
      p.remaining = 0;
      p.status = 'paid';
      p.paymentStatus = 'PAID';
    } else if (p.paidAmount > 0.005) {
      p.status = 'partial';
      p.paymentStatus = 'PARTIALLY_PAID';
    } else {
      p.status = 'unpaid';
      p.paymentStatus = 'UNPAID';
    }
  }

  const totalOutstanding = allPurchases.reduce((s, p) => s + p.remaining, 0);
  return { allPurchases, totalOutstanding: round2(totalOutstanding) };
}

test('Supplier Payment: ₹50,000 bill with partial payment 1 (₹20,000)', () => {
  const txns = [
    { id: 'tx-1', type: 'purchase', amount: 50000, billNumber: 'BILL-101', createdAt: '2026-11-06T10:00:00Z', sequence: 1 },
    { id: 'tx-2', type: 'payment', amount: 20000, billNumber: 'BILL-101', createdAt: '2026-11-06T12:00:00Z', sequence: 2 },
  ];

  const { allPurchases, totalOutstanding } = replaySupplierLedger(txns);
  assert.equal(allPurchases.length, 1);
  const p = allPurchases[0];
  assert.equal(p.originalAmount, 50000);
  assert.equal(p.paidAmount, 20000);
  assert.equal(p.remaining, 30000);
  assert.equal(p.status, 'partial');
  assert.equal(p.paymentStatus, 'PARTIALLY_PAID');
  assert.equal(totalOutstanding, 30000);
});

test('Supplier Payment: multiple partial payments (₹20,000 then ₹10,000 then ₹20,000 final settlement)', () => {
  const txns = [
    { id: 'tx-1', type: 'purchase', amount: 50000, billNumber: 'BILL-101', createdAt: '2026-11-06T10:00:00Z', sequence: 1 },
    { id: 'tx-2', type: 'payment', amount: 20000, billNumber: 'BILL-101', createdAt: '2026-11-06T12:00:00Z', sequence: 2 },
  ];

  let result = replaySupplierLedger(txns);
  assert.equal(result.allPurchases[0].paidAmount, 20000);
  assert.equal(result.allPurchases[0].remaining, 30000);
  assert.equal(result.allPurchases[0].paymentStatus, 'PARTIALLY_PAID');

  txns.push({ id: 'tx-3', type: 'payment', amount: 10000, billNumber: 'BILL-101', createdAt: '2026-11-06T14:00:00Z', sequence: 3 });
  result = replaySupplierLedger(txns);
  assert.equal(result.allPurchases[0].paidAmount, 30000);
  assert.equal(result.allPurchases[0].remaining, 20000);
  assert.equal(result.allPurchases[0].paymentStatus, 'PARTIALLY_PAID');

  txns.push({ id: 'tx-4', type: 'payment', amount: 20000, billNumber: 'BILL-101', createdAt: '2026-11-06T16:00:00Z', sequence: 4 });
  result = replaySupplierLedger(txns);
  assert.equal(result.allPurchases[0].paidAmount, 50000);
  assert.equal(result.allPurchases[0].remaining, 0);
  assert.equal(result.allPurchases[0].status, 'paid');
  assert.equal(result.allPurchases[0].paymentStatus, 'PAID');
  assert.equal(result.totalOutstanding, 0);
});

test('Supplier Payment: Bill-specific allocation takes priority over older open bills', () => {
  const txns = [
    { id: 'tx-1', type: 'purchase', amount: 40000, billNumber: 'BILL-001', createdAt: '2026-11-01T10:00:00Z', sequence: 1 },
    { id: 'tx-2', type: 'purchase', amount: 25000, billNumber: 'BILL-002', createdAt: '2026-11-05T10:00:00Z', sequence: 2 },
    { id: 'tx-3', type: 'payment', amount: 15000, billNumber: 'BILL-002', createdAt: '2026-11-06T10:00:00Z', sequence: 3 },
  ];

  const { allPurchases, totalOutstanding } = replaySupplierLedger(txns);
  const bill1 = allPurchases.find(p => p.billNumber === 'BILL-001');
  const bill2 = allPurchases.find(p => p.billNumber === 'BILL-002');

  assert.equal(bill1.paidAmount, 0);
  assert.equal(bill1.remaining, 40000);
  assert.equal(bill1.paymentStatus, 'UNPAID');

  assert.equal(bill2.paidAmount, 15000);
  assert.equal(bill2.remaining, 10000);
  assert.equal(bill2.paymentStatus, 'PARTIALLY_PAID');

  assert.equal(totalOutstanding, 50000);
});

test('Supplier Payment: Same-day purchase and payment order resolution', () => {
  const txns = [
    { id: 'tx-purchase', type: 'purchase', amount: 30000, billNumber: 'BILL-SAME-DAY', createdAt: '2026-11-06T08:30:00Z', sequence: 10 },
    { id: 'tx-payment', type: 'payment', amount: 10000, billNumber: 'BILL-SAME-DAY', createdAt: '2026-11-06T00:00:00Z', sequence: 11 },
  ];

  const { allPurchases } = replaySupplierLedger(txns);
  assert.equal(allPurchases[0].paidAmount, 10000);
  assert.equal(allPurchases[0].remaining, 20000);
  assert.equal(allPurchases[0].paymentStatus, 'PARTIALLY_PAID');
});

test('Supplier Payment: Advance payment made before purchase settles against future bill', () => {
  const txns = [
    { id: 'tx-adv', type: 'payment', amount: 10000, note: 'Advance payment', createdAt: '2026-11-01T00:00:00Z', sequence: 1 },
    { id: 'tx-pur', type: 'purchase', amount: 25000, billNumber: 'BILL-FUTURE', createdAt: '2026-11-05T00:00:00Z', sequence: 2 },
  ];

  const { allPurchases, totalOutstanding } = replaySupplierLedger(txns);
  assert.equal(allPurchases[0].paidAmount, 10000);
  assert.equal(allPurchases[0].remaining, 15000);
  assert.equal(allPurchases[0].paymentStatus, 'PARTIALLY_PAID');
  assert.equal(totalOutstanding, 15000);
});

// ─── 3. Purchase Edit After Payment Integrity ───────────────────────────────

test('Purchase Edit After Payment: Edit discount after partial payment preserves payments & updates remaining', () => {
  // Step 1: Create purchase ₹50,000 with ₹5,000 discount (net ₹45,000)
  const initialPurchase = computePurchaseTotals({
    items: [{ quantity: 50, cost: 1000, gst: 0 }],
    discount: 5000,
  });
  assert.equal(initialPurchase.totalCost, 45000);

  // Supplier balance = ₹45,000
  let supplierBalance = initialPurchase.totalCost;
  const ledgerTxns = [
    { id: 'pur-1', type: 'purchase', amount: 45000, billNumber: 'BILL-AUDIT-1', createdAt: '2026-11-01T10:00:00Z', sequence: 1 },
  ];

  // Step 2: Record ₹20,000 payment against this bill
  const payment1 = { id: 'pay-1', type: 'payment', amount: 20000, billNumber: 'BILL-AUDIT-1', createdAt: '2026-11-02T10:00:00Z', sequence: 2 };
  ledgerTxns.push(payment1);
  supplierBalance -= payment1.amount; // 45,000 - 20,000 = 25,000
  assert.equal(supplierBalance, 25000);

  let state = replaySupplierLedger(ledgerTxns);
  assert.equal(state.allPurchases[0].remaining, 25000);
  assert.equal(state.allPurchases[0].paymentStatus, 'PARTIALLY_PAID');

  // Step 3: User edits purchase discount from ₹5,000 to ₹7,000 (net bill drops from ₹45,000 to ₹43,000)
  const editedPurchase = computePurchaseTotals({
    items: [{ quantity: 50, cost: 1000, gst: 0 }],
    discount: 7000,
  });
  assert.equal(editedPurchase.totalCost, 43000);

  // Reversal + reapply in supplier balance:
  // Undo old bill (45,000), add new bill (43,000) -> net delta = -2,000
  supplierBalance = supplierBalance - initialPurchase.totalCost + editedPurchase.totalCost;
  assert.equal(supplierBalance, 23000); // 25,000 - 45,000 + 43,000 = 23,000

  // Replace old purchase txn with edited purchase txn (old payment remains untouched)
  const updatedLedgerTxns = [
    { id: 'pur-1-edited', type: 'purchase', amount: 43000, billNumber: 'BILL-AUDIT-1', createdAt: '2026-11-01T10:00:00Z', sequence: 1 },
    payment1, // payment is untouched!
  ];

  state = replaySupplierLedger(updatedLedgerTxns);
  assert.equal(state.allPurchases[0].originalAmount, 43000);
  assert.equal(state.allPurchases[0].paidAmount, 20000, 'Original payment must remain exactly ₹20,000');
  assert.equal(state.allPurchases[0].remaining, 23000, 'Remaining must be exactly ₹23,000');
  assert.equal(state.allPurchases[0].paymentStatus, 'PARTIALLY_PAID');
  assert.equal(state.totalOutstanding, 23000);
});

// ─── 4. Dashboard Purchases Metrics: Date vs CreatedAt ──────────────────────

function simulateDashboardPurchaseAggregation({ invoices, startDate, endDate, todayStart, todayEnd, monthStart }) {
  let todayAmount = 0;
  let todayCount = 0;
  let monthAmount = 0;
  let monthCount = 0;
  let periodAmount = 0;
  let periodCount = 0;

  for (const inv of invoices) {
    const cost = Number(inv.totalCost) || 0;
    const invDate = inv.date ? new Date(inv.date).getTime() : 0;
    const createdDate = inv.createdAt ? new Date(inv.createdAt).getTime() : 0;

    const inToday = (invDate >= todayStart.getTime() && invDate <= todayEnd.getTime()) ||
                    (createdDate >= todayStart.getTime() && createdDate <= todayEnd.getTime());
    if (inToday) {
      todayAmount += cost;
      todayCount += 1;
    }

    const inMonth = (invDate >= monthStart.getTime() && invDate <= todayEnd.getTime()) ||
                    (createdDate >= monthStart.getTime() && createdDate <= todayEnd.getTime());
    if (inMonth) {
      monthAmount += cost;
      monthCount += 1;
    }

    const inPeriod = (invDate >= startDate.getTime() && invDate <= endDate.getTime()) ||
                     (createdDate >= startDate.getTime() && createdDate <= endDate.getTime());
    if (inPeriod) {
      periodAmount += cost;
      periodCount += 1;
    }
  }

  return {
    todayAmount: round2(todayAmount),
    todayCount,
    monthAmount: round2(monthAmount),
    monthCount,
    periodAmount: round2(periodAmount),
    periodCount,
  };
}

test('Dashboard Matrix: All 4 date permutations correctly aggregated with zero double-counting', () => {
  const todayStart = new Date('2026-11-06T00:00:00.000Z');
  const todayEnd = new Date('2026-11-06T23:59:59.999Z');
  const monthStart = new Date('2026-11-01T00:00:00.000Z');

  const invoices = [
    // 1. Old invoice date (Sept 1), today's creation date (Nov 6)
    { id: 'inv-1', invoiceNumber: 'BILL-1', totalCost: 10000, date: '2026-09-01T00:00:00Z', createdAt: '2026-11-06T10:00:00Z' },
    // 2. Today's invoice date (Nov 6), today's creation date (Nov 6)
    { id: 'inv-2', invoiceNumber: 'BILL-2', totalCost: 20000, date: '2026-11-06T11:00:00Z', createdAt: '2026-11-06T11:00:00Z' },
    // 3. Both dates within selected month (Nov 3 and Nov 4)
    { id: 'inv-3', invoiceNumber: 'BILL-3', totalCost: 30000, date: '2026-11-03T00:00:00Z', createdAt: '2026-11-04T00:00:00Z' },
    // 4. Old invoice date and old creation date (both Sept 1)
    { id: 'inv-4', invoiceNumber: 'BILL-4', totalCost: 40000, date: '2026-09-01T00:00:00Z', createdAt: '2026-09-01T00:00:00Z' },
  ];

  // Daily Query (Today)
  const todayResult = simulateDashboardPurchaseAggregation({
    invoices,
    startDate: todayStart,
    endDate: todayEnd,
    todayStart,
    todayEnd,
    monthStart,
  });

  // Expected today: BILL-1 (created today) + BILL-2 (dated & created today) = 10,000 + 20,000 = 30,000.
  // BILL-2 is counted ONCE. BILL-3 and BILL-4 are NOT in today.
  assert.equal(todayResult.todayAmount, 30000);
  assert.equal(todayResult.todayCount, 2);

  // Monthly Query (November)
  // Expected month: BILL-1 (created in Nov) + BILL-2 (in Nov) + BILL-3 (in Nov) = 10,000 + 20,000 + 30,000 = 60,000.
  // BILL-4 (Sept/Sept) is completely excluded.
  assert.equal(todayResult.monthAmount, 60000);
  assert.equal(todayResult.monthCount, 3);
});

// ─── 5. Financial Precision & Rounding ──────────────────────────────────────

test('Financial Precision: IEEE-754 floating point drift does not pollute totals', () => {
  // Test scenario with 3 items of 33.33 each with 18% GST and fractional discounts
  const items = [
    { quantity: 3, cost: 33.3333, gst: 17.999 }, // subtotal ~ 100
    { quantity: 7, cost: 14.2857, gst: 18.001 }, // subtotal ~ 100
  ];
  const totals = computePurchaseTotals({ items, discount: 15.555, charges: 5.555 });
  
  // Verify that all returned values are clean 2-decimal numbers without trailing precision artifacts
  assert.equal(Number.isInteger(totals.totalCost * 100), true, 'totalCost must have at most 2 decimal places');
  assert.equal(Number.isInteger(totals.goodsTotal * 100), true, 'goodsTotal must have at most 2 decimal places');
  assert.equal(Number.isInteger(totals.totalGst * 100), true, 'totalGst must have at most 2 decimal places');
  assert.equal(totals.totalCost, round2(totals.goodsTotal + totals.totalGst + totals.chargesTotal - totals.discountAmt));
});
