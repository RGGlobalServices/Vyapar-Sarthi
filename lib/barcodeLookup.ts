/**
 * Pure product-code lookup shared by billing scans, the search boxes and the stock screens (no React, unit-testable).
 *
 * Codes live in two places: the product's own barcode / SKU / carton barcode, and per-variant barcodes under
 * `metadata.size_prices[<variantKey>].barcode`. Everything that resolves or searches a scanned code must look at both.
 */

// Same rule as isPlaceholderVariantBarcode in lib/variants.ts (not imported: node's test runner needs file extensions on relative imports).
const isPlaceholderCode = (b: unknown) => /^PRD-NEW(-|$)/i.test(String(b ?? '').trim());

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

const parseMeta = (m: any) => {
  if (typeof m === 'string') { try { return JSON.parse(m); } catch { return {}; } }
  return m || {};
};

/** [variantKey, barcode] for every variant of the product that has a barcode. */
export function variantBarcodes(p: { metadata?: any }): Array<[string, string]> {
  const sp = parseMeta(p?.metadata)?.size_prices;
  if (!sp || typeof sp !== 'object') return [];
  const out: Array<[string, string]> = [];
  for (const [key, entry] of Object.entries<any>(sp)) {
    const code = String(entry?.barcode ?? '').trim();
    if (code) out.push([key, code]);
  }
  return out;
}

type VariantHit<T> = { product: T; variantKey: string };
const indexCache = new WeakMap<object, Map<string, VariantHit<any>>>();

/** code(UPPER) -> variant, built once per product list. Placeholder 'PRD-NEW-…' codes are shared by many products, so never indexed. */
function variantCodeIndex<T extends { metadata?: any }>(products: T[]): Map<string, VariantHit<T>> {
  let idx = indexCache.get(products);
  if (idx) return idx;
  idx = new Map();
  for (const p of products) {
    for (const [variantKey, code] of variantBarcodes(p)) {
      if (isPlaceholderCode(code)) continue;
      const k = code.toUpperCase();
      if (!idx.has(k)) idx.set(k, { product: p, variantKey });
    }
  }
  indexCache.set(products, idx);
  return idx;
}

/** Exact (case-insensitive) per-variant barcode match: the parent product and the exact colour/size. */
export function matchVariantByCode<T extends { metadata?: any }>(products: T[], rawCode: string): VariantHit<T> | undefined {
  const code = String(rawCode || '').trim().toUpperCase();
  return code ? variantCodeIndex(products).get(code) : undefined;
}

/** The part of a generated label code after the product code — same rule as generateVariantBarcodes (components/SizeVariantGrid). */
export const variantSuffix = (key: string) => String(key ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The product's variant keys in the form billing's addToCart expects: size_variants keys, then variants[], then keys that carry a saved barcode. */
export function variantKeysOf(p: { size_variants?: any; variants?: any; metadata?: any }): string[] {
  const keys: string[] = [];
  const add = (k: string) => { if (k && !keys.includes(k)) keys.push(k); };
  const sv = parseMeta(p?.size_variants);
  if (sv && typeof sv === 'object') Object.keys(sv).forEach(add);
  if (Array.isArray(p?.variants)) {
    for (const v of p.variants) {
      const color = v?.color ? String(v.color).trim() : '';
      const size = v?.size ? String(v.size).trim() : '';
      add(color && size ? `${color} / ${size}` : (size || color));
    }
  }
  variantBarcodes(p).forEach(([k]) => add(k));
  return keys;
}

type VariantProduct = { id?: any; barcode?: string | null; productType?: string | null; metadata?: any; size_variants?: any; variants?: any };

/**
 * A variant label whose code was generated as `<product code>-<variant>` ("PRD-4E5CD76B-24", "MSH-101-M") resolves to that exact
 * size even when the code was never saved on the product (the label was printed but the save didn't reach the server, or the
 * list is stale). Product codes are unique, so this cannot point at two products.
 */
export function deriveVariantFromCode<T extends VariantProduct>(products: T[], rawCode: string): VariantHit<T> | undefined {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return undefined;
  for (const p of products) {
    if (p.productType !== 'variant') continue;
    const bases = new Set<string>();
    const own = String(p.barcode ?? '').trim().toUpperCase();
    if (own.length >= 4) bases.add(own);
    if (p.id) bases.add(`PRD-${String(p.id).slice(0, 8).toUpperCase()}`);
    for (const base of bases) {
      if (!code.startsWith(base + '-')) continue;
      const rest = code.slice(base.length + 1);
      const key = variantKeysOf(p).find(k => variantSuffix(k) === rest);
      if (key) return { product: p, variantKey: key };
    }
  }
  return undefined;
}

/**
 * Labels printed by the old Add form carry `PRD-NEW-<variant>` — the same code on every new product. They are honoured only when
 * exactly ONE variant product has that variant, so a scan can never choose between two products.
 */
export function matchLegacyPlaceholder<T extends VariantProduct>(products: T[], rawCode: string): VariantHit<T> | undefined {
  const m = /^PRD-NEW-(.+)$/i.exec(String(rawCode || '').trim());
  if (!m) return undefined;
  const suffix = m[1].toUpperCase();
  let hit: VariantHit<T> | undefined;
  for (const p of products) {
    if (p.productType !== 'variant') continue;
    const key = variantKeysOf(p).find(k => variantSuffix(k) === suffix);
    if (!key) continue;
    if (hit) return undefined;
    hit = { product: p, variantKey: key };
  }
  return hit;
}

/** Substring match on the product's variant barcodes — for search boxes. `queryLower` must already be lower-case. */
export function variantCodeContains(p: { metadata?: any }, queryLower: string): boolean {
  if (!queryLower) return false;
  return variantBarcodes(p).some(([, code]) => code.toLowerCase().includes(queryLower));
}

/** Search-box match on a product's own barcode / SKU / carton barcode or any variant barcode. `queryLower` must be lower-case. */
export function itemCodeMatches(p: { barcode?: string | null; sku?: string | null; cartonBarcode?: string | null; metadata?: any }, queryLower: string): boolean {
  if (!queryLower) return false;
  return norm(p.barcode).includes(queryLower) || norm(p.sku).includes(queryLower) || norm(p.cartonBarcode).includes(queryLower) || variantCodeContains(p, queryLower);
}

type Coded = { barcode?: string | null; sku?: string | null; cartonBarcode?: string | null; hsnCode?: string | null };

/**
 * Find a product in an already-loaded list by any scannable identifier.
 *
 * Tries the item's company barcode, then SKU, then carton barcode — all exact, case-insensitive. HSN is only honoured
 * when it resolves to a single product, because an HSN code is a shared tax class and a multi-match must never guess
 * which product to bill. Returns undefined so the caller can fall back to the server lookup.
 */
export function matchProductByCode<T extends Coded>(products: T[], rawCode: string): T | undefined {
  const code = norm(rawCode);
  if (!code) return undefined;
  const eq = (v: string | null | undefined) => norm(v) === code;

  const direct = products.find(p => eq(p.barcode) || eq(p.sku) || eq(p.cartonBarcode));
  if (direct) return direct;

  const hsnMatches = products.filter(p => eq(p.hsnCode));
  if (hsnMatches.length === 1) return hsnMatches[0];

  // A batch-specific scan code is always `<product code>-B<n>` (see purchases/route.ts) — that reserved shape must NOT be
  // caught by the "code extends a known barcode" fallback below, or a batch scan silently resolves to the bare product
  // (auto-FIFO) instead of falling through to the server lookup that can actually find and target the batch.
  const looksLikeBatchSuffix = (base: string) => base.length >= 4 && new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-b\\d+$`).test(code);

  // Lenient fallback — real-world barcodes often round-trip through the catalogue with an added prefix ("BAR-8909106067240")
  // or padding. Only used when the substring hit is UNIQUE, so the scanner never silently grabs the wrong item.
  if (code.length >= 4) {
    const substringMatches = products.filter(p =>
      (norm(p.barcode).includes(code)) ||
      (norm(p.sku).includes(code)) ||
      (norm(p.cartonBarcode).includes(code)) ||
      (code.includes(norm(p.barcode)) && norm(p.barcode).length >= 4 && !looksLikeBatchSuffix(norm(p.barcode))) ||
      (code.includes(norm(p.sku)) && norm(p.sku).length >= 4 && !looksLikeBatchSuffix(norm(p.sku))) ||
      (code.includes(norm(p.cartonBarcode)) && norm(p.cartonBarcode).length >= 4 && !looksLikeBatchSuffix(norm(p.cartonBarcode)))
    );
    if (substringMatches.length === 1) return substringMatches[0];
  }

  return undefined;
}

/**
 * Resolve a scan to a product (and the exact variant when the code is a variant's own barcode).
 *
 * Order matters: an exact product code, then an exact variant code, and only then the lenient substring rules. A variant
 * code such as "PRD-4E5CD76B-24" contains its parent's barcode "PRD-4E5CD76B", so running the lenient rule first resolved
 * every variant scan to the bare parent product instead of the scanned size.
 */
export function resolveScan<T extends Coded & { metadata?: any; id?: any; productType?: string | null }>(products: T[], rawCode: string): { product: T; variantKey?: string } | undefined {
  const code = norm(rawCode);
  if (!code) return undefined;
  const exact = products.find(p => norm(p.barcode) === code || norm(p.sku) === code || norm(p.cartonBarcode) === code);
  if (exact) return { product: exact };
  const variant = matchVariantByCode(products, rawCode) || deriveVariantFromCode(products as any[], rawCode) || matchLegacyPlaceholder(products as any[], rawCode);
  if (variant) return variant as { product: T; variantKey: string };
  const lenient = matchProductByCode(products, rawCode);
  return lenient ? { product: lenient } : undefined;
}
