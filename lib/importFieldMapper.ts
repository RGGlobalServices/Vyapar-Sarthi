/**
 * Smart column mapper for the Import wizard.
 *
 * Matching a file's columns to our canonical fields by header name alone is
 * brittle: every shop's suppliers label things differently ("Rate", "Price/Unit",
 * "Dar", "MRP/Unit"), OCR mangles headers, and some columns collide outright —
 * normalising "GST %" yields "gst", which happily matches a "GST" column that
 * actually holds the tax *amount*.
 *
 * So each (canonical field, source column) pair is scored on two independent
 * signals and the best assignment wins:
 *
 *   1. NAME  — exact/alias hit, token overlap, or substring similarity.
 *   2. VALUE — does the column's actual data look like this field? A GST rate
 *              is a small number from a known set; an HSN code is 4/6/8 digits;
 *              a product name is mostly letters and mostly unique.
 *
 * Value scoring is what makes this survive unfamiliar bills: even with a header
 * we've never seen, a column of 5/12/18 is recognisably a GST rate, and one of
 * 13830.30 is not. Assignment is greedy over the sorted score list, and each
 * source column is consumed at most once so two fields can't claim the same data.
 */

export type ValueProfile =
  | 'name'      // product / person names
  | 'text'      // free text (category, address, notes)
  | 'unit'      // Pcs, Kg, Box…
  | 'quantity'  // positive, usually whole
  | 'price'     // money
  | 'percent'   // 0–100
  | 'gstRate'   // percent, and usually one of the statutory slabs
  | 'hsn'       // 4/6/8 digit classification code
  | 'barcode'   // long numeric code
  | 'date'
  | 'phone';

export interface MappableField {
  label: string;
  aliases?: string[];
  profile?: ValueProfile;
}

const norm = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const tokens = (s: string) =>
  String(s).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);

/**
 * Parse a cell as a number, but only when the WHOLE cell is one.
 *
 * Stripping non-digits instead would turn "Tata Salt 1kg" into 1, making a
 * product-name column look like a quantity column and hijacking the mapping.
 * Currency symbols, thousands separators and a trailing % are still tolerated.
 */
const toNum = (v: any): number => {
  if (v === undefined || v === null) return NaN;
  const s = String(v).trim().replace(/[₹$,\s]/g, '').replace(/%$/, '');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
};

const GST_SLABS = new Set([0, 0.25, 3, 5, 12, 18, 28]);

/** Up to `limit` non-empty raw values from a column. */
function sample(rows: any[], header: string, limit = 40): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const v = r?.[header];
    if (v === undefined || v === null || String(v).trim() === '') continue;
    out.push(String(v).trim());
    if (out.length >= limit) break;
  }
  return out;
}

/** How well a column's values fit a profile. 0 = contradicts, 1 = ideal. */
function scoreValues(profile: ValueProfile | undefined, vals: string[]): number {
  if (!profile || vals.length === 0) return 0.5; // neutral — no evidence

  const nums = vals.map(toNum);
  const numeric = nums.filter(Number.isFinite);
  const numericRatio = numeric.length / vals.length;
  const letterRatio = vals.filter((v) => /[a-z]/i.test(v)).length / vals.length;
  const uniqueRatio = new Set(vals.map((v) => v.toLowerCase())).size / vals.length;

  switch (profile) {
    case 'name':
      // Mostly words, rarely repeated, not a number column.
      if (numericRatio > 0.7) return 0.02;
      return Math.min(1, 0.35 + letterRatio * 0.4 + uniqueRatio * 0.25);

    case 'text':
      if (numericRatio > 0.9) return 0.15;
      return 0.4 + letterRatio * 0.3;

    case 'unit': {
      // A short, highly repeated vocabulary.
      const known = /^(pcs?|pc|nos?|no|kg|kgs|gm|gms|g|ltr|lt|l|ml|box|bag|pkt|packet|pair|dozen|dz|set|roll|mtr|m|unit|units|piece|pieces)$/i;
      const hits = vals.filter((v) => known.test(v)).length / vals.length;
      if (hits > 0.5) return 1;
      if (numericRatio > 0.5) return 0.05;
      const short = vals.filter((v) => v.length <= 6).length / vals.length;
      return 0.2 + short * 0.3 * (1 - uniqueRatio);
    }

    case 'quantity': {
      if (numericRatio < 0.8) return 0.05;
      const positive = numeric.filter((n) => n > 0).length / numeric.length;
      const whole = numeric.filter((n) => Math.abs(n - Math.round(n)) < 0.001).length / numeric.length;
      // Quantities are small-ish; a column of 13830.30 is money, not a count.
      const modest = numeric.filter((n) => Math.abs(n) < 100000).length / numeric.length;
      return Math.min(1, 0.15 + positive * 0.25 + whole * 0.4 + modest * 0.2);
    }

    case 'price': {
      if (numericRatio < 0.8) return 0.05;
      const positive = numeric.filter((n) => n >= 0).length / numeric.length;
      return Math.min(1, 0.4 + positive * 0.4);
    }

    case 'percent': {
      if (numericRatio < 0.8) return 0.05;
      const inRange = numeric.filter((n) => n >= 0 && n <= 100).length / numeric.length;
      // Anything outside 0–100 is decisive evidence against.
      return inRange < 0.9 ? 0.02 : 0.5 + inRange * 0.5;
    }

    case 'gstRate': {
      if (numericRatio < 0.8) return 0.05;
      const inRange = numeric.filter((n) => n >= 0 && n <= 100).length / numeric.length;
      if (inRange < 0.9) return 0.01; // a tax AMOUNT, not a rate
      const slab = numeric.filter((n) => GST_SLABS.has(n)).length / numeric.length;
      return Math.min(1, 0.45 + slab * 0.55);
    }

    case 'hsn': {
      // Must be digits ONLY — stripping letters first would let a batch code
      // like "B2211" pass as a 4-digit HSN.
      const pure = vals.filter((v) => /^(\d{4}|\d{6}|\d{8})$/.test(v.trim())).length / vals.length;
      return pure > 0.7 ? 1 : pure * 0.5;
    }

    case 'barcode': {
      const longDigits = vals.filter((v) => /^\d{8,14}$/.test(v.replace(/\s/g, ''))).length / vals.length;
      return longDigits > 0.7 ? 1 : 0.1 + longDigits * 0.5;
    }

    case 'date': {
      // Date.parse() accepts a bare "48" (as a year), which would let a price
      // column be mapped to Expiry Date. Require an actual date shape.
      const looksLikeDate = (v: string) => {
        const s = v.trim();
        if (/^-?\d+\.?\d*$/.test(s)) return false;              // plain number
        if (/\d{1,4}[/-]\d{1,2}([/-]\d{1,4})?/.test(s)) return true;
        if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(s)) return true;
        return false;
      };
      const dates = vals.filter(looksLikeDate).length / vals.length;
      return dates > 0.7 ? 1 : dates * 0.5;
    }

    case 'phone': {
      const phones = vals.filter((v) => {
        const d = v.replace(/\D/g, '');
        return d.length >= 10 && d.length <= 13;
      }).length / vals.length;
      return phones > 0.7 ? 1 : phones * 0.5;
    }

    default:
      return 0.5;
  }
}

/** Header-name similarity, 0–1. */
function scoreName(field: MappableField, header: string): number {
  const h = norm(header);
  if (!h) return 0;

  const label = norm(field.label);
  const aliases = (field.aliases ?? []).map(norm);

  if (h === label) return 1;
  if (aliases.includes(h)) return 0.97;

  // Contained either way ("rate" vs "purchaserate", "qty" vs "qtypcs").
  for (const cand of [label, ...aliases]) {
    if (!cand) continue;
    if (h.includes(cand) || cand.includes(h)) {
      const ratio = Math.min(h.length, cand.length) / Math.max(h.length, cand.length);
      return 0.55 + ratio * 0.3;
    }
  }

  // Token overlap for multi-word headers ("item description", "price per unit").
  const ht = new Set(tokens(header));
  let best = 0;
  for (const cand of [field.label, ...(field.aliases ?? [])]) {
    const ct = tokens(cand);
    if (!ct.length || !ht.size) continue;
    const shared = ct.filter((t) => ht.has(t)).length;
    if (shared) best = Math.max(best, shared / Math.max(ct.length, ht.size));
  }
  return best * 0.6;
}

export interface MappingResult {
  /** canonical label -> source header */
  assignment: Record<string, string>;
  /** headers that no field claimed */
  unused: string[];
}

/**
 * Assign source columns to canonical fields.
 *
 * `strictNameOnly` reproduces the old exact-match behaviour and is used for
 * files whose headers we already trust (a downloaded template).
 */
export function mapColumns(
  fields: MappableField[],
  fileHeaders: string[],
  rows: any[],
  opts: { minScore?: number } = {},
): MappingResult {
  const minScore = opts.minScore ?? 0.42;

  // Cache one sample set per header rather than re-scanning per field.
  const samples = new Map<string, string[]>();
  for (const h of fileHeaders) samples.set(h, sample(rows, h));

  type Cand = { field: string; header: string; score: number; name: number };
  const cands: Cand[] = [];

  for (const field of fields) {
    for (const header of fileHeaders) {
      const name = scoreName(field, header);
      const value = scoreValues(field.profile, samples.get(header) || []);

      // A confident name match is usually right, but must still be vetoed when
      // the data plainly contradicts it — this is the "GST" column holding
      // 691.52 case. Otherwise names lead and values break ties.
      let score: number;
      if (name >= 0.95 && value <= 0.05) score = 0.2;        // vetoed
      else if (name >= 0.95) score = 0.75 + value * 0.25;
      else score = name * 0.55 + value * 0.45;

      if (score >= minScore) cands.push({ field: field.label, header, score, name });
    }
  }

  // Greedy: strongest pairings first; each field and header used once.
  cands.sort((a, b) => b.score - a.score || b.name - a.name);
  const assignment: Record<string, string> = {};
  const takenHeaders = new Set<string>();
  for (const c of cands) {
    if (assignment[c.field] || takenHeaders.has(c.header)) continue;
    assignment[c.field] = c.header;
    takenHeaders.add(c.header);
  }

  return {
    assignment,
    unused: fileHeaders.filter((h) => !takenHeaders.has(h)),
  };
}

/**
 * Identify the rate/price column from the line arithmetic when neither its name
 * nor its shape gave it away.
 *
 * Three fields (MRP, Selling Price, Cost Price) all look like "money", so an
 * unrecognised header such as "Dar" or "Bhav" cannot be placed on value shape
 * alone. But given the mapped quantity, the rate is whichever remaining column
 * R satisfies `quantity × R ≈ A` for some other column A (the line amount) —
 * a relation that holds regardless of what the supplier calls the column.
 */
export function inferRateByArithmetic(
  assignment: Record<string, string>,
  fileHeaders: string[],
  rows: any[],
  qtyField: string,
  rateField: string,
): Record<string, string> {
  if (assignment[rateField]) return assignment;           // already mapped
  const qtyCol = assignment[qtyField];
  if (!qtyCol) return assignment;

  const taken = new Set(Object.values(assignment));
  const free = fileHeaders.filter((h) => !taken.has(h));
  if (free.length < 2) return assignment;

  const agreement = (rateCol: string, amtCol: string): number => {
    let ok = 0;
    let seen = 0;
    for (const r of rows.slice(0, 25)) {
      const q = toNum(r?.[qtyCol]);
      const rate = toNum(r?.[rateCol]);
      const amt = toNum(r?.[amtCol]);
      if (![q, rate, amt].every(Number.isFinite)) continue;
      if (q <= 0 || rate <= 0 || amt <= 0) continue;
      seen++;
      const expected = q * rate;
      if (Math.abs(expected - amt) / Math.max(expected, amt) <= 0.02) ok++;
    }
    return seen === 0 ? 0 : ok / seen;
  };

  let best: { col: string; score: number } | null = null;
  for (const rateCol of free) {
    for (const amtCol of free) {
      if (rateCol === amtCol) continue;
      const s = agreement(rateCol, amtCol);
      // The relation is exact arithmetic, so demand near-total agreement.
      if (s >= 0.8 && (!best || s > best.score)) best = { col: rateCol, score: s };
    }
  }

  return best ? { ...assignment, [rateField]: best.col } : assignment;
}

/**
 * Cross-check quantity / rate / amount against each other and swap in a better
 * column when the arithmetic says so.
 *
 * On an invoice line: amount ≈ quantity × rate (before discount/tax). When the
 * mapped pair doesn't satisfy that but some other column does, the mapping —
 * not the invoice — is wrong. This catches the failure that header names alone
 * cannot: quantity accidentally read from the Discount column.
 */
export function refineWithArithmetic(
  assignment: Record<string, string>,
  fileHeaders: string[],
  rows: any[],
  fieldNames: { quantity: string; rate: string; amount: string },
): Record<string, string> {
  const { quantity: qtyField, rate: rateField, amount: amtField } = fieldNames;
  const rateCol = assignment[rateField];
  const amtCol = assignment[amtField];
  if (!rateCol || !amtCol) return assignment;

  const fits = (qtyCol: string): number => {
    let ok = 0;
    let seen = 0;
    for (const r of rows.slice(0, 25)) {
      const q = toNum(r?.[qtyCol]);
      const rate = toNum(r?.[rateCol]);
      const amt = toNum(r?.[amtCol]);
      if (![q, rate, amt].every(Number.isFinite) || rate === 0) continue;
      seen++;
      // Generous tolerance: line amounts carry discount and tax.
      const expected = q * rate;
      if (expected > 0 && Math.abs(expected - amt) / Math.max(expected, amt) <= 0.35) ok++;
    }
    return seen === 0 ? -1 : ok / seen;
  };

  const current = assignment[qtyField];
  const currentFit = current ? fits(current) : -1;
  if (currentFit >= 0.6) return assignment; // already consistent

  const taken = new Set(Object.values(assignment).filter((h) => h !== current));
  let bestCol: string | null = null;
  let bestFit = currentFit;
  for (const h of fileHeaders) {
    if (taken.has(h)) continue;
    const f = fits(h);
    if (f > bestFit + 0.2) { bestFit = f; bestCol = h; }
  }

  if (bestCol && bestFit >= 0.6) {
    return { ...assignment, [qtyField]: bestCol };
  }
  return assignment;
}
