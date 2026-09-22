/**
 * Mill Billing (Bada Udyog) financial engine — `mill_v2`.
 *
 * PURE and dependency-free on purpose: the server (POST /billing, `pricingModel = 'mill_v2'`)
 * is the financial authority, and the client preview (later phase) imports this SAME module so
 * the two can never drift. It is completely separate from lib/financialEngine.ts /
 * lib/gst.ts, which keep their GST-INCLUSIVE semantics for every legacy bill.
 *
 * Rules (approved decision record):
 *   • GST is EXCLUSIVE / add-on: a line's rate is the price BEFORE GST.
 *   • Order: goods → subtotal → goods discount → taxable → GST (CGST+SGST or IGST)
 *            → freight → hamali → loading → unloading → other → round-off → grand total.
 *   • Discount applies to GOODS only. Charges get no discount and no GST.
 *   • Round-off: nearest ₹1, half-up, always on. Stored signed.
 *   • Profit = taxable goods − stored (ex-GST) cost. GST, charges and round-off are never profit.
 *   • All money maths is in whole PAISE (integers) — no epsilon tolerances anywhere.
 */

export const MILL_PRICING_MODEL = 'mill_v2' as const;
export const MILL_GST_SLABS = [0, 5, 12, 18, 28] as const;
export const MILL_CHARGE_KEYS = ['freight', 'hamali', 'loading', 'unloading', 'other'] as const;
export type MillChargeKey = (typeof MILL_CHARGE_KEYS)[number];

/** ₹10,00,000 per charge and ₹25,00,000 combined (approved caps), in paise. */
export const MILL_MAX_CHARGE_PAISE = 100_000_000;
export const MILL_MAX_CHARGES_TOTAL_PAISE = 250_000_000;

export class MillBillingError extends Error {
  code: string;
  constructor(message: string, code = 'MILL_INVALID') {
    super(message);
    this.name = 'MillBillingError';
    this.code = code;
  }
}

// ── parsing helpers (strict) ────────────────────────────────────────────────

/** Number or plain decimal string → finite number. Everything else (NaN, ±Infinity, '', 'abc', '1e3', null, booleans, objects) is rejected. */
export function parseStrictNumber(raw: unknown, label: string): number {
  let n: number;
  if (typeof raw === 'number') n = raw;
  else if (typeof raw === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(raw)) n = Number(raw);
  else throw new MillBillingError(`${label} must be a valid number`, 'INVALID_AMOUNT');
  if (!Number.isFinite(n)) throw new MillBillingError(`${label} must be a finite number`, 'INVALID_AMOUNT');
  return n;
}

/** Rupees → integer paise, requiring at most 2 decimal places (no silent rounding of user input). */
export function rupeesToPaiseExact(rupees: number, label: string): number {
  const p = rupees * 100;
  const rounded = Math.round(p);
  if (Math.abs(p - rounded) > 1e-6) {
    throw new MillBillingError(`${label} can have at most 2 decimal places`, 'INVALID_AMOUNT');
  }
  return rounded;
}

/** Computed values (price × qty etc.) → paise with a plain half-up round. */
const toPaise = (n: number): number => Math.round((n + Number.EPSILON) * 100);
const fromPaise = (p: number): number => p / 100;

// ── charges ─────────────────────────────────────────────────────────────────

export type MillCharges = Record<MillChargeKey, number>;

/**
 * Validates and canonicalises the client's `charges` object → all five keys, in rupees.
 *   • only whitelisted keys; legacy `transport` is accepted as an INPUT alias of `freight`
 *     (sending both is ambiguous → rejected); anything else → error
 *   • each value: finite, ≥ 0, ≤ 2 decimals, ≤ ₹10,00,000; all together ≤ ₹25,00,000
 */
export function normalizeMillCharges(raw: unknown): MillCharges {
  const out: MillCharges = { freight: 0, hamali: 0, loading: 0, unloading: 0, other: 0 };
  if (raw === undefined || raw === null) return out;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new MillBillingError('charges must be an object', 'INVALID_CHARGES');
  }
  const obj = raw as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.includes('transport') && keys.includes('freight')) {
    throw new MillBillingError('Send either "freight" or the legacy "transport", not both', 'INVALID_CHARGE_KEY');
  }
  let totalPaise = 0;
  for (const key of keys) {
    const canonical = key === 'transport' ? 'freight' : key;
    if (!(MILL_CHARGE_KEYS as readonly string[]).includes(canonical)) {
      throw new MillBillingError(`Unknown charge "${key}". Allowed: ${MILL_CHARGE_KEYS.join(', ')}`, 'INVALID_CHARGE_KEY');
    }
    const value = obj[key];
    if (value === undefined || value === null || value === '') continue; // blank = 0
    const n = parseStrictNumber(value, `Charge "${canonical}"`);
    if (n < 0) throw new MillBillingError(`Charge "${canonical}" cannot be negative`, 'INVALID_CHARGE');
    const paise = rupeesToPaiseExact(n, `Charge "${canonical}"`);
    if (paise > MILL_MAX_CHARGE_PAISE) {
      throw new MillBillingError(`Charge "${canonical}" exceeds the ₹10,00,000 limit`, 'CHARGE_TOO_LARGE');
    }
    out[canonical as MillChargeKey] = fromPaise(paise);
    totalPaise += paise;
  }
  if (totalPaise > MILL_MAX_CHARGES_TOTAL_PAISE) {
    throw new MillBillingError('Total charges exceed the ₹25,00,000 limit', 'CHARGE_TOO_LARGE');
  }
  return out;
}

// ── discount ────────────────────────────────────────────────────────────────

export interface MillDiscountInput { type: 'fixed' | 'percentage'; value: number }

/** Existing shapes are preserved: a bare number = fixed ₹; {type, value} with fixed | percentage | percent. */
export function normalizeMillDiscount(raw: unknown): MillDiscountInput | null {
  if (raw === undefined || raw === null || raw === '') return null;
  let type: 'fixed' | 'percentage' = 'fixed';
  let valueRaw: unknown = raw;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as { type?: unknown; value?: unknown };
    const t = o.type === undefined || o.type === null ? 'fixed' : String(o.type).toLowerCase();
    if (t === 'fixed' || t === 'amount') type = 'fixed';
    else if (t === 'percentage' || t === 'percent') type = 'percentage';
    else throw new MillBillingError('discount.type must be "fixed" or "percentage"', 'INVALID_DISCOUNT');
    valueRaw = o.value;
  } else if (Array.isArray(raw)) {
    throw new MillBillingError('discount must be a number or {type, value}', 'INVALID_DISCOUNT');
  }
  const value = parseStrictNumber(valueRaw, 'Discount');
  if (value < 0) throw new MillBillingError('Discount cannot be negative', 'INVALID_DISCOUNT');
  if (type === 'percentage' && value > 100) throw new MillBillingError('Discount percentage cannot exceed 100', 'INVALID_DISCOUNT');
  if (type === 'fixed') rupeesToPaiseExact(value, 'Discount');
  return { type, value };
}

// ── engine ──────────────────────────────────────────────────────────────────

export interface MillLineInput {
  quantity: number;
  /** Price per unit BEFORE GST (mill_v2 rate). */
  rate: number;
  /** GST % applied to this line (only used when billType = 'gst'). */
  gstRate: number;
  /** TOTAL stored (ex-GST) cost of the quantity on this line, in rupees. */
  costTotal: number;
  hsnCode?: string | null;
}

export interface MillInput {
  lines: MillLineInput[];
  discount: MillDiscountInput | null;
  billType: 'gst' | 'non_gst';
  interState: boolean;
  /** Already normalised (see normalizeMillCharges). */
  charges: MillCharges;
}

export interface MillLineResult {
  grossPaise: number;
  discountPaise: number;
  taxablePaise: number;
  gstRate: number;
  costPaise: number;
  profitPaise: number;
  marginPerUnit: number; // ₹, 2dp — same meaning as SaleItem.marginPerUnit in legacy
}

export interface MillGstGroup { rate: number; taxable: number; cgst: number; sgst: number; igst: number; gst: number }
export interface MillHsnGroup { hsnCode: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number }

export interface MillResult {
  lines: MillLineResult[];
  goodsSubtotal: number;      // Σ rate × qty (before discount)
  discount: number;           // ₹ applied to goods
  taxable: number;            // goods after discount (GST base)
  gstBilled: boolean;
  interState: boolean;
  groups: MillGstGroup[];     // rate-wise; the AUTHORITATIVE tax split
  hsnGroups: MillHsnGroup[];  // informational (each rounded on its own)
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
  goodsWithGst: number;       // taxable + GST
  charges: MillCharges;
  chargesTotal: number;
  preRoundTotal: number;      // goodsWithGst + chargesTotal
  roundOff: number;           // signed; grandTotal = preRoundTotal + roundOff
  grandTotal: number;         // whole rupees
  totalProfit: number;        // taxable goods − cost (charges/GST/round-off excluded)
}

/** Largest-remainder split of `total` paise across weights (BigInt: bill sizes × discounts overflow 2^53). */
function allocateProportionally(total: number, weights: number[]): number[] {
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sumW <= 0) return weights.map(() => 0);
  const T = BigInt(total);
  const S = BigInt(sumW);
  const floors: number[] = [];
  const fracs: { i: number; frac: bigint }[] = [];
  let used = 0;
  weights.forEach((w, i) => {
    const num = BigInt(w) * T;
    const q = num / S;
    floors.push(Number(q));
    used += Number(q);
    fracs.push({ i, frac: num % S });
  });
  let leftover = total - used;
  fracs.sort((a, b) => (a.frac === b.frac ? a.i - b.i : a.frac > b.frac ? -1 : 1));
  for (const f of fracs) {
    if (leftover <= 0) break;
    if (f.frac > BigInt(0)) { floors[f.i] += 1; leftover -= 1; }
  }
  return floors;
}

/** GST for a taxable base at `rate` % — integer math, half-up on the paisa. */
function gstOf(taxablePaise: number, rate: number): number {
  const rate100 = Math.round(rate * 100);
  return Math.floor((taxablePaise * rate100 + 5000) / 10000);
}

export function calculateMillInvoice(input: MillInput): MillResult {
  if (!input.lines.length) throw new MillBillingError('No goods lines in bill', 'NO_ITEMS');

  // 1. Goods lines
  const grossPaise: number[] = input.lines.map((l, idx) => {
    if (!Number.isFinite(l.quantity) || l.quantity <= 0) throw new MillBillingError(`Line ${idx + 1}: quantity must be greater than 0`, 'INVALID_QUANTITY');
    if (!Number.isFinite(l.rate) || l.rate < 0) throw new MillBillingError(`Line ${idx + 1}: rate must be a finite number ≥ 0`, 'INVALID_RATE');
    if (!Number.isFinite(l.gstRate) || l.gstRate < 0 || l.gstRate > 100) throw new MillBillingError(`Line ${idx + 1}: invalid GST rate`, 'INVALID_GST_RATE');
    return toPaise(l.rate * l.quantity);
  });
  const goodsSubtotalP = grossPaise.reduce((a, b) => a + b, 0);

  // 2. Goods discount (never on charges), capped at the goods subtotal
  let discountP = 0;
  if (input.discount) {
    discountP = input.discount.type === 'percentage'
      ? Math.round((goodsSubtotalP * input.discount.value) / 100)
      : rupeesToPaiseExact(input.discount.value, 'Discount');
    discountP = Math.min(goodsSubtotalP, Math.max(0, discountP));
  }
  const shares = allocateProportionally(discountP, grossPaise);
  const taxableLine = grossPaise.map((g, i) => g - shares[i]);
  const taxableP = taxableLine.reduce((a, b) => a + b, 0);

  // 3. GST — exclusive add-on, per rate group, only on a GST bill
  const gstBilled = input.billType === 'gst';
  const byRate = new Map<number, number>();
  const byHsn = new Map<string, { rate: number; taxable: number }>();
  input.lines.forEach((l, i) => {
    const rate = gstBilled ? l.gstRate : 0;
    byRate.set(rate, (byRate.get(rate) || 0) + taxableLine[i]);
    if (gstBilled) {
      const key = `${(l.hsnCode || '-').trim() || '-'}|${rate}`;
      const h = byHsn.get(key) || { rate, taxable: 0 };
      h.taxable += taxableLine[i];
      byHsn.set(key, h);
    }
  });
  const splitTax = (gst: number) => {
    if (input.interState) return { cgst: 0, sgst: 0, igst: gst };
    const cgst = Math.floor((gst + 1) / 2);
    return { cgst, sgst: gst - cgst, igst: 0 };
  };
  const groups: MillGstGroup[] = [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, taxable]) => {
      const gst = gstBilled ? gstOf(taxable, rate) : 0;
      const t = splitTax(gst);
      return { rate, taxable: fromPaise(taxable), cgst: fromPaise(t.cgst), sgst: fromPaise(t.sgst), igst: fromPaise(t.igst), gst: fromPaise(gst) };
    });
  const totalGstP = groups.reduce((s, g) => s + Math.round(g.gst * 100), 0);
  const cgstP = groups.reduce((s, g) => s + Math.round(g.cgst * 100), 0);
  const sgstP = groups.reduce((s, g) => s + Math.round(g.sgst * 100), 0);
  const igstP = groups.reduce((s, g) => s + Math.round(g.igst * 100), 0);
  const hsnGroups: MillHsnGroup[] = [...byHsn.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, h]) => {
      const t = splitTax(gstOf(h.taxable, h.rate));
      return { hsnCode: key.split('|')[0], rate: h.rate, taxable: fromPaise(h.taxable), cgst: fromPaise(t.cgst), sgst: fromPaise(t.sgst), igst: fromPaise(t.igst) };
    });

  // 4. Non-GST, non-discountable charges
  const chargePaise = MILL_CHARGE_KEYS.map((k) => rupeesToPaiseExact(input.charges[k] || 0, `Charge "${k}"`));
  const chargesTotalP = chargePaise.reduce((a, b) => a + b, 0);

  // 5. Round-off: nearest ₹1, half-up (e.g. …50 paise rounds UP)
  const preRoundP = taxableP + totalGstP + chargesTotalP;
  const grandP = Math.floor((preRoundP + 50) / 100) * 100;
  const roundOffP = grandP - preRoundP;

  // 6. Profit — taxable goods vs stored ex-GST cost
  const lines: MillLineResult[] = input.lines.map((l, i) => {
    const costP = toPaise(Number.isFinite(l.costTotal) && l.costTotal > 0 ? l.costTotal : 0);
    const profitP = taxableLine[i] - costP;
    return {
      grossPaise: grossPaise[i],
      discountPaise: shares[i],
      taxablePaise: taxableLine[i],
      gstRate: gstBilled ? l.gstRate : 0,
      costPaise: costP,
      profitPaise: profitP,
      marginPerUnit: fromPaise(Math.round(profitP / l.quantity)),
    };
  });
  const totalProfitP = lines.reduce((s, l) => s + l.profitPaise, 0);

  return {
    lines,
    goodsSubtotal: fromPaise(goodsSubtotalP),
    discount: fromPaise(discountP),
    taxable: fromPaise(taxableP),
    gstBilled,
    interState: input.interState,
    groups,
    hsnGroups,
    cgst: fromPaise(cgstP),
    sgst: fromPaise(sgstP),
    igst: fromPaise(igstP),
    totalGst: fromPaise(totalGstP),
    goodsWithGst: fromPaise(taxableP + totalGstP),
    charges: Object.fromEntries(MILL_CHARGE_KEYS.map((k, i) => [k, fromPaise(chargePaise[i])])) as MillCharges,
    chargesTotal: fromPaise(chargesTotalP),
    preRoundTotal: fromPaise(preRoundP),
    roundOff: fromPaise(roundOffP),
    grandTotal: fromPaise(grandP),
    totalProfit: fromPaise(totalProfitP),
  };
}
