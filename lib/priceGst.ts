/**
 * Selling-price GST handling for the product forms.
 *
 * The saved `Product.sellingPrice` is ALWAYS the GST-inclusive amount (billing, profit and reports all assume it);
 * the Including/Excluding toggle only decides what the shopkeeper TYPES and SEES in the form. So the form must
 * convert stored → shown when it opens and shown → stored when it saves, and an untouched price must come back
 * as the exact stored number (no multiply/divide round trip, which drifts or — if the load step is skipped —
 * re-applies GST on every save).
 */
export type SpMode = 'inclusive' | 'exclusive' | null;

/** What the form last showed, and the exact stored (inclusive) price behind it. */
export type SpBasis = { display: string; inclusive: number; gst: number; mode: SpMode };

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const rate = (gst: number) => 1 + (Number(gst) || 0) / 100;

/** The number to show in the Selling Price box for a stored inclusive price. */
export function priceForMode(inclusive: number, gst: number, mode: SpMode): number {
  return mode === 'exclusive' ? round2(inclusive / rate(gst)) : round2(inclusive);
}

export function makeBasis(inclusive: number, gst: number, mode: SpMode): SpBasis {
  const g = Number(gst) || 0;
  return { display: inclusive > 0 ? String(priceForMode(inclusive, g, mode)) : '', inclusive, gst: g, mode };
}

/** The GST-inclusive price to save for whatever is in the Selling Price box. */
export function inclusiveFromEntered(entered: string | number, gst: number, mode: SpMode, basis?: SpBasis | null): number {
  const g = Number(gst) || 0;
  if (basis && basis.mode === mode && basis.gst === g && String(entered) === basis.display) return basis.inclusive;
  const n = Number(entered) || 0;
  return mode === 'exclusive' ? round2(n * rate(g)) : round2(n);
}

/** Including ⇄ Excluding toggle: new box text + new basis, computed from the exact inclusive price. */
export function switchSpMode(entered: string | number, gst: number, from: Exclude<SpMode, null>, to: Exclude<SpMode, null>, basis?: SpBasis | null) {
  const inclusive = inclusiveFromEntered(entered, gst, from, basis);
  const next = makeBasis(inclusive, gst, to);
  return { display: next.display, basis: next };
}
