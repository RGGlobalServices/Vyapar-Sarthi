// Shared "Brand × ML size" matrix builder for liquor shops — one row per
// brand, one column per pack size actually present in the shop's data
// (never a hardcoded 90/180/.../1000 list, since real shops don't stock
// every size). Two source shapes feed into the same matrix:
//   - Udyog-tier: one Product per brand, sizes live in Product.variants[]
//     (color = ML, size = bottle type — see wholesale-import/execute's
//     resolveRowVariant for the same convention).
//   - Dukan/Vyapar-tier: no variants array: each pack size is its own flat
//     Product, e.g. "Real Wine 500ml" and "Real Wine 250ml" as two rows —
//     the ML has to be parsed back out of the product name.
export interface LiquorMatrixInputRow {
  id: string | number;
  name: string;
  stock: number;
  price: number | null;
  variants?: Array<{ color?: string | null; size?: string | null; stock?: number | null; sellingPrice?: number | null }> | null;
}

export interface LiquorMatrixCell {
  stock: number;
  price: number | null;
  bottleType?: string | null;
  productId: string | number;
  // For a variant-array product, which entry in variants[] this cell came
  // from — lets the caller route a click straight to that row.
  variantIndex?: number;
  // The exact "color / size" key /api/v1/stock/adjust expects for
  // variantDeltas — built from the variant's own RAW color/size (not the
  // normalized "650 ML" column label), so a delta lands on the right row.
  variantKey?: string;
}

export interface LiquorMatrixBrandRow {
  brand: string;
  cells: Record<string, LiquorMatrixCell>;
  total: number;
  // The underlying product(s) this brand maps to — one for variant-array
  // shops (all cells share it), many for flat-product shops (one per cell).
  productIds: Array<string | number>;
}

export interface LiquorMatrix {
  columns: string[]; // "180 ML", "330 ML", ... sorted ascending by volume
  rows: LiquorMatrixBrandRow[];
}

// Always shown as columns (the Add-Brand form needs *something* to offer
// inputs for even on a brand-new shop with no data yet) — merged with
// whatever other sizes actually turn up in real data, never replacing them.
export const DEFAULT_LIQUOR_COLUMNS = ['180 ML', '330 ML', '500 ML', '650 ML'];

export function extractMlToken(name: string | null | undefined): string | null {
  if (!name) return null;
  const ml = name.match(/(\d+(?:\.\d+)?)\s*ml\b/i);
  if (ml) return `${ml[1]} ML`;
  const l = name.match(/(\d+(?:\.\d+)?)\s*l\b/i);
  if (l) return `${(parseFloat(l[1]) * 1000).toString()} ML`;
  return null;
}

function stripMlToken(name: string): string {
  return name.replace(/\(?\s*\d+(?:\.\d+)?\s*m?l\)?/i, '').replace(/\s{2,}/g, ' ').trim();
}

export function buildLiquorMatrix(rows: LiquorMatrixInputRow[]): LiquorMatrix {
  const brandMap = new Map<string, LiquorMatrixBrandRow>();
  const columnSet = new Set<string>();

  for (const row of rows) {
    const variantRows = Array.isArray(row.variants) ? row.variants : [];
    const mlVariants = variantRows.filter(v => extractMlToken(v.color || '') || /^\d+(\.\d+)?\s*ml$/i.test((v.color || '').trim()));

    if (mlVariants.length > 0) {
      // Udyog-tier: one row per Product, one cell per ML variant.
      const brand = brandMap.get(row.name) || { brand: row.name, cells: {}, total: 0, productIds: [row.id] };
      variantRows.forEach((v, idx) => {
        const col = extractMlToken(v.color || '') || (v.color ? `${v.color.trim().toUpperCase()}` : null);
        if (!col) return;
        columnSet.add(col);
        const stock = Number(v.stock) || 0;
        const variantKey = v.color ? `${v.color} / ${v.size || ''}` : (v.size || '');
        brand.cells[col] = { stock, price: v.sellingPrice ?? null, bottleType: v.size ?? null, productId: row.id, variantIndex: idx, variantKey };
        brand.total += stock;
      });
      brandMap.set(row.name, brand);
      continue;
    }

    // Flat-product tier: parse the ML out of the name itself.
    const col = extractMlToken(row.name);
    if (!col) continue; // not a sized item (snacks, cigarettes, etc.) — excluded from the matrix
    const brandName = stripMlToken(row.name) || row.name;
    columnSet.add(col);
    const brand = brandMap.get(brandName) || { brand: brandName, cells: {}, total: 0, productIds: [] };
    const stock = Number(row.stock) || 0;
    brand.cells[col] = { stock, price: row.price ?? null, productId: row.id };
    brand.total += stock;
    brand.productIds.push(row.id);
    brandMap.set(brandName, brand);
  }

  for (const c of DEFAULT_LIQUOR_COLUMNS) columnSet.add(c);
  const columns = [...columnSet].sort((a, b) => parseFloat(a) - parseFloat(b));
  const brandRows = [...brandMap.values()].sort((a, b) => a.brand.localeCompare(b.brand));
  return { columns, rows: brandRows };
}

// ─── Cart-side matrix: Brand × ML, scoped to only the brands that have at
// least one line in the bill — but for THOSE brands, every real size the
// catalogue carries is shown (not just the one size that got scanned), so
// the shopkeeper sees "this brand also comes in 375ml/750ml, X left" and can
// add a sibling size straight from the bill instead of searching again.
// Quantity billed and remaining stock are tracked separately per cell.
export interface LiquorCartInputLine {
  id: string | number;
  name: string;
  variant?: string | null; // "color / size" key for a variant-array line, e.g. "650ml / Bottle"
  quantity: number;
  price: number;
}

export interface LiquorCartCell {
  qty: number; // billed quantity — 0 if this size is carried but not yet added
  stock: number; // remaining stock for this size (NOT reduced by qty already in cart)
  price: number | null;
  productId: string | number;
  variantIndex?: number;
  variantKey?: string; // present for a variant-array (Udyog-tier) line
}

export interface LiquorCartRow {
  brand: string;
  cells: Record<string, LiquorCartCell>;
  total: number; // sum of qty * price across this brand's sizes
}

export interface LiquorCartMatrixResult {
  columns: string[];
  rows: LiquorCartRow[];
}

function cellKey(productId: string | number, variantKey?: string | null) {
  return `${productId}:${variantKey || ''}`;
}

export function buildLiquorCartMatrix(catalogRows: LiquorMatrixInputRow[], lines: LiquorCartInputLine[]): LiquorCartMatrixResult {
  const catalog = buildLiquorMatrix(catalogRows);

  // Which brands are "touched" (>=1 line in the cart) and how much of each
  // exact size is billed — keyed the same way buildLiquorMatrix cells are,
  // so a variant-tier line's "color / size" key lines up with its cell.
  const touchedBrands = new Set<string>();
  const qtyByKey = new Map<string, number>();
  for (const line of lines) {
    const brandName = line.variant ? line.name : (stripMlToken(line.name) || line.name);
    touchedBrands.add(brandName);
    const key = cellKey(line.id, line.variant);
    qtyByKey.set(key, (qtyByKey.get(key) || 0) + line.quantity);
  }

  const rows: LiquorCartRow[] = [];
  for (const catalogRow of catalog.rows) {
    if (!touchedBrands.has(catalogRow.brand)) continue;
    const cells: Record<string, LiquorCartCell> = {};
    let total = 0;
    for (const [col, cell] of Object.entries(catalogRow.cells)) {
      const qty = qtyByKey.get(cellKey(cell.productId, cell.variantKey)) || 0;
      cells[col] = { qty, stock: cell.stock, price: cell.price, productId: cell.productId, variantIndex: cell.variantIndex, variantKey: cell.variantKey };
      total += qty * (cell.price || 0);
    }
    rows.push({ brand: catalogRow.brand, cells, total });
  }

  const columns = catalog.columns.filter(col => rows.some(r => r.cells[col]));
  rows.sort((a, b) => a.brand.localeCompare(b.brand));
  return { columns, rows };
}
