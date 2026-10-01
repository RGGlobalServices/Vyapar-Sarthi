/**
 * Pure helpers for the Quick Production Entry form — shared by the form (live balance bar, bags -> kg) and the tests. No imports,
 * so they run anywhere. The SERVER re-checks everything; these only make the form fast to fill.
 */

export const QUICK_SOURCES = ['raw_lot', 'job_work', 'wip', 'rejection'] as const;
export type QuickSource = (typeof QUICK_SOURCES)[number];

const r3 = (n: number) => Math.round(n * 1000) / 1000;

const KG_PER_UNIT: Record<string, number> = {
  kg: 1, kgs: 1, g: 0.001, gm: 0.001, quintal: 100, qtl: 100, ton: 1000, tons: 1000, tonne: 1000, mt: 1000,
};

/** kg for a weight entered in kg / g / quintal / ton; null for a non-weight unit. */
export function unitToKg(quantity: number, unit: string | null | undefined): number | null {
  const f = KG_PER_UNIT[String(unit ?? 'kg').trim().toLowerCase()];
  return f === undefined ? null : r3((Number(quantity) || 0) * f);
}

/** Bags / packs -> kg: 40 bags x 50 kg = 2000 kg. Returns 0 until both numbers are positive. */
export function packsToKg(packs: number | string, packKg: number | string): number {
  const p = Number(packs);
  const k = Number(packKg);
  if (!(p > 0) || !(k > 0)) return 0;
  return r3(p * k);
}

export type QuickBalance = {
  inputKg: number;
  outputsKg: number;
  lossKg: number;
  /** input - outputs - loss: > 0 = still unaccounted for, < 0 = outputs + loss exceed the input */
  remainingKg: number;
  balanced: boolean;
  state: 'empty' | 'balanced' | 'unaccounted' | 'over';
};

const TOLERANCE_KG = 0.005;

export function quickBalance(inputKg: number, outputsKg: number, lossKg: number): QuickBalance {
  const input = r3(Number(inputKg) || 0);
  const out = r3(Number(outputsKg) || 0);
  const loss = r3(Number(lossKg) || 0);
  const remaining = r3(input - out - loss);
  const balanced = input > 0 && Math.abs(remaining) <= TOLERANCE_KG;
  const state: QuickBalance['state'] = input <= 0 ? 'empty' : balanced ? 'balanced' : remaining > 0 ? 'unaccounted' : 'over';
  return { inputKg: input, outputsKg: out, lossKg: loss, remainingKg: remaining, balanced, state };
}

/** The "everything left over was waste" one-tap: the loss that makes the run balance (never negative). */
export function lossToBalance(inputKg: number, outputsKg: number): number {
  return Math.max(0, r3((Number(inputKg) || 0) - (Number(outputsKg) || 0)));
}

/** Yield % of the finished goods against the input (1 decimal), or null without an input. */
export function yieldPct(finishedKg: number, inputKg: number): number | null {
  if (!(inputKg > 0)) return null;
  return Math.round((finishedKg / inputKg) * 1000) / 10;
}
