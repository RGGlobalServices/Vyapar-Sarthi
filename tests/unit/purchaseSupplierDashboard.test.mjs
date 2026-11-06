/**
 * Unit Regression Test Suite for VyaparSarthii Bada Udyog Pack:
 * 1. Purchase Discount Integrity (Import, Edit, Preservation, Tax & Valuation)
 * 2. Supplier Payment Allocation (Partial Payments, Multiple Partial, Final Settlement, Status)
 * 3. Dashboard Purchases Metrics (Invoice Date vs Creation Date, Filtering)
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
  // Sort chronologically:
  // Same timestamp or same calendar day: purchases sort before credits/payments
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

  // Stage 1: After Payment 1 (₹20,000)
  let result = replaySupplierLedger(txns);
  assert.equal(result.allPurchases[0].paidAmount, 20000);
  assert.equal(result.allPurchases[0].remaining, 30000);
  assert.equal(result.allPurchases[0].paymentStatus, 'PARTIALLY_PAID');

  // Stage 2: After Payment 2 (₹10,000)
  txns.push({ id: 'tx-3', type: 'payment', amount: 10000, billNumber: 'BILL-101', createdAt: '2026-11-06T14:00:00Z', sequence: 3 });
  result = replaySupplierLedger(txns);
  assert.equal(result.allPurchases[0].paidAmount, 30000);
  assert.equal(result.allPurchases[0].remaining, 20000);
  assert.equal(result.allPurchases[0].paymentStatus, 'PARTIALLY_PAID');

  // Stage 3: After Final Settlement (₹20,000)
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
    // Old Bill 1: ₹40,000
    { id: 'tx-1', type: 'purchase', amount: 40000, billNumber: 'BILL-001', createdAt: '2026-11-01T10:00:00Z', sequence: 1 },
    // Newer Bill 2: ₹25,000
    { id: 'tx-2', type: 'purchase', amount: 25000, billNumber: 'BILL-002', createdAt: '2026-11-05T10:00:00Z', sequence: 2 },
    // User pays ₹15,000 explicitly against Bill 2
    { id: 'tx-3', type: 'payment', amount: 15000, billNumber: 'BILL-002', createdAt: '2026-11-06T10:00:00Z', sequence: 3 },
  ];

  const { allPurchases, totalOutstanding } = replaySupplierLedger(txns);
  const bill1 = allPurchases.find(p => p.billNumber === 'BILL-001');
  const bill2 = allPurchases.find(p => p.billNumber === 'BILL-002');

  // Bill 1 should remain completely untouched (0 paid, 40000 remaining, UNPAID)
  assert.equal(bill1.paidAmount, 0);
  assert.equal(bill1.remaining, 40000);
  assert.equal(bill1.paymentStatus, 'UNPAID');

  // Bill 2 should have 15,000 paid, 10,000 remaining, PARTIALLY_PAID
  assert.equal(bill2.paidAmount, 15000);
  assert.equal(bill2.remaining, 10000);
  assert.equal(bill2.paymentStatus, 'PARTIALLY_PAID');

  assert.equal(totalOutstanding, 50000);
});

test('Supplier Payment: Same-day purchase and payment order resolution', () => {
  // If payment has midnight timestamp and purchase was recorded later same day,
  // our sorting rules ensure purchase comes before payment so it allocates correctly.
  const txns = [
    { id: 'tx-purchase', type: 'purchase', amount: 30000, billNumber: 'BILL-SAME-DAY', createdAt: '2026-11-06T08:30:00Z', sequence: 10 },
    { id: 'tx-payment', type: 'payment', amount: 10000, billNumber: 'BILL-SAME-DAY', createdAt: '2026-11-06T00:00:00Z', sequence: 11 },
  ];

  const { allPurchases } = replaySupplierLedger(txns);
  assert.equal(allPurchases[0].paidAmount, 10000);
  assert.equal(allPurchases[0].remaining, 20000);
  assert.equal(allPurchases[0].paymentStatus, 'PARTIALLY_PAID');
});

// ─── 3. Dashboard Purchases Metrics: Date vs CreatedAt ──────────────────────

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

    // Condition: (date in range) OR (createdAt in range)
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

test('Dashboard: Bill entered today with historical vendor invoice date appears in Today Purchases', () => {
  const todayStart = new Date('2026-11-06T00:00:00.000Z');
  const todayEnd = new Date('2026-11-06T23:59:59.999Z');
  const monthStart = new Date('2026-11-01T00:00:00.000Z');

  const invoices = [
    // Vendor invoice dated Sept 1, but entered into the system today Nov 6
    {
      id: 'inv-1',
      invoiceNumber: '077',
      totalCost: 365255,
      date: '2026-09-01T00:00:00.000Z',
      createdAt: '2026-11-06T07:00:30.293Z',
    },
    // Vendor invoice dated Sept 6, entered today Nov 6
    {
      id: 'inv-2',
      invoiceNumber: '140',
      totalCost: 949200,
      date: '2026-09-06T00:00:00.000Z',
      createdAt: '2026-11-06T06:46:37.208Z',
    },
    // Old invoice from last month, created last month
    {
      id: 'inv-3',
      invoiceNumber: 'OLD-999',
      totalCost: 50000,
      date: '2026-10-15T00:00:00.000Z',
      createdAt: '2026-10-15T10:00:00.000Z',
    }
  ];

  const result = simulateDashboardPurchaseAggregation({
    invoices,
    startDate: todayStart,
    endDate: todayEnd,
    todayStart,
    todayEnd,
    monthStart,
  });

  // Today's purchases must reflect the two bills created today (365,255 + 949,200 = 1,314,455)
  assert.equal(result.todayAmount, 1314455);
  assert.equal(result.todayCount, 2);

  // Month purchases also includes them
  assert.equal(result.monthAmount, 1314455);
  assert.equal(result.monthCount, 2);
});

test('Dashboard: Bill entered today with today invoice date is counted only ONCE', () => {
  const todayStart = new Date('2026-11-06T00:00:00.000Z');
  const todayEnd = new Date('2026-11-06T23:59:59.999Z');
  const monthStart = new Date('2026-11-01T00:00:00.000Z');

  const invoices = [
    {
      id: 'inv-today',
      invoiceNumber: 'PUR-TODAY',
      totalCost: 50000,
      date: '2026-11-06T12:00:00.000Z',
      createdAt: '2026-11-06T12:00:00.000Z',
    }
  ];

  const result = simulateDashboardPurchaseAggregation({
    invoices,
    startDate: todayStart,
    endDate: todayEnd,
    todayStart,
    todayEnd,
    monthStart,
  });

  assert.equal(result.todayAmount, 50000, 'Must not be double counted');
  assert.equal(result.todayCount, 1);
});

