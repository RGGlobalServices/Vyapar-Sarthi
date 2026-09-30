/**
 * Single source of truth for product variants (colour / size).
 *
 * A product's variants are canonically `Product.variants[]`
 * ([{color,size,stock,costPrice,wholesalePrice,sellingPrice,mrp}]). The legacy
 * `Product.size_variants` JSON string ({"Red / M": 5, "L": 3}, used by the
 * Dukan/Vyapar screens and billing) and `Product.currentStock` are mirrors that
 * are DERIVED from it here, so every writer (manual add/edit, import, purchases,
 * stock adjust, billing) keeps all three consistent.
 *
 * Pure module — no React / Prisma — safe on both client and server.
 */

export const VARIANT_SEP = ' / ';

export type VariantRow = {
  color?: string;
  size?: string;
  stock: number;
  costPrice?: number;
  wholesalePrice?: number;
  sellingPrice?: number;
  mrp?: number;
  [extra: string]: any;
};

/** Composite key that always carries the separator ("Red / M", "Red / "). Used by the grids. */
export function makeVariantKey(color: string, size: string): string {
  return `${color}${VARIANT_SEP}${size}`;
}

export function splitVariantKey(key: string): { color: string; size: string } {
  const idx = key.indexOf(VARIANT_SEP);
  if (idx === -1) return { color: '', size: key };
  return { color: key.slice(0, idx), size: key.slice(idx + VARIANT_SEP.length) };
}

/** Canonical key of a variant row: "Colour / Size", or the bare size when there is no colour. */
export function variantKeyOf(v: { color?: string | null; size?: string | null }): string {
  const color = (v.color ?? '').toString().trim();
  const size = (v.size ?? '').toString().trim();
  return color ? `${color}${VARIANT_SEP}${size}` : size;
}

/** Case/whitespace-insensitive form used ONLY for comparing keys. */
export function normKey(key: string | null | undefined): string {
  return (key ?? '')
    .toString()
    .split(VARIANT_SEP)
    .map((p) => p.trim().replace(/\s+/g, ' ').toLowerCase())
    .join(VARIANT_SEP)
    .replace(/ \/ $/, ' / ');
}

export function keysMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  return normKey(a) === normKey(b);
}

/** Accepts the JSON string, an object, or null and returns {key: qty}. Never throws. */
export function parseSizeVariantsMap(raw: unknown): Record<string, number> {
  if (!raw) return {};
  let obj: any = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return {}; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) {
    const n = Number(v);
    out[k] = Number.isFinite(n) ? n : 0;
  }
  return out;
}

export function sumStock(rows: Array<{ stock?: any }> | null | undefined): number {
  return (rows || []).reduce((s, r) => s + (Number(r?.stock) || 0), 0);
}

/** Cleans a variants[] array: trims, coerces numbers, merges duplicate keys (summing stock). */
export function cleanVariants(input: unknown): VariantRow[] {
  if (!Array.isArray(input)) return [];
  const byKey = new Map<string, VariantRow>();
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const color = String((raw as any).color ?? '').trim();
    const size = String((raw as any).size ?? '').trim();
    if (!color && !size) continue;
    const stock = Number((raw as any).stock ?? (raw as any).quantity ?? 0);
    const row: VariantRow = { ...(raw as any), color, size, stock: Number.isFinite(stock) ? stock : 0 };
    delete (row as any).quantity;
    const k = normKey(variantKeyOf(row));
    const prev = byKey.get(k);
    if (prev) prev.stock += row.stock;
    else byKey.set(k, row);
  }
  return [...byKey.values()];
}

/** variants[] -> {key: qty} (all rows, including zero-stock ones, so a variant keeps its identity). */
export function variantsToSizeMap(rows: VariantRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = variantKeyOf(r);
    out[k] = (out[k] || 0) + (Number(r.stock) || 0);
  }
  return out;
}

/**
 * {key: qty} -> variants[], keeping price fields of any existing row with the same key.
 * Keys absent from the map are dropped (the map is the caller's full intended set).
 */
export function sizeMapToVariants(map: Record<string, number>, existing: VariantRow[] = []): VariantRow[] {
  const prev = new Map(existing.map((r) => [normKey(variantKeyOf(r)), r]));
  const rows: VariantRow[] = [];
  for (const [key, qty] of Object.entries(map)) {
    const { color, size } = splitVariantKey(key);
    const old = prev.get(normKey(key));
    rows.push({ ...(old || {}), color: color.trim(), size: size.trim(), stock: Number(qty) || 0 });
  }
  return cleanVariants(rows);
}

export type NormalizedVariants = {
  variants: VariantRow[];
  sizeVariants: Record<string, number>;
  sizeVariantsJson: string | null;
  currentStock: number | null;
  hasVariants: boolean;
};

/**
 * Reconcile whatever the caller sent into the three consistent stores.
 *  - `variants` (non-empty array) wins;
 *  - otherwise `sizeVariants` (string/object) is converted, keeping prices from `existingVariants`;
 *  - nothing usable sent -> hasVariants=false and the caller should leave the columns untouched.
 * `currentStock` is the variant sum whenever variants exist, else null (caller keeps its own value).
 */
export function normalizeVariants(input: {
  variants?: unknown;
  sizeVariants?: unknown;
  existingVariants?: unknown;
}): NormalizedVariants {
  const existing = cleanVariants(input.existingVariants);
  let rows = cleanVariants(input.variants);
  if (!rows.length) {
    const map = parseSizeVariantsMap(input.sizeVariants);
    if (Object.keys(map).length) rows = sizeMapToVariants(map, existing);
  }
  if (!rows.length) {
    return { variants: [], sizeVariants: {}, sizeVariantsJson: null, currentStock: null, hasVariants: false };
  }
  const sizeVariants = variantsToSizeMap(rows);
  return {
    variants: rows,
    sizeVariants,
    sizeVariantsJson: JSON.stringify(sizeVariants),
    currentStock: sumStock(rows),
    hasVariants: true,
  };
}

/**
 * Applies a signed delta to one variant of a product's variants[] and returns the new mirrors.
 * Returns null when the key matches no row (caller decides: error or fall back to currentStock only).
 */
export function applyDelta(
  rows: unknown,
  variantKey: string,
  delta: number,
): { variants: VariantRow[]; sizeVariantsJson: string; currentStock: number; next: number } | null {
  const list = cleanVariants(rows);
  const row = list.find((r) => keysMatch(variantKeyOf(r), variantKey));
  if (!row) return null;
  row.stock = Math.max(0, (Number(row.stock) || 0) + delta);
  const map = variantsToSizeMap(list);
  return { variants: list, sizeVariantsJson: JSON.stringify(map), currentStock: sumStock(list), next: row.stock };
}

/**
 * Keys of the colour × size table shown by the simple variant builder.
 * Colours only  -> each colour gets a "Free Size" row; sizes only -> bare size keys.
 */
export const FREE_SIZE = 'Free Size';
export function variantGridKeys(colors: string[], sizes: string[]): Array<{ key: string; color: string; size: string }> {
  const cs = colors.map((c) => c.trim()).filter(Boolean);
  const ss = sizes.map((s) => s.trim()).filter(Boolean);
  const sizeList = ss.length ? ss : cs.length ? [FREE_SIZE] : [];
  const colorList = cs.length ? cs : [''];
  const out: Array<{ key: string; color: string; size: string }> = [];
  for (const color of colorList) {
    for (const size of sizeList) out.push({ key: color ? makeVariantKey(color, size) : size, color, size });
  }
  return out;
}

/** Splits a typed list ("S, M  L;XL") into distinct trimmed values, keeping first-seen order. */
export function splitList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[,;\n]+/)) {
    const v = part.trim().replace(/\s+/g, ' ');
    if (!v) continue;
    const k = v.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(v); }
  }
  return out;
}
