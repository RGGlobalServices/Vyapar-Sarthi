/**
 * Centralized Financial Engine for Kirana ERP
 * Handles all billing, discount, GST tax liability, and profit calculations.
 */

export interface InputLineItem {
  productId?: string | null;
  unit?: string | null;
  variant?: string | null;
  quantity: number;
  sellingPrice: number;   // Selling price per unit (GST-inclusive if GST bill)
  purchasePrice: number;  // Cost price per unit
  gstPercent?: number;    // GST rate % (e.g. 18)
  hsnCode?: string | null;
}

export type DiscountType = 'fixed' | 'percentage';

export interface DiscountInput {
  type?: DiscountType;
  value: number; // Currency amount OR percentage value
}

export type BillType = 'gst' | 'non_gst';

export interface CalculatedLineItem {
  productId?: string | null;
  unit?: string | null;
  variant?: string | null;
  quantity: number;
  sellingPrice: number;
  purchasePrice: number;
  gstPercent: number;
  hsnCode?: string | null;

  grossTotal: number;         // sellingPrice * quantity
  discountAmount: number;     // line share of total discount
  discountedTotal: number;    // grossTotal - discountAmount (amount paid for line)

  taxableAmount: number;      // Net Revenue for this line (excl. GST tax)
  gstAmount: number;          // GST tax liability (0 for non-GST)
  purchaseCostTotal: number;  // purchasePrice * quantity

  netProfit: number;          // taxableAmount - purchaseCostTotal
  marginPerUnit: number;      // netProfit / quantity
}

export interface InvoiceCalculationResult {
  billType: BillType;
  grossSubtotal: number;      // Sum of sellingPrice * quantity
  discountType: DiscountType;
  discountValue: number;
  totalDiscount: number;      // Discount applied to invoice
  discountedSubtotal: number; // Gross subtotal - total discount (Grand Total / Customer Paid)

  totalGst: number;           // Total GST tax liability (0 for non-GST)
  netRevenue: number;         // Grand Total - Total GST (Actual sales revenue)
  totalPurchaseCost: number;  // Sum of item purchase costs
  totalProfit: number;        // Net Revenue - Total Purchase Cost

  items: CalculatedLineItem[];
}

const round2 = (num: number): number => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

/**
 * Perform complete, authoritative financial calculation for an invoice.
 */
export function calculateInvoice(
  items: InputLineItem[],
  discountInput: DiscountInput | number = 0,
  billType: BillType = 'non_gst'
): InvoiceCalculationResult {
  const discountObj: DiscountInput = typeof discountInput === 'number'
    ? { type: 'fixed', value: discountInput }
    : discountInput;

  const discType: DiscountType = discountObj.type || 'fixed';
  const discValue = Math.max(0, Number(discountObj.value) || 0);

  // 1. Item Totals & Gross Subtotal
  let grossSubtotal = 0;
  const sanitizedItems = items.map(item => {
    const qty = Math.max(0, Number(item.quantity) || 0);
    const sp = Math.max(0, Number(item.sellingPrice) || 0);
    const cp = Math.max(0, Number(item.purchasePrice) || 0);
    const gstRate = Math.max(0, Number(item.gstPercent) || 0);
    const gross = round2(sp * qty);
    grossSubtotal += gross;

    return {
      productId: item.productId || null,
      unit: item.unit || null,
      variant: item.variant || null,
      quantity: qty,
      sellingPrice: sp,
      purchasePrice: cp,
      gstPercent: gstRate,
      hsnCode: item.hsnCode || null,
      grossTotal: gross,
    };
  });

  grossSubtotal = round2(grossSubtotal);

  // 2. Calculate Total Discount
  let rawDiscount = 0;
  if (discType === 'percentage') {
    rawDiscount = (grossSubtotal * discValue) / 100;
  } else {
    rawDiscount = discValue;
  }
  const totalDiscount = round2(Math.min(grossSubtotal, Math.max(0, rawDiscount)));
  const discountedSubtotal = round2(Math.max(0, grossSubtotal - totalDiscount));

  // Scale ratio to distribute bill-level discount proportionally to line items
  const scaleRatio = grossSubtotal > 0 ? (grossSubtotal - totalDiscount) / grossSubtotal : 0;

  // 3. Line Item Financial Breakdown
  let accumulatedDiscount = 0;
  let totalGst = 0;
  let netRevenue = 0;
  let totalPurchaseCost = 0;
  let totalProfit = 0;

  const calculatedItems: CalculatedLineItem[] = sanitizedItems.map((item, index) => {
    // Proportional line discount
    let lineDiscount = 0;
    if (index === sanitizedItems.length - 1) {
      // Last item gets remaining discount to prevent rounding drift
      lineDiscount = round2(totalDiscount - accumulatedDiscount);
    } else {
      lineDiscount = round2(item.grossTotal * (1 - scaleRatio));
      accumulatedDiscount += lineDiscount;
    }

    const discountedTotal = round2(Math.max(0, item.grossTotal - lineDiscount));

    let taxableAmount = 0;
    let gstAmount = 0;

    if (billType === 'gst' && item.gstPercent > 0) {
      taxableAmount = round2(discountedTotal / (1 + item.gstPercent / 100));
      gstAmount = round2(discountedTotal - taxableAmount);
    } else {
      taxableAmount = discountedTotal;
      gstAmount = 0;
    }

    const purchaseCostTotal = round2(item.purchasePrice * item.quantity);
    const netProfit = round2(taxableAmount - purchaseCostTotal);
    const marginPerUnit = item.quantity > 0 ? round2(netProfit / item.quantity) : 0;

    totalGst += gstAmount;
    netRevenue += taxableAmount;
    totalPurchaseCost += purchaseCostTotal;
    totalProfit += netProfit;

    return {
      productId: item.productId,
      unit: item.unit,
      variant: item.variant,
      quantity: item.quantity,
      sellingPrice: item.sellingPrice,
      purchasePrice: item.purchasePrice,
      gstPercent: item.gstPercent,
      hsnCode: item.hsnCode,
      grossTotal: item.grossTotal,
      discountAmount: lineDiscount,
      discountedTotal,
      taxableAmount,
      gstAmount,
      purchaseCostTotal,
      netProfit,
      marginPerUnit,
    };
  });

  totalGst = round2(totalGst);
  netRevenue = round2(netRevenue);
  totalPurchaseCost = round2(totalPurchaseCost);
  totalProfit = round2(totalProfit);

  return {
    billType,
    grossSubtotal,
    discountType: discType,
    discountValue: discValue,
    totalDiscount,
    discountedSubtotal,
    totalGst,
    netRevenue,
    totalPurchaseCost,
    totalProfit,
    items: calculatedItems,
  };
}
