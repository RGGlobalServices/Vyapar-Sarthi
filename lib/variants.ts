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

// ── Shared stock-adjustment across BOTH variant stores ─────────────────────────
// Billing, returns, exchange, sale delete/restore, mill sales and trash restore all
// move per-variant stock. They used to each hand-roll the same JSON juggling with an
// exact-string key match (so "Red / M" vs "red / m" silently skipped) and no mirroring.

export type VariantStoreState = {
  map: Record<string, number> | null;
  rows: VariantRow[] | null;
  mapDirty: boolean;
  rowsDirty: boolean;
};

/** Reads size_variants (JSON string/object) + variants[] of a product into a mutable working state. */
export function openVariantStores(product: { size_variants?: any; variants?: any }): VariantStoreState {
  const parsed = parseSizeVariantsMap(product.size_variants);
  const map = Object.keys(parsed).length ? parsed : null;
  const rows = Array.isArray(product.variants) && product.variants.length
    ? (product.variants as any[]).map((v) => ({ ...v })) as VariantRow[]
    : null;
  return { map, rows, mapDirty: false, rowsDirty: false };
}

/**
 * Adds `delta` (negative = sell) to one variant in whichever store(s) hold it (case/space-insensitive key match).
 * Returns 'missing' when neither store has the key (nothing changed unless createIfMissing),
 * 'insufficient' when rejectNegative and it would go below 0 (nothing changed), else 'ok'.
 * Stock never goes below 0.
 */
export function adjustVariantStores(
  st: VariantStoreState,
  variantKey: string,
  delta: number,
  opts?: { rejectNegative?: boolean; createIfMissing?: boolean },
): 'ok' | 'missing' | 'insufficient' {
  const mapKey = st.map ? Object.keys(st.map).find((k) => keysMatch(k, variantKey)) : undefined;
  const row = st.rows ? st.rows.find((r) => keysMatch(variantKeyOf(r), variantKey)) : undefined;
  if (mapKey === undefined && !row) {
    if (opts?.createIfMissing && st.map) {
      st.map[variantKey] = Math.max(0, delta);
      st.mapDirty = true;
      return 'ok';
    }
    return 'missing';
  }
  if (opts?.rejectNegative) {
    if (mapKey !== undefined && (Number(st.map![mapKey]) || 0) + delta < 0) return 'insufficient';
    if (row && (Number(row.stock) || 0) + delta < 0) return 'insufficient';
  }
  if (mapKey !== undefined) {
    st.map![mapKey] = Math.max(0, (Number(st.map![mapKey]) || 0) + delta);
    st.mapDirty = true;
  }
  if (row) {
    row.stock = Math.max(0, (Number(row.stock) || 0) + delta);
    st.rowsDirty = true;
  }
  return 'ok';
}

/**
 * Fields to write back after adjustments. When only one store exists it is used to derive the other,
 * so a product never ends up with one store fresh and the other empty. Only changed fields are returned.
 */
export function closeVariantStores(st: VariantStoreState): { size_variants?: string; variants?: VariantRow[] } {
  const out: { size_variants?: string; variants?: VariantRow[] } = {};
  let map = st.map;
  let rows = st.rows;
  let mapDirty = st.mapDirty;
  let rowsDirty = st.rowsDirty;
  if (mapDirty && !rows) { rows = sizeMapToVariants(map || {}, []); rowsDirty = true; }
  if (rowsDirty && !map && rows) { map = variantsToSizeMap(rows); mapDirty = true; }
  if (mapDirty && map) out.size_variants = JSON.stringify(map);
  if (rowsDirty && rows) out.variants = rows;
  return out;
}

/** Stock of one variant of a product (looks in size_variants then variants[]); null when neither has the key. */
export function variantAvailable(product: { size_variants?: any; variants?: any }, variantKey: string): number | null {
  if (!variantKey) return null;
  const map = parseSizeVariantsMap(product.size_variants);
  const mk = Object.keys(map).find((k) => keysMatch(k, variantKey));
  if (mk !== undefined) return Number(map[mk]) || 0;
  if (Array.isArray(product.variants)) {
    const row = (product.variants as any[]).find((v) => keysMatch(variantKeyOf(v), variantKey));
    if (row) return Number(row.stock) || 0;
  }
  return null;
}

/** Human label for a variant key on bills: "Red / M", "22X32", never "Red / " or " / M". */
export function variantLabel(key: string | null | undefined): string {
  const { color, size } = splitVariantKey(String(key ?? ''));
  return [color, size].map((s) => s.trim()).filter(Boolean).join(' / ');
}
