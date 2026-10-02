/**
 * Mill (Bada Udyog) purchase bills — the extra things a grain-merchant bill and its motor challan carry besides the goods:
 * vehicle, driver, truck owner, freight (total / advance / balance), broker, bags, the weight in quintals …
 *
 * Pure helpers (no imports) shared by the import analyzer (server), the review form (client) and the tests. Everything here only
 * CLEANS what was read from the bill; nothing is invented: a missing value stays empty.
 */

export type MillBill = {
  supplierMobile: string;
  supplierGstin: string;
  supplierAddress: string;
  buyerName: string;
  broker: string;
  vehicleNumber: string;
  driverName: string;
  driverMobile: string;
  truckOwnerName: string;
  truckOwnerMobile: string;
  transportCompany: string;
  freightTotal: number | null;
  freightAdvance: number | null;
  freightBalance: number | null;
  hamali: number | null;
  totalBags: number | null;
  sellerBank: { bankName: string; branch: string; ifsc: string; accountNo: string };
};

export const EMPTY_MILL_BILL: MillBill = {
  supplierMobile: '', supplierGstin: '', supplierAddress: '', buyerName: '', broker: '',
  vehicleNumber: '', driverName: '', driverMobile: '', truckOwnerName: '', truckOwnerMobile: '', transportCompany: '',
  freightTotal: null, freightAdvance: null, freightBalance: null, hamali: null, totalBags: null,
  sellerBank: { bankName: '', branch: '', ifsc: '', accountNo: '' },
};

const DEVANAGARI_DIGITS = '०१२३४५६७८९';
/** Handwritten Hindi/Marathi digits -> 0-9. */
export function westernDigits(s: string): string {
  return String(s ?? '').replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
}

const str = (v: any, max = 120) => westernDigits(String(v ?? '')).replace(/\s+/g, ' ').trim().slice(0, max);

/** "₹ 4,12,050/-" -> 412050 ; anything unreadable -> null. */
export function parseMoney(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  // handwritten amounts end in "=00" / "=-" (no paise): that tail is not part of the number
  const noTail = westernDigits(String(v)).replace(/=\s*(\d{1,2}|-+)?\s*$/, '');
  const cleaned = noTail.replace(/[₹,\s]|rs\.?|\/-|=|\/\//gi, '');
  const m = cleaned.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** The 10-digit Indian mobile inside whatever was written ("98265 14988", "+91-9826514988"), or '' when there is no clean 10 digits. */
export function cleanMobile(v: any): string {
  const digits = westernDigits(String(v ?? '')).replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return '';
}

/** "mh40cm4784" / "MH 40  CM-4784" -> "MH 40 CM 4784" (Indian registration format when it fits, else tidy upper-case). */
export function cleanVehicleNumber(v: any): string {
  const raw = westernDigits(String(v ?? '')).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!raw) return '';
  const m = raw.match(/^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]} ${m[4]}` : raw;
}

export function cleanGstin(v: any): string {
  const g = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z\d][A-Z\d]$/.test(g) ? g : '';
}

/** Whatever the model returned for "millBill" -> a clean, fully-typed MillBill. Unknown / unreadable values stay empty. */
export function normalizeMillBill(raw: any): MillBill {
  const r = raw && typeof raw === 'object' ? raw : {};
  const bank = r.sellerBank && typeof r.sellerBank === 'object' ? r.sellerBank : {};
  const out: MillBill = {
    supplierMobile: cleanMobile(r.supplierMobile),
    supplierGstin: cleanGstin(r.supplierGstin),
    supplierAddress: str(r.supplierAddress, 200),
    buyerName: str(r.buyerName),
    broker: str(r.broker, 80),
    vehicleNumber: cleanVehicleNumber(r.vehicleNumber),
    driverName: str(r.driverName, 80),
    driverMobile: cleanMobile(r.driverMobile),
    truckOwnerName: str(r.truckOwnerName, 80),
    truckOwnerMobile: cleanMobile(r.truckOwnerMobile),
    transportCompany: str(r.transportCompany, 80),
    freightTotal: parseMoney(r.freightTotal),
    freightAdvance: parseMoney(r.freightAdvance),
    freightBalance: parseMoney(r.freightBalance),
    hamali: parseMoney(r.hamali),
    totalBags: (() => { const n = parseMoney(r.totalBags); return n !== null && n >= 0 ? Math.round(n) : null; })(),
    sellerBank: {
      bankName: str(bank.bankName, 80), branch: str(bank.branch, 80),
      ifsc: str(bank.ifsc, 20).toUpperCase().replace(/\s/g, ''), accountNo: str(bank.accountNo, 30).replace(/\s/g, ''),
    },
  };
  return fillFreight(out);
}

/** Freight is total = advance + balance: fill whichever one is missing from the other two. Never overwrites a value that was read. */
export function fillFreight<T extends { freightTotal: number | null; freightAdvance: number | null; freightBalance: number | null }>(b: T): T {
  const t = b.freightTotal, a = b.freightAdvance, bal = b.freightBalance;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  if (t !== null && a !== null && bal === null) return { ...b, freightBalance: r2(Math.max(0, t - a)) };
  if (t !== null && bal !== null && a === null) return { ...b, freightAdvance: r2(Math.max(0, t - bal)) };
  if (a !== null && bal !== null && t === null) return { ...b, freightTotal: r2(a + bal) };
  return b;
}

/** True when the three freight figures contradict each other (total != advance + balance) — the form flags it for the user. */
export function freightMismatch(b: { freightTotal: number | null; freightAdvance: number | null; freightBalance: number | null }): boolean {
  if (b.freightTotal === null || b.freightAdvance === null || b.freightBalance === null) return false;
  return Math.abs(b.freightTotal - (b.freightAdvance + b.freightBalance)) > 0.5;
}

/** Merge the "millBill" objects of several pages / calls: the first non-empty value of each field wins. */
export function mergeMillBills(list: MillBill[]): MillBill {
  const out: MillBill = JSON.parse(JSON.stringify(EMPTY_MILL_BILL));
  for (const b of list) {
    for (const k of Object.keys(EMPTY_MILL_BILL) as Array<keyof MillBill>) {
      if (k === 'sellerBank') {
        for (const bk of Object.keys(out.sellerBank) as Array<keyof MillBill['sellerBank']>) if (!out.sellerBank[bk] && b.sellerBank[bk]) out.sellerBank[bk] = b.sellerBank[bk];
      } else if ((out[k] === '' || out[k] === null) && b[k] !== '' && b[k] !== null) {
        (out as any)[k] = b[k];
      }
    }
  }
  return fillFreight(out);
}

export type BillWeightLine = {
  quantity?: any; unitCost?: any; amount?: any;
  printedWeight?: any; printedWeightUnit?: any; printedRate?: any; bags?: any;
};

const UNIT_KG: Record<string, number> = { kg: 1, kgs: 1, quintal: 100, qtl: 100, q: 100, ton: 1000, tonne: 1000, mt: 1000 };

/**
 * Grain bills print the weight in QUINTALS with the rate per quintal ("123.00 q x 3350 = 4,12,050"). The system works in kg, so the line becomes
 * 12,300 kg at Rs 33.50 per kg. The model is asked to do this conversion; this makes it certain: from what was PRINTED (weight, unit, rate) it
 * works out kg and Rs/kg, and uses them only when they reproduce the printed amount (within 2%) — otherwise the line is left exactly as read.
 */
export function reconcileBillLine(line: BillWeightLine): { quantityKg: number; ratePerKg: number; unit: string } | null {
  const w = parseMoney(line.printedWeight);
  const rate = parseMoney(line.printedRate);
  const amount = parseMoney(line.amount);
  const unit = String(line.printedWeightUnit ?? '').trim().toLowerCase();
  const f = UNIT_KG[unit];
  if (!w || !rate || !amount || !f) return null;
  const kgQty = Math.round(w * f * 1000) / 1000;
  const perKg = rate / f;
  if (Math.abs(kgQty * perKg - amount) / amount > 0.02) return null;
  return { quantityKg: kgQty, ratePerKg: Math.round(perKg * 10000) / 10000, unit: unit };
}
