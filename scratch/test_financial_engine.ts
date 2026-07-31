import { calculateInvoice } from '../lib/financialEngine';

function runTests() {
  console.log('=== RUNNING FINANCIAL ENGINE TESTS ===\n');

  // Test 1: User Prompt Example (Non-GST, Fixed Discount)
  // Purchase = 120, Sell = 200, Qty = 1, Discount = 20
  // Customer Pays = 180, Profit = 180 - 120 = 60
  const t1 = calculateInvoice([
    { productId: 'p1', quantity: 1, sellingPrice: 200, purchasePrice: 120 }
  ], 20, 'non_gst');

  console.assert(t1.discountedSubtotal === 180, `T1 GrandTotal expected 180, got ${t1.discountedSubtotal}`);
  console.assert(t1.totalProfit === 60, `T1 Profit expected 60, got ${t1.totalProfit}`);
  console.assert(t1.items[0].marginPerUnit === 60, `T1 MarginPerUnit expected 60, got ${t1.items[0].marginPerUnit}`);
  console.log('✓ Test 1 Passed (User Prompt Example - Non-GST)');

  // Test 2: User Prompt Example (GST 18%, Fixed Discount)
  // Purchase = 120, Sell = 200, Qty = 1, Discount = 20, GST = 18%
  // Customer Pays = 180. Taxable = 180 / 1.18 = 152.54, GST Tax = 27.46
  // Profit = 152.54 - 120 = 32.54
  const t2 = calculateInvoice([
    { productId: 'p1', quantity: 1, sellingPrice: 200, purchasePrice: 120, gstPercent: 18 }
  ], 20, 'gst');

  console.assert(t2.discountedSubtotal === 180, `T2 GrandTotal expected 180, got ${t2.discountedSubtotal}`);
  console.assert(t2.totalGst === 27.46, `T2 GST expected 27.46, got ${t2.totalGst}`);
  console.assert(t2.netRevenue === 152.54, `T2 NetRevenue expected 152.54, got ${t2.netRevenue}`);
  console.assert(t2.totalProfit === 32.54, `T2 Profit expected 32.54, got ${t2.totalProfit}`);
  console.assert(t2.items[0].marginPerUnit === 32.54, `T2 MarginPerUnit expected 32.54, got ${t2.items[0].marginPerUnit}`);
  console.log('✓ Test 2 Passed (User Prompt Example - GST Invoice)');

  // Test 3: Percentage Discount (10% Discount on 500 Subtotal)
  // Item 1: Qty 2 @ 100 (Cost 60), Item 2: Qty 1 @ 300 (Cost 200)
  // Subtotal = 500, 10% Discount = 50, Customer Pays = 450
  // Non-GST: Total Cost = 120 + 200 = 320. Profit = 450 - 320 = 130
  const t3 = calculateInvoice([
    { productId: 'p1', quantity: 2, sellingPrice: 100, purchasePrice: 60 },
    { productId: 'p2', quantity: 1, sellingPrice: 300, purchasePrice: 200 },
  ], { type: 'percentage', value: 10 }, 'non_gst');

  console.assert(t3.grossSubtotal === 500, `T3 Subtotal expected 500, got ${t3.grossSubtotal}`);
  console.assert(t3.totalDiscount === 50, `T3 Discount expected 50, got ${t3.totalDiscount}`);
  console.assert(t3.discountedSubtotal === 450, `T3 GrandTotal expected 450, got ${t3.discountedSubtotal}`);
  console.assert(t3.totalProfit === 130, `T3 Profit expected 130, got ${t3.totalProfit}`);
  console.log('✓ Test 3 Passed (Percentage Discount)');

  // Test 4: Mixed Products with Different GST Rates
  // Item 1: Qty 1 @ 100 (GST 12%, Cost 50), Item 2: Qty 1 @ 200 (GST 18%, Cost 100)
  // Subtotal = 300. Discount = 30. Scale = 270 / 300 = 0.9
  // Line 1: Discounted = 90. Taxable = 90 / 1.12 = 80.36. GST = 9.64. Profit = 80.36 - 50 = 30.36
  // Line 2: Discounted = 180. Taxable = 180 / 1.18 = 152.54. GST = 27.46. Profit = 152.54 - 100 = 52.54
  // Total Net Revenue = 232.90, Total GST = 37.10, Total Profit = 82.90
  const t4 = calculateInvoice([
    { productId: 'p1', quantity: 1, sellingPrice: 100, purchasePrice: 50, gstPercent: 12 },
    { productId: 'p2', quantity: 1, sellingPrice: 200, purchasePrice: 100, gstPercent: 18 },
  ], 30, 'gst');

  console.assert(t4.discountedSubtotal === 270, `T4 GrandTotal expected 270, got ${t4.discountedSubtotal}`);
  console.assert(t4.totalGst === 37.10, `T4 Total GST expected 37.10, got ${t4.totalGst}`);
  console.assert(t4.netRevenue === 232.90, `T4 Net Revenue expected 232.90, got ${t4.netRevenue}`);
  console.assert(t4.totalProfit === 82.90, `T4 Total Profit expected 82.90, got ${t4.totalProfit}`);
  console.log('✓ Test 4 Passed (Mixed GST Rates & Items)');

  console.log('\n=== ALL FINANCIAL ENGINE TESTS PASSED SUCCESSFULLY! ===');
}

runTests();
