import { ApiError } from '@/lib/server/http';

/**
 * Bill-level charges on a purchase bill beyond the goods — hamali, freight, loading, unloading, packing … (`PurchaseInvoice.charges`,
 * `[{ name, amount }]`). They are part of what the supplier is owed, so they are already included in `totalCost`; they are NOT spread
 * into the items' rates and never touch Products or Stock.
 */
export type PurchaseCharge = { name: string; amount: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Strict validation of charges coming from a client. */
export function parseCharges(raw: any): PurchaseCharge[] {
  if (raw === undefined || raw === null || raw === '') return [];
  if (!Array.isArray(raw)) throw new ApiError(400, 'charges must be a list of { name, amount }', 'INVALID_CHARGES');
  if (raw.length > 12) throw new ApiError(400, 'At most 12 charges per bill.', 'INVALID_CHARGES');
  const out: PurchaseCharge[] = [];
  raw.forEach((c: any, i: number) => {
    const name = String(c?.name ?? '').trim().slice(0, 40);
    const amount = Number(String(c?.amount ?? '').replace(/[₹,\s]/g, ''));
    // A completely empty row is just an unused line in the editor.
    if (!name && (c?.amount === '' || c?.amount === undefined || c?.amount === null)) return;
    if (!name) throw new ApiError(400, `Charge ${i + 1} needs a name.`, 'INVALID_CHARGES');
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e8) throw new ApiError(400, `Charge "${name}" must be a positive amount.`, 'INVALID_CHARGES');
    out.push({ name, amount: r2(amount) });
  });
  return out;
}

/** Lenient read of what is stored on an invoice. */
export function readCharges(stored: any): PurchaseCharge[] {
  if (!Array.isArray(stored)) return [];
  return stored
    .map((c: any) => ({ name: String(c?.name ?? '').slice(0, 40), amount: Number(c?.amount) }))
    .filter((c) => c.name && Number.isFinite(c.amount) && c.amount > 0)
    .map((c) => ({ name: c.name, amount: r2(c.amount) }));
}

export const chargesTotal = (charges: PurchaseCharge[]) => r2(charges.reduce((a, c) => a + c.amount, 0));

// Words that name a bill-level charge, in English and the way Indian mill / mandi bills write them.
const CHARGE_WORDS = /\b(hamali|hammali|freight|transport(?:ation)?|cartage|carriage|loading|unloading|labou?r|mathadi|packing|packaging|weigh(?:ment|bridge|ing)|tulai|commission|dalali|brokerage|mandi\s*fee|market\s*fee|other\s*charges?|misc(?:ellaneous)?|handling|insurance)\b/i;
const NOT_A_CHARGE = /\b(gst|igst|cgst|sgst|tax|discount|round\s*off|rounding|total|sub\s*total|grand|balance|advance|paid|hsn|qty|quantity|rate)\b/i;

/**
 * Finds charge lines in the extracted text of a bill ("Hamali 500", "Freight: ₹1,200.00", "Loading charges .... 300").
 * A line counts only if it names a charge, has at most two numbers, and no tax/total words — item rows have many numbers, so they
 * never qualify. The amount is the last number on the line.
 */
export function scanChargesFromText(text: string): PurchaseCharge[] {
  const out: PurchaseCharge[] = [];
  const seen = new Set<string>();
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
    if (!line || line.length > 90) continue;
    const word = CHARGE_WORDS.exec(line);
    if (!word || NOT_A_CHARGE.test(line)) continue;
    const nums = line.match(/\d[\d,]*(?:\.\d+)?/g) || [];
    if (nums.length === 0 || nums.length > 2) continue;
    const amount = Number(nums[nums.length - 1].replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e8) continue;
    const name = line.replace(/[₹:=.\-–]*\s*\d[\d,]*(?:\.\d+)?\s*(?:\/-|rs\.?|only)?\s*$/i, '').replace(/[\s:.\-–]+$/, '').slice(0, 40) || word[0];
    const key = `${name.toLowerCase()}|${amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, amount: r2(amount) });
  }
  return out.slice(0, 12);
}

/** Merge the model's charges with text-scan charges: same name+amount collapses, otherwise both are kept for the user to review. */
export function mergeCharges(...lists: PurchaseCharge[][]): PurchaseCharge[] {
  const out: PurchaseCharge[] = [];
  const seen = new Set<string>();
  for (const list of lists) for (const c of list) {
    const k = `${c.name.toLowerCase().replace(/\s*charges?$/i, '')}|${c.amount}`;
    if (!seen.has(k)) { seen.add(k); out.push(c); }
  }
  return out.slice(0, 12);
}
