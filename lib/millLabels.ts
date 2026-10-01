/**
 * Display-only translation of mill (Bada Udyog) stage names, execution field labels, dropdown options and section titles.
 * Stored values stay canonical English; anything without a translation (custom stages/fields typed by the user)
 * falls back to the raw text.
 */

type T = { (key: string, values?: Record<string, any>): string; has?: (key: string) => boolean };

export function millSlug(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/%/g, ' pct')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function lookup(t: T, prefix: string, raw: string): string {
  if (!raw) return raw;
  const key = `${prefix}${millSlug(raw)}`;
  try {
    return t.has && t.has(key) ? t(key) : raw;
  } catch {
    return raw;
  }
}

export const stageLabel = (t: T, name: string) => lookup(t, 'stg_', name);
export const fieldLabel = (t: T, name: string) => lookup(t, 'fld_', name);
export const optionLabel = (t: T, value: string) => lookup(t, 'opt_', value);
export const sectionLabel = (t: T, key: string, fallback: string) => {
  const k = `sec_${key}`;
  try {
    return t.has && t.has(k) ? t(k) : fallback;
  } catch {
    return fallback;
  }
};
