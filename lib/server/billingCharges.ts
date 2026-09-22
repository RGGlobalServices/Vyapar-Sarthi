import { ApiError } from '@/lib/server/http';
import { isMillBillingPackage } from '@/lib/config/packageConfig';
import {
  MillBillingError,
  MILL_GST_SLABS,
  normalizeMillCharges,
  normalizeMillDiscount,
  type MillCharges,
  type MillDiscountInput,
} from '@/lib/millBilling';

// Server-only side of Mill Billing (`mill_v2`): the platform/package gates, and the thin wrappers that turn the pure
// engine's validation errors into HTTP 400s. Nothing here trusts a client-supplied package, total, GST amount or
// round-off. Mill Billing is part of the Bada Udyog package itself: there is no per-shop activation or confirmation.

/** Internal platform/deployment kill-switch. Off by default; nobody can bill as mill_v2 unless it is 'true'. Not customer-facing. */
export function isMillV2Enabled(): boolean {
  const v = (process.env.MILL_V2_ENABLED || '').trim().toLowerCase();
  return v === 'true' || v === '1';
}

/**
 * Eligibility, decided ONLY on the server from the shop row: the platform flag must be on and the shop's package must be
 * Bada Udyog (never a client-supplied package).
 */
export function assertMillEligibleShop(shop: { packageType?: string | null }) {
  if (!isMillV2Enabled()) {
    throw new ApiError(403, 'Mill billing is not enabled on this server.', 'MILL_NOT_ENABLED');
  }
  if (!isMillBillingPackage(shop.packageType)) {
    throw new ApiError(403, 'Mill billing is only available on the Bada Udyog package.', 'MILL_PACKAGE_NOT_ELIGIBLE');
  }
}

/** Engine validation errors → HTTP 400 with the engine's stable error code. */
export function millValidation<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof MillBillingError) throw new ApiError(400, e.message, e.code);
    throw e;
  }
}

export function parseMillCharges(raw: unknown): MillCharges {
  return millValidation(() => normalizeMillCharges(raw));
}

export function parseMillDiscount(raw: unknown): MillDiscountInput | null {
  return millValidation(() => normalizeMillDiscount(raw));
}

/** Strict boolean: absent → false; anything that is not a real boolean is rejected (no truthy coercion). */
export function parseGstInterState(body: any): boolean {
  const raw = body?.gst_inter_state !== undefined ? body.gst_inter_state : body?.gstInterState;
  if (raw === undefined || raw === null) return false;
  if (typeof raw !== 'boolean') {
    throw new ApiError(400, 'gstInterState must be true or false', 'INVALID_INTER_STATE');
  }
  return raw;
}

export function parseMillBillType(raw: unknown): 'gst' | 'non_gst' {
  if (raw === undefined || raw === null || raw === '' || raw === 'non_gst') return 'non_gst';
  if (raw === 'gst') return 'gst';
  throw new ApiError(400, 'bill_type must be "gst" or "non_gst"', 'INVALID_BILL_TYPE');
}

/**
 * The GST rate applied to one line of a GST bill.
 *   • product-backed line: the product's own server-side rate. A client-sent rate is accepted only if it
 *     equals that rate, or is one of the supported slabs (0/5/12/18/28) — an explicit per-line override.
 *   • productless line (manual/challan): the client's rate, restricted to the slabs (default 0).
 * A non-GST bill applies no GST at all, so the rate is 0 and nothing is validated.
 */
export function resolveMillLineGstRate(
  clientRateRaw: unknown,
  productRate: number | null | undefined,
  hasProduct: boolean,
  billType: 'gst' | 'non_gst',
  label: string,
): number {
  if (billType !== 'gst') return 0;
  const productR = hasProduct ? Number(productRate) || 0 : null;
  const hasClient = clientRateRaw !== undefined && clientRateRaw !== null && clientRateRaw !== '';
  if (!hasClient) return productR ?? 0;
  const clientRate = millValidation(() => {
    const n = Number(clientRateRaw);
    if (typeof clientRateRaw === 'boolean' || !Number.isFinite(n)) throw new MillBillingError(`${label}: invalid GST rate`, 'INVALID_GST_RATE');
    return n;
  });
  if (productR !== null && clientRate === productR) return productR;
  if ((MILL_GST_SLABS as readonly number[]).includes(clientRate)) return clientRate;
  throw new ApiError(400, `${label}: GST rate ${clientRate}% is not supported. Allowed: ${MILL_GST_SLABS.join('/')}%`, 'INVALID_GST_RATE');
}
