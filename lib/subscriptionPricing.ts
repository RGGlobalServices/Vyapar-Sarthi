// Canonical subscription pricing math — shared by the checkout flow, PayU
// integration, renewal reminders, and every pricing display in the app.
// The landing page is a separate Next.js project and keeps its own copy at
// vyapar-landing-page/src/lib/subscriptionPricing.ts — keep both in sync.

export type BillingCycle = 'monthly' | 'yearly' | '5_years';

export const MONTHLY_BASE_PRICES: Record<string, number> = {
  shop: 299,
  vyapar: 499,
  wholesale: 999,
  badaudyog: 1999,
};

export const YEARLY_DISCOUNT_PERCENT = 10;
// No GSTIN registered yet — GST can't legally be charged until one exists.
// Keep the rate (and getGstAmount/getTotalAmount below) in place so turning
// it back on later is a one-line change, not a rewrite of every call site.
export const SUBSCRIPTION_GST_PERCENT = 0;

// Per-plan 5-year discount — Bada Udyog gets a deeper 20% off to reward
// the long-commitment ask on a higher-ticket plan; all other plans stay at
// the standard YEARLY_DISCOUNT_PERCENT.
const FIVE_YEAR_DISCOUNT_BY_PLAN: Record<string, number> = {
  badaudyog: 20,
};
export function getFiveYearDiscount(plan: string): number {
  return FIVE_YEAR_DISCOUNT_BY_PLAN[plan] ?? YEARLY_DISCOUNT_PERCENT;
}

/** The actual yearly discount %, derived from the real base prices (not a duplicated constant) — stays correct for a plan whose yearly price is a fixed override instead of the standard rate. */
export function getYearlyDiscount(plan: string): number {
  const monthly = MONTHLY_BASE_PRICES[plan] ?? 0;
  if (!monthly) return YEARLY_DISCOUNT_PERCENT;
  const yearlyBase = getBaseAmount(plan, 'yearly');
  return Math.round((1 - yearlyBase / (monthly * 12)) * 1000) / 10;
}

// Per-plan fixed yearly price — overrides the standard 12-months-at-10%-off
// formula below. Bada Udyog's yearly price is a flat marketing figure
// (₹14,999, ~37.5% off the ₹1,999×12 sticker price) rather than the
// standard discount rate, so it's pinned here instead of computed.
const YEARLY_PRICE_OVERRIDE: Record<string, number> = {
  badaudyog: 14999,
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pre-tax price for a plan+cycle. Yearly = 11 months at 10% off (or a per-plan fixed price); 5-year uses per-plan rate. */
export function getBaseAmount(plan: string, cycle: BillingCycle): number {
  const monthly = MONTHLY_BASE_PRICES[plan] ?? 0;
  if (cycle === 'yearly') {
    if (YEARLY_PRICE_OVERRIDE[plan] !== undefined) return YEARLY_PRICE_OVERRIDE[plan];
    return round2(monthly * 12 * (1 - YEARLY_DISCOUNT_PERCENT / 100));
  }
  if (cycle === '5_years') {
    return round2(monthly * 60 * (1 - getFiveYearDiscount(plan) / 100));
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
  badaudyog: 'Bada Udyog',
};

/** PayU `productinfo` string for a plan+cycle, e.g. "Dukaan Plan — ₹352.82/mo". */
export function getPlanLabel(plan: string, cycle: BillingCycle): string {
  const name = PLAN_NAME[plan] ?? plan;
  const total = getTotalAmount(plan, cycle);
  const unit = cycle === 'yearly' ? '/yr' : cycle === '5_years' ? '/5yr' : '/mo';
  return `${name} Plan — ₹${total}${unit}`;
}
