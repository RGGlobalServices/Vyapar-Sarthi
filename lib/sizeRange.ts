/**
 * Size-range parsing shared between scan-bill / scan-purchase (AI-extracted
 * paper bills) and any manual variant entry. Indian footwear/apparel
 * shopkeepers routinely write a row as "6*8" or "6-8" meaning "sizes 6, 7,
 * and 8 — same rate and quantity each". Without this helper each of those
 * shorthand rows lands as a single opaque variant string ("6*8") that can't
 * match any real per-size stock.
 *
 * Ranges recognized:
 *   6*8, 6x8, 6X8       — Indian "size N to size M" shorthand
 *   6-8, 6 to 8, 6..8   — hyphen / word / dot separators
 *   S-XL, M to XXL      — clothing letter sizes (canonical sequence)
 *   XS-3XL, XS-XXL      — extended sizes (2XL/3XL and XXL/XXXL both work)
 *   1Y-5Y               — children year sizes (step 1)
 *   0M-12M              — infant month sizes (fixed non-uniform sequence)
 *   FS / Free Size      — free size tokens (no expansion, normalized label)
 *
 * Smart step detection for numeric ranges:
 *   • Shoe/footwear range (both endpoints ≤ 16) → step 1  (6,7,8,9,10)
 *   • Even-number apparel range (both even, 10–54) → step 2  (38,40,42,44)
 *   • Everything else → step 1
 *   Override with the `hint` option when the category is known.
 *
 * EU shoe sizes (35–46) fall in the even-apparel zone and will be expanded
 * at step 2; pass hint: 'shoes' to force step 1 for those rows.
 */

// ─── Alpha size sequence ────────────────────────────────────────────────────

/** Canonical smallest-to-largest alpha ladder. Both "XXL" and "2XL" are
 *  accepted as input but the canonical output uses the 2XL/3XL form. */
const ALPHA_SEQUENCE = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'];

/** Normalise any alpha-size spelling to its canonical form, or return null. */
function normalizeAlpha(s: string): string | null {
  const u = s.trim().toUpperCase().replace(/\s+/g, '');
  if (ALPHA_SEQUENCE.includes(u)) return u;
  // Repeated-X forms: XXL → 2XL, XXXL → 3XL, XXXXL → 4XL, XXXXXL → 5XL
  const repXL = u.match(/^(X{2,})L$/); // at least XX, so XL itself is excluded
  if (repXL) {
    const n = repXL[1].length; // number of X's
    const canonical = `${n}XL`;
    return ALPHA_SEQUENCE.includes(canonical) ? canonical : null;
  }
  return null;
}

// ─── Infant month sequence ───────────────────────────────────────────────────

/** Non-uniform infant-age sequence. Expanding "0M-12M" by +1 would give
 *  13 rows; the real sizes are these 7 fixed points. */
const INFANT_MONTHS = ['0M', '3M', '6M', '9M', '12M', '18M', '24M'];

// ─── Free-size tokens ────────────────────────────────────────────────────────

/** Input tokens that mean "one size, no range" — normalised to 'Free Size'. */
const FREE_SIZE_RE = /^(free\s*size|freesize|one\s*size|onesize|os|fs|free)$/i;

// ─── Hint type ───────────────────────────────────────────────────────────────

export type SizeHint = 'shoes' | 'apparel' | 'kids' | 'saree' | 'fabric' | 'auto';

// ─── Range separator splitter ─────────────────────────────────────────────────

function splitRange(raw: string): [string, string] | null {
  const trimmed = raw.trim();
  const patterns: RegExp[] = [
    /^(.*?\d)\s*[*xX]\s*(\d.*?)$/, // 6*8, 40x44 — digits required on both sides
    /^(.+?)\s*\.\.\s*(.+)$/,
    /^(.+?)\s+to\s+(.+)$/i,
    /^(.+?)\s*-\s*(.+)$/,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m) {
      const a = m[1].trim();
      const b = m[2].trim();
      if (a && b && a !== b) return [a, b];
    }
  }
  return null;
}

// ─── Numeric size parser ──────────────────────────────────────────────────────

function splitNumericSize(raw: string): { prefix: string; num: number | null; suffix: string } {
  const m = raw.match(/^(.*?)(-?\d+(?:\.\d+)?)(\D*)$/);
  if (!m) return { prefix: raw, num: null, suffix: '' };
  return { prefix: m[1], num: Number(m[2]), suffix: m[3] };
}

// ─── Smart step detection ─────────────────────────────────────────────────────

/**
 * Decide the increment between consecutive sizes.
 *
 * Rules (applied in order):
 *  1. Explicit hint always wins.
 *  2. Both endpoints ≤ 16 → shoes/kids-footwear → step 1.
 *  3. Both endpoints even AND in 10–54 → apparel (shirt/blouse/trouser) → step 2.
 *  4. Default → step 1.
 */
function detectNumericStep(start: number, end: number, hint?: SizeHint): number {
  if (hint === 'shoes') return 1;
  if (hint === 'apparel' || hint === 'kids') {
    return (start % 2 === 0 && end % 2 === 0) ? 2 : 1;
  }
  // Shoe heuristic: India/UK sizes 1–13, kids shoe 1–8, with a little headroom
  if (start >= 1 && end <= 16) return 1;
  // Apparel heuristic: even numbers in shirt/blouse/trouser range
  if (start % 2 === 0 && end % 2 === 0 && start >= 10 && end <= 54) return 2;
  return 1;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Expand a raw size string into every individual size it names.
 * Returns a single-element array for plain sizes and unrecognised input.
 *
 * Examples:
 *   "6*8"        → ["6","7","8"]           (shoes, step 1)
 *   "38*44"      → ["38","40","42","44"]   (shirt, step 2 — both even 10–54)
 *   "28-36"      → ["28","30","32","34","36"] (trouser, step 2)
 *   "UK 6-9"     → ["UK 6","UK 7","UK 8","UK 9"]
 *   "S-XL"       → ["S","M","L","XL"]
 *   "XS-3XL"     → ["XS","S","M","L","XL","2XL","3XL"]
 *   "XS-XXL"     → ["XS","S","M","L","XL","2XL"]  (XXL → 2XL)
 *   "1Y-5Y"      → ["1Y","2Y","3Y","4Y","5Y"]
 *   "0M-12M"     → ["0M","3M","6M","9M","12M"]
 *   "FS"         → ["Free Size"]
 *   "Free Size"  → ["Free Size"]
 *   "8"          → ["8"]   (not a range — pass-through)
 *   ""/null      → []
 *
 * Caps at 40 sizes to prevent typo-explosions ("1 to 1000" → returned as-is).
 */
export function parseSizeRange(
  raw: string | null | undefined,
  opts?: { dimensions?: boolean; hint?: SizeHint }
): string[] {
  if (raw === null || raw === undefined) return [];
  const trimmed = String(raw).trim();
  if (!trimmed) return [];

  // ── Free size ────────────────────────────────────────────────────────────
  if (FREE_SIZE_RE.test(trimmed)) return ['Free Size'];

  // ── Saree / fabric hint → no expansion ──────────────────────────────────
  if (opts?.hint === 'saree' || opts?.hint === 'fabric') return [trimmed];

  // ── Textile dimension (36X40 = one size label, not a range) ──────────────
  if (opts?.dimensions && /^\d+(?:\.\d+)?\s*[*xX]\s*\d+(?:\.\d+)?$/.test(trimmed)) {
    return [trimmed.replace(/\s+/g, '').replace('*', 'X').toUpperCase()];
  }

  const pair = splitRange(trimmed);
  if (!pair) return [trimmed];
  const [aRaw, bRaw] = pair;

  // ── Infant month sizes (0M-12M) ──────────────────────────────────────────
  const monthRe = /^(\d+)M$/i;
  const aMonth = aRaw.match(monthRe);
  const bMonth = bRaw.match(monthRe);
  if (aMonth && bMonth) {
    const aIdx = INFANT_MONTHS.findIndex(m => m === aRaw.toUpperCase());
    const bIdx = INFANT_MONTHS.findIndex(m => m === bRaw.toUpperCase());
    if (aIdx !== -1 && bIdx !== -1 && aIdx !== bIdx) {
      const [lo, hi] = aIdx < bIdx ? [aIdx, bIdx] : [bIdx, aIdx];
      return INFANT_MONTHS.slice(lo, hi + 1);
    }
    // Partial match — just step through integers with M suffix
    const a = Number(aMonth[1]); const b = Number(bMonth[1]);
    const out: string[] = [];
    for (let n = Math.min(a, b); n <= Math.max(a, b); n++) out.push(`${n}M`);
    return out.length <= 40 ? out : [trimmed];
  }

  // ── Year sizes (1Y-5Y) ───────────────────────────────────────────────────
  const yearRe = /^(\d+)Y$/i;
  const aYear = aRaw.match(yearRe);
  const bYear = bRaw.match(yearRe);
  if (aYear && bYear) {
    const a = Number(aYear[1]); const b = Number(bYear[1]);
    const out: string[] = [];
    for (let n = Math.min(a, b); n <= Math.max(a, b); n++) out.push(`${n}Y`);
    return out.length <= 40 ? out : [trimmed];
  }

  // ── Numeric expansion ────────────────────────────────────────────────────
  const a = splitNumericSize(aRaw);
  const b = splitNumericSize(bRaw);
  if (a.num !== null && b.num !== null) {
    const prefix = a.prefix || b.prefix || '';
    const suffix = a.suffix || b.suffix || '';
    if (b.prefix && a.prefix && b.prefix !== a.prefix) return [trimmed];
    const start = Math.min(a.num, b.num);
    const end = Math.max(a.num, b.num);
    if (!Number.isInteger(start) || !Number.isInteger(end)) return [trimmed];
    const step = detectNumericStep(start, end, opts?.hint);
    const out: string[] = [];
    for (let n = start; n <= end; n += step) out.push(`${prefix}${n}${suffix}`);
    if (out.length > 40) return [trimmed];
    return out;
  }

  // ── Alpha expansion (S-XL, XS-3XL, XS-XXL) ─────────────────────────────
  const aNorm = normalizeAlpha(aRaw);
  const bNorm = normalizeAlpha(bRaw);
  if (aNorm && bNorm && aNorm !== bNorm) {
    const aIdx = ALPHA_SEQUENCE.indexOf(aNorm);
    const bIdx = ALPHA_SEQUENCE.indexOf(bNorm);
    if (aIdx !== -1 && bIdx !== -1) {
      const [lo, hi] = aIdx < bIdx ? [aIdx, bIdx] : [bIdx, aIdx];
      return ALPHA_SEQUENCE.slice(lo, hi + 1);
    }
  }

  // Unknown format — leave as-is
  return [trimmed];
}
