// Same case/space-insensitive "Colour / Size" comparison as lib/variants.ts keysMatch (kept local so this
// module stays dependency-free and unit-testable with plain node).
const norm = (k: string | null | undefined) =>
  String(k ?? '').split(' / ').map((p) => p.trim().replace(/\s+/g, ' ').toLowerCase()).join(' / ');
const keysMatch = (a: string | null | undefined, b: string | null | undefined) => norm(a) === norm(b);

/**
 * Lot / batch allocation shared by the billing server and the billing screens.
 * Old lot first (FIFO); a line pinned to one lot draws ONLY from that lot, because every bill line has a
 * single price and the shopkeeper chose that lot's price on purpose.
 */

export type Lot = {
  id: string;
  batchNumber?: string | null;
  quantity: number;
  costPrice?: number | null;
  sellingPrice?: number | null;
  expiryDate?: Date | string | null;
  purchaseDate?: Date | string | null;
  createdAt?: Date | string | null;
  /** "Colour / Size" the lot was bought for; null/empty = usable for any variant of the product. */
  variantKey?: string | null;
};

const ts = (v: Date | string | null | undefined): number => {
  if (!v) return 0;
  const n = new Date(v).getTime();
  return Number.isFinite(n) ? n : 0;
};

/** Lots that may serve a sale line of `variantKey`, oldest first (purchase date, then creation time). */
export function orderLots<T extends Lot>(lots: T[], variantKey?: string | null): T[] {
  return lots
    .filter((l) => !variantKey || !l.variantKey || keysMatch(l.variantKey, variantKey))
    .sort((a, b) => (ts(a.purchaseDate) || ts(a.createdAt)) - (ts(b.purchaseDate) || ts(b.createdAt)) || ts(a.createdAt) - ts(b.createdAt));
}

export type LotDraw = { batchId: string; quantity: number };

export type Allocation = {
  draws: LotDraw[];
  /** quantity nobody could supply from a lot (no lots at all, or lots ran out) */
  shortfall: number;
  /** a pinned lot could not cover the whole quantity */
  pinnedShort: boolean;
};

/**
 * Takes `wanted` units from `lots`. `remaining` (batchId -> qty left) is mutated so several bill lines of
 * one request share the same running totals.
 *  - pinnedId set: strictly that lot (pinnedShort/shortfall report what it could not cover).
 *  - otherwise: FIFO over the ordered lots.
 */
export function allocateFromLots(
  lots: Lot[],
  remaining: Map<string, number>,
  wanted: number,
  opts: { pinnedId?: string | null; variantKey?: string | null } = {},
): Allocation {
  const draws: LotDraw[] = [];
  let left = Math.max(0, Number(wanted) || 0);
  const pool = orderLots([...lots], opts.variantKey);
  const use = opts.pinnedId ? pool.filter((l) => l.id === opts.pinnedId) : pool;
  for (const lot of use) {
    if (left <= 0) break;
    const avail = remaining.get(lot.id) ?? lot.quantity ?? 0;
    if (avail <= 0) continue;
    const take = Math.min(avail, left);
    remaining.set(lot.id, avail - take);
    draws.push({ batchId: lot.id, quantity: take });
    left -= take;
  }
  return { draws, shortfall: left, pinnedShort: !!opts.pinnedId && left > 0 };
}

/** Text for a lot in lists ("Lot A31"), never "Lot 1" by position — that changes as lots sell out. */
export function lotLabel(lot: Pick<Lot, 'batchNumber' | 'id'>): string {
  const n = String(lot.batchNumber ?? '').trim();
  return n ? `Lot ${n}` : `Lot #${lot.id.slice(0, 4).toUpperCase()}`;
}

/**
 * Splits `qty` (e.g. a returned quantity) over the lots a sale line drew from, in proportion to each draw.
 * The last draw takes the rounding remainder so the parts always add up to `qty`.
 */
export function splitAcrossDraws(draws: Array<{ batchId: string; quantity: number }>, qty: number): Array<{ batchId: string; quantity: number }> {
  const total = draws.reduce((s, d) => s + (Number(d.quantity) || 0), 0);
  if (!draws.length || total <= 0 || qty <= 0) return [];
  let left = qty;
  return draws.map((d, i) => {
    const share = i === draws.length - 1 ? left : Math.min(left, Math.round(((Number(d.quantity) || 0) * qty / total) * 1e4) / 1e4);
    left -= share;
    return { batchId: d.batchId, quantity: share };
  }).filter((d) => d.quantity > 0);
}
