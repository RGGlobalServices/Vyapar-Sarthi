/**
 * Simple merchandising profit preview shown on the product catalog (Add/Edit
 * product modals, product list, product detail page) — NOT the accounting-
 * grade, tax-liability-aware profit used at billing time
 * (see lib/financialEngine.ts), which always nets GST out of the collected
 * price because that portion is government tax, not business revenue.
 *
 * Default: profit = sellingPrice - costPrice (GST left untouched). A
 * shopkeeper pricing a product wants to see markup over what they paid, not
 * a tax-adjusted number — stripping GST by default made a normal ₹11 markup
 * look like a loss. Only when the shop turns on "GST Inclusive Profit
 * Calculation" in Settings does this strip GST out of the selling price
 * first, matching the old always-strip behavior.
 */

export type ProfitStatus = 'profit' | 'loss' | 'zero';

export interface ProfitResult {
  amount: number;   // ₹ profit amount
  percent: number;  // profit % — markup on cost
  status: ProfitStatus;
}

export function calculateProductProfit(
  sellingPrice: number,
  costPrice: number,
  gstPercent: number = 0,
  gstInclusive: boolean = false
): ProfitResult {
  const sp = Number(sellingPrice) || 0;
  const cp = Number(costPrice) || 0;
  const baseSp = gstInclusive ? sp / (1 + (Number(gstPercent) || 0) / 100) : sp;
  const amount = baseSp - cp;
  const percent = cp > 0 ? (amount / cp) * 100 : 0;
  const status: ProfitStatus = amount > 0 ? 'profit' : amount < 0 ? 'loss' : 'zero';
  return { amount, percent, status };
}

// Tailwind color classes for the 3-way profit / loss / zero indicator.
export function profitColorClass(status: ProfitStatus): string {
  if (status === 'profit') return 'text-emerald-500 dark:text-emerald-400';
  if (status === 'loss') return 'text-red-500 dark:text-red-400';
  return 'text-orange-500 dark:text-orange-400';
}

// Convert between GST-inclusive and GST-exclusive prices — used by the
// Add/Edit Product "Including GST / Excluding GST" price-entry toggle.
// Every price saved to the server is normalized to GST-inclusive (the
// convention product.sellingPrice uses everywhere else in the app).
export function toInclusivePrice(price: number, gstPercent: number): number {
  return price * (1 + (Number(gstPercent) || 0) / 100);
}

export function toExclusivePrice(price: number, gstPercent: number): number {
  return price / (1 + (Number(gstPercent) || 0) / 100);
}
