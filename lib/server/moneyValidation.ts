import { ApiError } from '@/lib/server/http';

// Server-side money validation shared by every sale-creation path
// (POST /billing and the invoice-edit re-create). The frontend already checks
// most of this, but none of it may be trusted: anything the client sends that
// decides a rupee amount is validated here, before any write.

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Money is compared in whole paise (integers), never with an epsilon: every
// rupee amount in this app is a 2-decimal value (round2), so Math.round(x*100)
// is the exact representation and float noise like 0.1+0.2 cannot flip a check.
export const toPaise = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100);

/**
 * Accepts a JS number or a plain decimal string ("1000", "99.5") and returns a
 * finite number. Everything else — NaN, +/-Infinity, "", "abc", "1e3", null,
 * booleans, objects — is rejected with a 400.
 */
export function parseMoney(raw: unknown, label: string): number {
  let n: number;
  if (typeof raw === 'number') {
    n = raw;
  } else if (typeof raw === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(raw)) {
    n = Number(raw);
  } else if (typeof raw === 'string' && /^\s*-\d+(\.\d+)?\s*$/.test(raw)) {
    n = Number(raw); // valid number, rejected by the range checks below with a clearer message
  } else {
    throw new ApiError(400, `${label} must be a valid number`);
  }
  if (!Number.isFinite(n)) throw new ApiError(400, `${label} must be a finite number`);
  return n;
}

/**
 * amount_paid must be numeric, finite, >= 0 and <= the invoice total (computed
 * by the server, never taken from the client). An ABSENT value keeps the
 * existing default: fully paid, or 0 for an 'Udhar' bill.
 */
export function resolveAmountPaid(raw: unknown, invoiceTotal: number, paymentType: string): number {
  if (raw === undefined) return round2(paymentType === 'Udhar' ? 0 : invoiceTotal);
  const v = parseMoney(raw, 'amount_paid');
  if (v < 0) throw new ApiError(400, 'amount_paid cannot be negative');
  if (toPaise(v) > toPaise(invoiceTotal)) {
    throw new ApiError(400, `amount_paid (${round2(v)}) cannot exceed the invoice total (${round2(invoiceTotal)})`);
  }
    return round2(Math.min(v, invoiceTotal));
}

// The money components the billing UIs actually send in payment_details
// (cash/upi/card/bank from useBillingEngine's split; 'other' for completeness).
// `udhar` is the unpaid remainder the UI echoes back — validated as a number
// but never counted as money received. Any other key (method, upiApp,
// upiTxnId, bankName, chequeNo, dueDate, creditDays, ...) is descriptive text
// and passes through untouched.
const PAID_COMPONENTS = ['cash', 'upi', 'card', 'bank', 'other'] as const;

export interface ValidatedPayment {
  details: any;
  /** Cash that physically entered the drawer, from validated data only. */
  cash: number;
}

/**
 * Split: every component numeric, finite, >= 0, and cash+upi+card+bank+other
 * must equal amount_paid. Non-split types: components (if present) must be
 * valid and can never add up to more than amount_paid. The cash-book amount is
 * derived from the validated result — never from a raw client number.
 */
export function validatePaymentDetails(rawDetails: unknown, paymentType: string, amountPaid: number): ValidatedPayment {
  if (rawDetails !== undefined && rawDetails !== null && (typeof rawDetails !== 'object' || Array.isArray(rawDetails))) {
    throw new ApiError(400, 'payment_details must be an object');
  }
  const details: Record<string, unknown> = { ...((rawDetails as Record<string, unknown>) || {}) };

  let sum = 0;
  const parts: Record<string, number> = {};
  for (const key of PAID_COMPONENTS) {
    const raw = details[key];
    if (raw === undefined || raw === null) continue;
    const v = parseMoney(raw, `payment_details.${key}`);
    if (v < 0) throw new ApiError(400, `payment_details.${key} cannot be negative`);
    const rounded = round2(v);
    parts[key] = rounded;
    details[key] = rounded;
    sum += rounded;
  }
  if (details.udhar !== undefined && details.udhar !== null) {
    const u = parseMoney(details.udhar, 'payment_details.udhar');
    if (u < 0) throw new ApiError(400, 'payment_details.udhar cannot be negative');
    details.udhar = round2(u);
  }
  sum = round2(sum);

  if (paymentType === 'Split') {
    for (const [key, v] of Object.entries(parts)) {
      if (toPaise(v) > toPaise(amountPaid)) throw new ApiError(400, `payment_details.${key} cannot exceed amount_paid`);
    }
    if (toPaise(sum) !== toPaise(amountPaid)) {
      throw new ApiError(400, `Split payment components (${sum}) must add up to amount_paid (${amountPaid})`);
    }
  } else if (toPaise(sum) > toPaise(amountPaid)) {
    throw new ApiError(400, `Payment components (${sum}) cannot exceed amount_paid (${amountPaid})`);
  }

  const cash = paymentType === 'Split' ? (parts.cash || 0) : paymentType === 'Cash' ? amountPaid : 0;
  return { details, cash };
}

// ── Cost basis (profit) ─────────────────────────────────────────────────────

const variantKeyOfRow = (v: any) => (v?.color ? `${v.color} / ${v.size || ''}` : (v?.size || ''));

/**
 * The cost the SERVER knows for a product line: the matching variant's
 * costPrice/wholesalePrice, else Product.costPrice, else the legacy
 * Product.wholesaleCost (Vyapar/Dukan). Same precedence billing already used
 * as its fallback; returns 0 when the product has no cost on file.
 */
export function serverCostFor(dbProduct: any, variantKey: string | null | undefined): number {
  if (!dbProduct) return 0;
  let cp = 0;
  if (variantKey && Array.isArray(dbProduct.variants)) {
    for (const v of dbProduct.variants as any[]) {
      if (variantKeyOfRow(v) === variantKey) { cp = Number(v.costPrice) || Number(v.wholesalePrice) || 0; break; }
    }
  }
  if (!cp) cp = Number(dbProduct.costPrice) || Number(dbProduct.wholesaleCost) || 0;
  return cp > 0 && Number.isFinite(cp) ? cp : 0;
}

/**
 * Cost used for a sale line. The client's purchase_price / cost is IGNORED for
 * any line backed by a product — profit must follow data the server holds, or a
 * tampered request could set any profit. The one exception is a free-form line
 * with no product at all (no server-side cost exists): the client value is
 * accepted only if finite and between 0 and that line's selling price, so it
 * can neither create a loss nor a profit above the price.
 */
export function resolveLineCost(item: any, dbProduct: any, sellingPrice: number): number {
  if (dbProduct) return serverCostFor(dbProduct, item?.variant || null);
  const raw = Number(item?.purchase_price ?? item?.purchasePrice ?? item?.cost);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(raw, Math.max(0, sellingPrice));
}

/** Server-side selling price for an item the client does not get to price (exchange). */
export function serverSellingPriceFor(dbProduct: any, variantKey: string | null | undefined): number {
  if (!dbProduct) return 0;
  if (variantKey && Array.isArray(dbProduct.variants)) {
    for (const v of dbProduct.variants as any[]) {
      if (variantKeyOfRow(v) === variantKey) {
        const vp = Number(v.sellingPrice);
        if (Number.isFinite(vp) && vp > 0) return vp;
        break;
      }
    }
  }
  const p = Number(dbProduct.sellingPrice);
  return Number.isFinite(p) && p > 0 ? p : 0;
}
