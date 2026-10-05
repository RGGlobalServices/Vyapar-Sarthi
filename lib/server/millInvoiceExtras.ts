import { readDispatch, type Dispatch } from '@/lib/server/dispatchDetails';

/**
 * What a Bada Udyog invoice prints besides the stored bill figures: the dispatch block (transport, vehicle, station, E-Way bill, GR/RR),
 * the customer's state and shipping address (kept with the party), and the broker named on the bill. Read-only; every piece is optional.
 */
export type MillInvoiceExtras = { dispatch: Dispatch | null; customerState: string | null; customerShippingAddress: string | null; customerPan: string | null; customerFssai: string | null; brokerName: string | null };

export async function loadMillInvoiceExtras(db: any, shopId: string, sale: { id: string; customerId?: string | null; invoice_number?: string | null }): Promise<MillInvoiceExtras> {
  const out: MillInvoiceExtras = { dispatch: null, customerState: null, customerShippingAddress: null, customerPan: null, customerFssai: null, brokerName: null };
  try { out.dispatch = await readDispatch(db, sale.id); } catch { /* optional */ }
  try {
    if (sale.customerId) {
      const r: any[] = await db.$queryRawUnsafe(`SELECT documents->>'state' AS state, documents->>'shippingAddress' AS ship, pan, fssai FROM customers WHERE id = $1::uuid AND shop_id = $2::uuid`, sale.customerId, shopId);
      out.customerState = r[0]?.state || null;
      out.customerShippingAddress = r[0]?.ship || null;
      out.customerPan = r[0]?.pan || null;
      out.customerFssai = r[0]?.fssai || null;
    }
  } catch { /* optional */ }
  try {
    if (sale.invoice_number) {
      const r: any[] = await db.$queryRawUnsafe(
        `SELECT c.name FROM commission_entries e JOIN customers c ON c.id = e.broker_id
          WHERE e.shop_id = $1::uuid AND e.bill_number = $2 AND e.note LIKE '[Customer broker]%' ORDER BY e.created_at DESC LIMIT 1`, shopId, sale.invoice_number);
      out.brokerName = r[0]?.name || null;
    }
  } catch { /* optional */ }
  return out;
}
