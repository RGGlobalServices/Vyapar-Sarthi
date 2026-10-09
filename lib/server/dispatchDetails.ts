import prisma from '@/lib/server/prisma';

/**
 * Dispatch details of a Bada Udyog invoice (sales.dispatch_details jsonb, supabase/20_sale_dispatch_details.sql). Not in
 * prisma/schema.prisma — same approach as billTags / jobWorkLink: raw queries that run only once the column exists.
 */
export type Dispatch = {
  transport: string; vehicleNo: string; station: string; eWayBill: string; grRrNo: string; reverseCharge: 'Y' | 'N'; salesman: string; broker: string;
  /** Customer details as printed on THIS bill (editable at billing; the party record itself is not changed). */
  billName: string; billAddress: string; billGst: string; billState: string; shipAddress: string;
};
export const EMPTY_DISPATCH: Dispatch = { transport: '', vehicleNo: '', station: '', eWayBill: '', grRrNo: '', reverseCharge: 'N', salesman: '', broker: '', billName: '', billAddress: '', billGst: '', billState: '', shipAddress: '' };

let ready = false;
let checkedAt = 0;
export async function dispatchColumn(): Promise<boolean> {
  if (ready) return true;
  if (Date.now() - checkedAt < 60_000) return false;
  checkedAt = Date.now();
  try {
    const r = await prisma.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'sales' AND column_name = 'dispatch_details'`;
    ready = (r[0]?.n ?? 0) > 0;
  } catch { ready = false; }
  return ready;
}

const clean = (v: any, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Whatever the client sent -> a clean Dispatch (or null when nothing was filled in). */
export function parseDispatch(raw: any): Dispatch | null {
  if (!raw || typeof raw !== 'object') return null;
  const d: Dispatch = {
    transport: clean(raw.transport, 80), vehicleNo: clean(raw.vehicleNo, 30).toUpperCase(), station: clean(raw.station, 60),
    eWayBill: clean(raw.eWayBill, 30), grRrNo: clean(raw.grRrNo, 30), reverseCharge: raw.reverseCharge === 'Y' ? 'Y' : 'N', salesman: clean(raw.salesman, 60), broker: clean(raw.broker, 80),
    billName: clean(raw.billName, 120), billAddress: clean(raw.billAddress, 250), billGst: clean(raw.billGst, 15).toUpperCase(), billState: clean(raw.billState, 60), shipAddress: clean(raw.shipAddress, 250),
  };
  const any = d.transport || d.vehicleNo || d.station || d.eWayBill || d.grRrNo || d.salesman || d.broker || d.billName || d.billAddress || d.billGst || d.billState || d.shipAddress || d.reverseCharge === 'Y';
  return any ? d : null;
}

export async function setDispatch(db: any, saleId: string, d: Dispatch | null) {
  if (!d || !(await dispatchColumn())) return;
  await db.$executeRawUnsafe(`UPDATE sales SET dispatch_details = $1::jsonb WHERE id = $2::uuid`, JSON.stringify(d), saleId);
}

export async function readDispatch(db: any, saleId: string): Promise<Dispatch | null> {
  if (!(await dispatchColumn())) return null;
  const r: Array<{ d: any }> = await db.$queryRawUnsafe(`SELECT dispatch_details AS d FROM sales WHERE id = $1::uuid`, saleId);
  const d = r[0]?.d;
  return d && typeof d === 'object' ? { ...EMPTY_DISPATCH, ...d } : null;
}

export type BrokerBill = { id: string; invoiceNumber: string | null; date: string; amount: number; customerName: string | null };

/**
 * Every sale this broker was tagged on (`dispatch_details.broker`), regardless of whether a
 * commission was ever logged for it. A commission entry only exists once an amount is typed in —
 * but the broker's name on the bill is saved at checkout either way — so this is the only
 * reliable "which bills came through this broker" list: the owner shows it to the broker, who
 * then quotes the commission, rather than the shop having to already know it.
 */
export async function getBrokerBills(db: any, shopId: string, brokerName: string): Promise<BrokerBill[]> {
  if (!brokerName.trim() || !(await dispatchColumn())) return [];
  const rows: Array<{ id: string; invoice_number: string | null; created_at: Date; total_amount: number | null; customer_name: string | null }> =
    await db.$queryRawUnsafe(
      `SELECT s.id, s.invoice_number, s.created_at, s.total_amount, c.name AS customer_name
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.shop_id = $1::uuid AND s.dispatch_details->>'broker' ILIKE $2
       ORDER BY s.created_at DESC LIMIT 200`,
      shopId, brokerName.trim(),
    );
  return rows.map((r) => ({ id: r.id, invoiceNumber: r.invoice_number, date: r.created_at.toISOString(), amount: Number(r.total_amount) || 0, customerName: r.customer_name }));
}
