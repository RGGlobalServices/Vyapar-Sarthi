// Generic stock display + status helpers for the Food-Mill Product Master.
// Every calculation here reads only the product's OWN configured fields
// (baseUnit, packSize/packUnit, minStock, reorderLevel, maxStock) — nothing
// is branched on mill type/name, so the exact same logic works for a Rice
// Mill, Flour Mill, Dal Mill, Millet Mill, Oil Mill, or any future mill.

export type MillStockProduct = {
  currentStock?: number | null;
  baseUnit?: string | null;
  packSize?: number | null;
  packUnit?: string | null;
};

// Units that represent a real physical weight — used to decide whether a
// Quintal/Ton equivalent is worth showing alongside the bag/weight numbers.
// A pack unit of 'Piece'/'Litre'/etc. never gets a fabricated Qtl/Ton line.
const WEIGHT_UNITS = new Set(['kg', 'kilogram', 'kilograms', 'gram', 'grams', 'gm', 'g']);

function toKg(qty: number, unit: string): number | null {
  const u = unit.trim().toLowerCase();
  if (['kg', 'kilogram', 'kilograms'].includes(u)) return qty;
  if (['gram', 'grams', 'gm', 'g'].includes(u)) return qty / 1000;
  return null;
}

const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

export type MillStockDisplay = {
  /** Always present — the single most useful line, e.g. "3,000 Kg" or "100 Bags". */
  primary: string;
  /** Optional second line, e.g. total weight when primary is a bag count. */
  secondary?: string;
  /** Optional third line — Quintal/Ton equivalent, only for real weight units. */
  tertiary?: string;
};

/**
 * Renders a product's current stock the way a mill actually thinks about
 * it — bags AND weight together when the product is packed (packSize +
 * packUnit set), otherwise just the base unit as-is. Never invents a bag
 * count for a product that isn't sold by the bag, and never drops the
 * original bag quantity in favour of only showing the derived weight.
 */
export function formatMillStock(product: MillStockProduct): MillStockDisplay {
  const qty = Number(product.currentStock) || 0;
  const baseUnit = (product.baseUnit || '').trim() || 'Unit';

  if (product.packSize && product.packUnit) {
    // currentStock is the bag/pack COUNT; packSize is "how much per bag".
    const totalInPackUnit = qty * product.packSize;
    const display: MillStockDisplay = {
      primary: `${fmt(qty)} ${qty === 1 ? 'Bag' : 'Bags'}`,
      secondary: `${fmt(totalInPackUnit)} ${product.packUnit}`,
    };
    const kg = toKg(totalInPackUnit, product.packUnit);
    if (kg != null) {
      if (kg >= 100) display.tertiary = `${fmt(kg / 100)} Qtl`;
      if (kg >= 1000) display.tertiary = `${fmt(kg / 100)} Qtl · ${fmt(kg / 1000)} Ton`;
    }
    return display;
  }

  // No pack size configured — the base unit itself is what's tracked
  // (Kg-only grain, Litres of oil, Pieces of packaging, …).
  const unitLc = baseUnit.toLowerCase();
  if (WEIGHT_UNITS.has(unitLc)) {
    const kg = unitLc.startsWith('g') && !unitLc.startsWith('kg') ? qty / 1000 : qty;
    const display: MillStockDisplay = { primary: `${fmt(kg)} Kg` };
    if (kg >= 100) display.secondary = `${fmt(kg / 100)} Qtl`;
    if (kg >= 1000) display.secondary = `${fmt(kg / 100)} Qtl · ${fmt(kg / 1000)} Ton`;
    return display;
  }

  return { primary: `${fmt(qty)} ${baseUnit}` };
}

export type StockStatus = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'OVER_STOCK' | 'INACTIVE' | 'IN_STOCK';

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  OUT_OF_STOCK: 'Out of Stock',
  LOW_STOCK: 'Low Stock',
  OVER_STOCK: 'Over Stock',
  INACTIVE: 'Inactive',
  IN_STOCK: 'In Stock',
};

/**
 * Derives stock status purely from the product's own configured thresholds
 * — reorderLevel (if set) takes precedence over the older minStock field so
 * a shop that's started using the more specific "reorder at" concept gets
 * it honoured, while every product that never sets it keeps exactly the
 * same behavior as before (falls back to minStock, same as today).
 */
export function computeStockStatus(product: {
  currentStock?: number | null;
  minStock?: number | null;
  reorderLevel?: number | null;
  maxStock?: number | null;
  archived?: boolean | null;
}): StockStatus {
  if (product.archived) return 'INACTIVE';
  const stock = Number(product.currentStock) || 0;
  if (stock <= 0) return 'OUT_OF_STOCK';
  const threshold = product.reorderLevel ?? product.minStock ?? 0;
  if (threshold > 0 && stock <= threshold) return 'LOW_STOCK';
  if (product.maxStock != null && product.maxStock > 0 && stock > product.maxStock) return 'OVER_STOCK';
  return 'IN_STOCK';
}
