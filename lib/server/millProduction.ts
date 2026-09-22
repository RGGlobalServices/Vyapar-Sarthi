import { ApiError } from '@/lib/server/http';

/**
 * Pure helpers for the production workflow: weight-unit conversion and the mass balance.
 * Nothing here touches the database.
 */

export const OUTPUT_TYPES = ['finished_good', 'by_product', 'rejection'] as const;
export type OutputType = (typeof OUTPUT_TYPES)[number];

// kg per one unit. A production run is weighed, so only weight units are accepted — a "bag" or "piece" has no weight
// without a pack size, and guessing one would silently mis-state stock.
const KG_PER_UNIT: Record<string, number> = {
  kg: 1, kgs: 1, kilogram: 1, kilograms: 1,
  g: 0.001, gm: 0.001, gram: 0.001, grams: 0.001,
  quintal: 100, qtl: 100, quintals: 100,
  ton: 1000, tons: 1000, tonne: 1000, tonnes: 1000, mt: 1000,
};

export const BALANCE_TOLERANCE_KG = 0.005;

export const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function kgPerUnit(unit: string | null | undefined): number | null {
  const f = KG_PER_UNIT[String(unit ?? 'kg').trim().toLowerCase()];
  return f === undefined ? null : f;
}

export function toKg(quantity: number, unit: string | null | undefined): number {
  const f = kgPerUnit(unit);
  if (f === null) {
    throw new ApiError(400, `Unit "${unit}" cannot be used in a production run — enter output weights in kg, g, quintal or ton.`, 'UNIT_NOT_WEIGHT');
  }
  return round3(quantity * f);
}

/** The quantity to credit to a product's stock, expressed in that product's own base unit. */
export function kgToProductUnit(kg: number, productBaseUnit: string | null | undefined, productName: string): number {
  const f = kgPerUnit(productBaseUnit);
  if (f === null) {
    throw new ApiError(400, `"${productName}" is stocked in "${productBaseUnit}", which is not a weight unit, so a production output cannot be added to it. Use a product stocked in kg / quintal / ton.`, 'PRODUCT_UNIT_NOT_WEIGHT');
  }
  return round3(kg / f);
}

export type BalanceResult = { ok: boolean; inputKg: number; outputsKg: number; lossKg: number; differenceKg: number };

/** input = Σ outputs + loss, within a 5 g tolerance. `differenceKg` = input − (outputs + loss): positive = unexplained, negative = outputs exceed input. */
export function checkBalance(inputKg: number, outputsKg: number, lossKg: number): BalanceResult {
  const diff = round3(inputKg - outputsKg - lossKg);
  return { ok: Math.abs(diff) <= BALANCE_TOLERANCE_KG, inputKg: round3(inputKg), outputsKg: round3(outputsKg), lossKg: round3(lossKg), differenceKg: diff };
}

export type ParsedOutput = {
  productId: string | null;
  name: string;
  outputType: OutputType;
  quantity: number;
  unit: string;
  quantityKg: number;
  outputLotNumber: string | null;
  notes: string | null;
};

/** Validates the client's output rows (shape only — product ownership and stock are checked against the DB by the caller). */
export function parseOutputs(raw: any): ParsedOutput[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ApiError(400, 'Add at least one output before finalizing the batch.', 'OUTPUTS_REQUIRED');
  }
  if (raw.length > 50) throw new ApiError(400, 'Too many output rows (max 50).', 'TOO_MANY_OUTPUTS');
  return raw.map((o: any, i: number) => {
    const row = `Output ${i + 1}`;
    const outputType = String(o?.outputType ?? '').trim() as OutputType;
    if (!OUTPUT_TYPES.includes(outputType)) {
      throw new ApiError(400, `${row}: output type must be one of ${OUTPUT_TYPES.join(', ')}.`, 'INVALID_OUTPUT_TYPE');
    }
    const quantity = Number(o?.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1e9) {
      throw new ApiError(400, `${row}: quantity must be a positive number.`, 'INVALID_OUTPUT_QUANTITY');
    }
    const unit = String(o?.unit ?? 'kg').trim() || 'kg';
    const productId = o?.productId ? String(o.productId) : null;
    if (outputType === 'finished_good' && !productId) {
      throw new ApiError(400, `${row}: a finished good must be linked to a product — pick one, or create it in Product Master first.`, 'PRODUCT_REQUIRED');
    }
    const name = String(o?.name ?? '').trim().slice(0, 120);
    if (!name && !productId) throw new ApiError(400, `${row}: enter a name or pick a product.`, 'OUTPUT_NAME_REQUIRED');
    return {
      productId,
      name,
      outputType,
      quantity,
      unit,
      quantityKg: toKg(quantity, unit),
      outputLotNumber: o?.outputLotNumber ? String(o.outputLotNumber).trim().slice(0, 60) || null : null,
      notes: o?.notes ? String(o.notes).trim().slice(0, 250) || null : null,
    };
  });
}

export function parseLossKg(raw: any): number {
  if (raw === undefined || raw === null || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new ApiError(400, 'Loss must be zero or a positive number of kg.', 'INVALID_LOSS');
  return round3(n);
}

/** Where a raw material lot came from, derived from what is already stored: a linked weighbridge slip, or the purchase note, else manual. */
export function lotSource(lot: { notes?: string | null; weighbridgeEntries?: { slipNumber: string }[] | null }): { source: 'weighbridge' | 'purchase' | 'manual'; sourceRef: string | null } {
  const wb = lot.weighbridgeEntries?.[0]?.slipNumber;
  if (wb) return { source: 'weighbridge', sourceRef: wb };
  const pm = /Purchase Invoice\s+(\S+)/i.exec(lot.notes || '');
  return pm ? { source: 'purchase', sourceRef: pm[1] } : { source: 'manual', sourceRef: null };
}

export type StageExtra = { name: string; kg: number };

/** User-defined extra results of a stage (e.g. "Tukada" 120 kg). Names are the mill's own; kg must be positive. */
export function parseStageExtras(raw: any): StageExtra[] {
  if (raw === null || raw === undefined || raw === '') return [];
  if (!Array.isArray(raw)) throw new ApiError(400, 'extras must be a list of { name, kg }', 'INVALID_EXTRAS');
  if (raw.length > 12) throw new ApiError(400, 'At most 12 extra columns per stage.', 'INVALID_EXTRAS');
  const seen = new Set<string>();
  return raw.map((x: any, i: number) => {
    const name = String(x?.name ?? '').trim().slice(0, 40);
    const kg = Number(x?.kg);
    if (!name) throw new ApiError(400, `Extra column ${i + 1} needs a name.`, 'INVALID_EXTRAS');
    if (seen.has(name.toLowerCase())) throw new ApiError(400, `"${name}" is added twice.`, 'INVALID_EXTRAS');
    seen.add(name.toLowerCase());
    if (!Number.isFinite(kg) || kg <= 0 || kg > 1e9) throw new ApiError(400, `"${name}" must be a positive number of kg.`, 'INVALID_EXTRAS');
    return { name, kg: round3(kg) };
  });
}
