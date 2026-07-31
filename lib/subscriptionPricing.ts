// Canonical subscription pricing math — shared by the checkout flow, PayU
// integration, renewal reminders, and every pricing display in the app.
// The landing page is a separate Next.js project and keeps its own copy at
// vyapar-landing-page/src/lib/subscriptionPricing.ts — keep both in sync.

export type BillingCycle = 'monthly' | 'yearly' | '5_years';

export const MONTHLY_BASE_PRICES: Record<string, number> = {
  shop: 299,
  vyapar: 499,
  wholesale: 999,
};

export const YEARLY_DISCOUNT_PERCENT = 10;
export const SUBSCRIPTION_GST_PERCENT = 18;

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pre-tax price for a plan+cycle. Yearly = 12 months at a 10% discount. */
export function getBaseAmount(plan: string, cycle: BillingCycle): number {
  const monthly = MONTHLY_BASE_PRICES[plan] ?? 0;
  if (cycle === 'yearly') {
    return round2(monthly * 12 * (1 - YEARLY_DISCOUNT_PERCENT / 100));
  }
  if (cycle === '5_years') {
    return round2(monthly * 60 * (1 - YEARLY_DISCOUNT_PERCENT / 100));
  }
  return monthly;
}

/** GST charged on top of a base (pre-tax) amount. */
export function getGstAmount(baseAmount: number): number {
  return round2((baseAmount * SUBSCRIPTION_GST_PERCENT) / 100);
}

/** The actual amount charged: base + GST. */
export function getTotalAmount(plan: string, cycle: BillingCycle): number {
  const base = getBaseAmount(plan, cycle);
  return round2(base + getGstAmount(base));
}

const PLAN_NAME: Record<string, string> = {
  shop: 'Dukaan',
  vyapar: 'Vyapar',
  wholesale: 'Udyog',
};

/** PayU `productinfo` string for a plan+cycle, e.g. "Dukaan Plan — ₹352.82/mo (incl. GST)". */
export function getPlanLabel(plan: string, cycle: BillingCycle): string {
  const name = PLAN_NAME[plan] ?? plan;
  const total = getTotalAmount(plan, cycle);
  const unit = cycle === 'yearly' ? '/yr' : cycle === '5_years' ? '/5yr' : '/mo';
  return `${name} Plan — ₹${total}${unit} (incl. GST)`;
}
