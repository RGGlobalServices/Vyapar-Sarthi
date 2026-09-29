import { ApiError } from '@/lib/server/http';
import { round2, toPaise } from '@/lib/server/moneyValidation';

// Server-side return/refund maths. The client never supplies a price or an
// amount: the refund is derived from what the bill actually charged.
//
// Model (no schema change): SaleItem.pricePerUnit is the gross selling price
// and Sale.totalAmount is the discounted total, decremented by exactly the
// refund of every settled return. So the ORIGINAL discounted total is
//   Sale.totalAmount + Σ(settled prior returns' amounts)
// and the effective (discounted) unit value = pricePerUnit × original / gross.
// GST stays inside the price — no tax is recomputed here.

export interface PriorReturn {
  saleItemId?: string | null;
  productId?: string | null;
  itemName?: string | null;
  quantity: number;
  amount: number;
  settled: boolean;
}

export interface PlannedLine {
  saleItem: any;
  qty: number;
  refundAmount: number;
  refundProfit: number;
}

/** Parses MaterialReturn rows (linked to the bill through their JSON note). */
export function parsePriorReturns(rows: Array<{ productId: string | null; itemName: string | null; quantity: number; amount: number | null; note: string | null }>, saleId: string): PriorReturn[] {
  const out: PriorReturn[] = [];
  for (const r of rows) {
    let n: any = {};
    try { if (r.note) n = JSON.parse(r.note); } catch {}
    // `note contains saleId` is a substring match; require the real billId.
    if (n?.billId !== saleId) continue;
    out.push({
      saleItemId: n?.saleItemId || null,
      productId: r.productId,
      itemName: r.itemName,
      quantity: Number(r.quantity) || 0,
      amount: Number(r.amount) || 0,
      settled: n?.settled === true,
    });
  }
  return out;
}

export function planReturn(opts: {
  saleItems: any[];
  saleTotal: number;
  priorReturns: PriorReturn[];
  requests: Array<{ item_id: string; quantity: unknown }>;
}): { lines: PlannedLine[]; totalRefund: number } {
  const { saleItems, saleTotal, priorReturns, requests } = opts;

  // 1. Validate + aggregate by item_id (two entries for the same line must
  //    be checked against the line's limit TOGETHER, not one at a time).
  const requested = new Map<string, number>();
  for (const r of requests) {
    if (!r || typeof r.item_id !== 'string' || !r.item_id) throw new ApiError(400, 'Each return item needs an item_id');
    const q = typeof r.quantity === 'number' ? r.quantity : (typeof r.quantity === 'string' && r.quantity.trim() !== '' ? Number(r.quantity) : NaN);
    if (!Number.isFinite(q)) throw new ApiError(400, 'Return quantity must be a valid number');
    if (q < 0) throw new ApiError(400, 'Return quantity cannot be negative');
    if (q === 0) continue;
    requested.set(r.item_id, (requested.get(r.item_id) || 0) + q);
  }
  if (!requested.size) throw new ApiError(400, 'No valid return quantities provided');

  // 2. Already-returned per line.
  const already = new Map<string, number>();
  for (const p of priorReturns) {
    const key = p.saleItemId || p.productId || p.itemName;
    if (key) already.set(key, (already.get(key) || 0) + p.quantity);
  }
  const alreadyFor = (si: any) => already.get(si.id) || 0;

  // 3. Effective discount factor.
  const gross = saleItems.reduce((s, si) => s + (Number(si.quantity) || 0) * (Number(si.pricePerUnit) || 0), 0);
  const originalTotal = saleTotal + priorReturns.filter(p => p.settled).reduce((s, p) => s + p.amount, 0);
  // For regular bills: discount makes totalAmount ≤ gross → factor ≤ 1.
  // For mill (mill_v2) bills: GST + charges make totalAmount > gross → factor > 1
  // (customer paid more than the base prices, so the refund per unit must also
  // include the proportional GST+charges portion). No Math.min(1, ...) cap here.
  const factor = gross > 0 ? Math.max(0, originalTotal / gross) : 0;

  // 4. Per-line quantity check + refund.
  const lines: PlannedLine[] = [];
  for (const [itemId, qty] of requested) {
    const si = saleItems.find((x) => x.id === itemId);
    if (!si) throw new ApiError(400, `Sale item ${itemId} not on this bill`);
    const returnable = (Number(si.quantity) || 0) - alreadyFor(si);
    if (qty > returnable + 1e-9) {
      throw new ApiError(400, `Only ${Math.max(0, returnable)} of "${si.product?.name || si.itemName || 'this item'}" can still be returned`);
    }
    const unit = (Number(si.pricePerUnit) || 0) * factor;
    lines.push({
      saleItem: si,
      qty,
      refundAmount: round2(qty * unit),
      refundProfit: qty * (Number(si.marginPerUnit) || 0),
    });
  }

  // 5. If this request finishes the whole bill, refund exactly what is left
  //    (absorbs per-line rounding) — total refunds can never exceed the bill.
  const finishing = saleItems.every((si) => {
    const req = requested.get(si.id) || 0;
    return (Number(si.quantity) || 0) - alreadyFor(si) - req <= 1e-9;
  });
  let total = round2(lines.reduce((s, l) => s + l.refundAmount, 0));
  const cap = round2(Math.max(0, saleTotal));
  if (finishing && lines.length) {
    const diff = round2(cap - total);
    lines[lines.length - 1].refundAmount = round2(lines[lines.length - 1].refundAmount + diff);
    total = cap;
  } else if (toPaise(total) > toPaise(cap)) {
    throw new ApiError(400, 'Refund would exceed the remaining bill amount');
  }
  return { lines, totalRefund: total };
}

/**
 * Udhar first, cash second. The udhar portion is capped by what the bill still
 * has outstanding AND by what the customer currently owes, so a balance can
 * never go negative; the rest is paid back.
 */
export function splitRefund(totalRefund: number, billOutstanding: number, customerDue: number | null): { udharCleared: number; cashRefunded: number } {
  const cap = customerDue === null ? billOutstanding : Math.min(billOutstanding, Math.max(0, customerDue));
  const udharCleared = round2(Math.min(totalRefund, Math.max(0, cap)));
  return { udharCleared, cashRefunded: round2(totalRefund - udharCleared) };
}
