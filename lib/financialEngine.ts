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
  // false for service charges (Transport/Loading/Packing/Other, etc.) that
  // ride along as a line item but aren't goods being discounted — the whole-
  // bill discount is spread only across the other lines, never these.
  // Defaults to true (every existing caller's behaviour is unchanged).
  discountable?: boolean;
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
  let discountableGrossSubtotal = 0;
  const sanitizedItems = items.map(item => {
    const qty = Math.max(0, Number(item.quantity) || 0);
    const sp = Math.max(0, Number(item.sellingPrice) || 0);
    const cp = Math.max(0, Number(item.purchasePrice) || 0);
    const gstRate = Math.max(0, Number(item.gstPercent) || 0);
    const gross = round2(sp * qty);
    const discountable = item.discountable !== false;
    grossSubtotal += gross;
    if (discountable) discountableGrossSubtotal += gross;

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
      discountable,
    };
  });

  grossSubtotal = round2(grossSubtotal);
  discountableGrossSubtotal = round2(discountableGrossSubtotal);

  // 2. Calculate Total Discount — off the discountable lines only (service
  // charges like Transport/Loading never shrink from a bill-level discount;
  // see InputLineItem.discountable). Every existing caller sends no charge
  // lines at all, so discountableGrossSubtotal === grossSubtotal for them
  // and nothing here changes.
  let rawDiscount = 0;
  if (discType === 'percentage') {
    rawDiscount = (discountableGrossSubtotal * discValue) / 100;
  } else {
    rawDiscount = discValue;
  }
  const totalDiscount = round2(Math.min(discountableGrossSubtotal, Math.max(0, rawDiscount)));
  const discountedSubtotal = round2(Math.max(0, grossSubtotal - totalDiscount));

  // Scale ratio to distribute the discount proportionally across discountable line items only
  const scaleRatio = discountableGrossSubtotal > 0 ? (discountableGrossSubtotal - totalDiscount) / discountableGrossSubtotal : 0;
  const lastDiscountableIndex = sanitizedItems.reduce((lastIdx, it, idx) => it.discountable ? idx : lastIdx, -1);

  // 3. Line Item Financial Breakdown
  let accumulatedDiscount = 0;
  let totalGst = 0;
  let netRevenue = 0;
  let totalPurchaseCost = 0;
  let totalProfit = 0;

  const calculatedItems: CalculatedLineItem[] = sanitizedItems.map((item, index) => {
    // Proportional line discount — never touches a non-discountable line
    // (service charges keep their full entered amount).
    let lineDiscount = 0;
    if (!item.discountable) {
      lineDiscount = 0;
    } else if (index === lastDiscountableIndex) {
      // Last DISCOUNTABLE item gets the remainder, to prevent rounding drift
      // — may not be the last line overall when charge lines follow it.
      lineDiscount = round2(totalDiscount - accumulatedDiscount);
    } else {
      lineDiscount = round2(item.grossTotal * (1 - scaleRatio));
      accumulatedDiscount += lineDiscount;
    }

    const discountedTotal = round2(Math.max(0, item.grossTotal - lineDiscount));

    let taxableAmount = 0;
    let gstAmount = 0;
    let profitTaxableAmount = 0;

    if (billType === 'gst' && item.gstPercent > 0) {
      // GST bill — the sale price the shopkeeper typed is GST-inclusive by
      // convention, so we back out the taxable amount and the GST portion
      // for the printed invoice's rate-wise breakdown.
      taxableAmount = round2(discountedTotal / (1 + item.gstPercent / 100));
      gstAmount = round2(discountedTotal - taxableAmount);
      // Profit uses the FULL line total (not the extracted taxable amount)
      // to match the product form's "Retail Profit = selling − cost" figure.
      // Client mental model: "I sold at ₹1790, cost me ₹1400, made ₹390" —
      // GST is treated as a pass-through the shopkeeper handles separately,
      // not a deduction from the per-bill profit shown on the dashboard.
      // The old accountant-style calc (taxable − cost) confused shopkeepers
      // by making dashboard profit read ₹273 lower than the product form
      // promised. See client feedback:
      // "cost chya vr kahi amount yevo profit disayala hava".
      profitTaxableAmount = discountedTotal;
    } else {
      // Non-GST bill — even if the product has a gstPercent set (a lot of
      // shops set it for reporting), NOTHING is being extracted for tax on
      // this specific bill. So the whole line total is revenue AND the whole
      // margin (revenue - cost) is profit the shopkeeper keeps. The old
      // code divided profit-taxable by (1 + gst%) here anyway, which made a
      // 2500 line on an 18% product look like ~2119 for profit purposes —
      // and when the cost basis was close, profit went negative on paper
      // for a bill the shopkeeper knew had a real margin. Client feedback:
      // "cost chya vr kahi amount yevo profit disayala hava" — anything
      // above cost should show as profit, no GST-fudge on a non-GST bill.
      taxableAmount = discountedTotal;
      gstAmount = 0;
      profitTaxableAmount = discountedTotal;
    }

    const purchaseCostTotal = round2(item.purchasePrice * item.quantity);
    const netProfit = round2(profitTaxableAmount - purchaseCostTotal);
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
