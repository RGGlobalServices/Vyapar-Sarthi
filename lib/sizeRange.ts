/**
 * Size-range parsing shared between scan-bill / scan-purchase (AI-extracted
 * paper bills) and any manual variant entry. Indian footwear/apparel
 * shopkeepers routinely write a row as "6*8" or "6-8" meaning "sizes 6, 7,
 * and 8 — same rate and quantity each". Without this helper each of those
 * shorthand rows lands as a single opaque variant string ("6*8") that can't
 * match any real per-size stock, and the bill goes in with no colour/size
 * breakdown at all — the exact client complaint:
 *   "size option ch yet nahi sadhya .. samaj tyane 6*8 kel tr
 *    6 te 8 size zal pahije .. as tyat madhe auto te minus zal pahije"
 *
 * Ranges recognized:
 *   6*8, 6x8, 6X8       — Indian "size N to size M" shorthand
 *   6-8, 6 to 8, 6..8   — hyphen / word / dot separators
 *   S-XL, M to XXL      — clothing letter sizes on a known sequence
 *
 * Anything not shaped like a range is returned as a single-element array,
 * so callers can uniformly do `for (const s of parseSizeRange(raw)) …`
 * regardless of whether the input was a range or a plain size.
 */

/** Common apparel size sequence used to expand letter ranges. Kept in
 *  smallest-to-largest order — `S-XL` walks left-to-right through this list. */
const LETTER_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL', 'XXXXXL'];

/** Detect a numeric-range separator and split the two endpoints. Returns
 *  null if no separator (or more than one) is present. */
function splitRange(raw: string): [string, string] | null {
  const trimmed = raw.trim();
  // Ordered by specificity — "to" needs whitespace guards so "6to8" doesn't
  // silently swallow the middle. `*`, `x`, `X` are restricted to digit-adjacent
  // context so the X in "XL" isn't misread as a multiplication separator
  // (fixes "S-XL" → returning ["S-", "L"]). `-` and "to" are safe generic
  // separators that work for both numeric and letter ranges.
  const patterns: RegExp[] = [
    /^(.*?\d)\s*[*xX]\s*(\d.*?)$/, // 6*8, 40x44, UK 6*8 — digits required on both sides of separator
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

/** Parse a size fragment into the number part and any prefix. `UK/IND 6`
 *  → prefix `"UK/IND "`, num 6. `Size 40` → prefix `"Size "`, num 40. Plain
 *  `"6"` → prefix `""`, num 6. Bare `"S"` → num null. */
function splitNumericSize(raw: string): { prefix: string; num: number | null; suffix: string } {
  const m = raw.match(/^(.*?)(-?\d+(?:\.\d+)?)(\D*)$/);
  if (!m) return { prefix: raw, num: null, suffix: '' };
  return { prefix: m[1], num: Number(m[2]), suffix: m[3] };
}

/**
 * Expand a raw size string into every individual size it names. Returns a
 * single-element array for plain sizes and unrecognised input, so the
 * caller loop is the same either way.
 *
 * Examples (all real formats seen on Indian shoe/cloth bills):
 *   "6*8"        → ["6", "7", "8"]
 *   "6-8"        → ["6", "7", "8"]
 *   "6 to 8"     → ["6", "7", "8"]
 *   "UK 6-8"     → ["UK 6", "UK 7", "UK 8"]
 *   "UK/IND 6*8" → ["UK/IND 6", "UK/IND 7", "UK/IND 8"]
 *   "40*44"      → ["40", "41", "42", "43", "44"]
 *   "S-XL"       → ["S", "M", "L", "XL"]
 *   "M to XXL"   → ["M", "L", "XL", "XXL"]
 *   "8"          → ["8"]  (not a range — pass-through)
 *   ""/null      → []     (nothing to expand)
 *
 * Also stops at 40 sizes to prevent an accidentally-huge range (a typo like
 * "1 to 1000") from creating a thousand line items. Clamp is intentional
 * silent so the caller doesn't need to handle a special error.
 */
export function parseSizeRange(raw: string | null | undefined, opts?: { dimensions?: boolean }): string[] {
  if (raw === null || raw === undefined) return [];
  const trimmed = String(raw).trim();
  if (!trimmed) return [];

  // Textile / garment shops write "36X40" for a blanket / bedsheet / waist-by-length
  // DIMENSION, not "sizes 36 to 40". In that mode NNxNN stays ONE size label.
  if (opts?.dimensions && /^\d+(?:\.\d+)?\s*[*xX]\s*\d+(?:\.\d+)?$/.test(trimmed)) {
    return [trimmed.replace(/\s+/g, '').replace('*', 'X').toUpperCase()];
  }

  const pair = splitRange(trimmed);
  if (!pair) return [trimmed];

  const [aRaw, bRaw] = pair;
  const a = splitNumericSize(aRaw);
  const b = splitNumericSize(bRaw);

  // Numeric expansion — most common case for footwear. Prefer the left
  // endpoint's prefix; the right endpoint's number may be typed without the
  // prefix (`"UK 6-8"` → left "UK 6", right "8"). If both sides have their
  // own prefix and they differ, treat as non-numeric fallback.
  if (a.num !== null && b.num !== null) {
    const prefix = a.prefix || b.prefix || '';
    const suffix = a.suffix || b.suffix || '';
    if (b.prefix && a.prefix && b.prefix !== a.prefix) return [trimmed];
    const start = Math.min(a.num, b.num);
    const end = Math.max(a.num, b.num);
    // Only expand integer steps — half-sizes get returned as-is to avoid
    // "6.5 to 8.5" turning into 25 rows.
    if (!Number.isInteger(start) || !Number.isInteger(end)) return [trimmed];
    const width = end - start;
    if (width < 1) return [trimmed];
    if (width > 40) return [trimmed]; // guard against typo-explosions
    const out: string[] = [];
    for (let n = start; n <= end; n++) out.push(`${prefix}${n}${suffix}`);
    return out;
  }

  // Letter expansion (S-XL, M to XXL). Case-insensitive lookup on the
  // canonical LETTER_SIZES ladder. If either endpoint isn't a known letter
  // size, fall back to pass-through.
  const upper = (s: string) => s.trim().toUpperCase();
  const aIdx = LETTER_SIZES.indexOf(upper(aRaw));
  const bIdx = LETTER_SIZES.indexOf(upper(bRaw));
  if (aIdx !== -1 && bIdx !== -1 && aIdx !== bIdx) {
    const [lo, hi] = aIdx < bIdx ? [aIdx, bIdx] : [bIdx, aIdx];
    return LETTER_SIZES.slice(lo, hi + 1);
  }

  // Unknown format — leave as-is so the shopkeeper can still see and edit it.
  return [trimmed];
}
