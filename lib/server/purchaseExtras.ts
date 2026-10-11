import { billTagColumns } from '@/lib/server/billTags';

/**
 * Hamali / Freight / Broker commission tied to a purchase bill — for a Bada Udyog (mill) purchase
 * these are deliberately NOT part of PurchaseInvoice.charges (they're the mill's own cost: labour
 * and transport, never added to what the supplier is owed — see purchase-extras/route.ts), so the
 * Purchase Details view can't read them off the invoice itself. They're stored as ordinary Expense /
 * FreightEntry / CommissionEntry rows tagged with this purchase (lib/server/billTags.ts), which is
 * also why the bill's displayed Goods Total → Bill Total gap can look unexplained without this: the
 * gap is the discount, but hamali/freight/broker commission are real costs of the same purchase that
 * just live in different ledgers.
 */
export type PurchaseExtras = {
  hamali: number;
  freight: number;
  brokerName: string | null;
  brokerCommission: number;
};

export async function getPurchaseExtras(db: any, shopId: string, purchaseInvoiceId: string): Promise<PurchaseExtras> {
  const empty: PurchaseExtras = { hamali: 0, freight: 0, brokerName: null, brokerCommission: 0 };
  if (!(await billTagColumns())) return empty;
  const [hamaliRows, freightRows, commissionRows] = await Promise.all([
    db.$queryRawUnsafe(
      `SELECT COALESCE(SUM(amount), 0)::float AS total FROM expenses WHERE shop_id = $1::uuid AND purchase_invoice_id = $2::uuid AND category = 'Hamali / Labour'`,
      shopId, purchaseInvoiceId,
    ),
    db.$queryRawUnsafe(
      `SELECT COALESCE(SUM(amount), 0)::float AS total FROM freight_entries WHERE shop_id = $1::uuid AND purchase_invoice_id = $2::uuid AND type = 'charge'`,
      shopId, purchaseInvoiceId,
    ),
    db.$queryRawUnsafe(
      `SELECT ce.amount, c.name FROM commission_entries ce JOIN customers c ON c.id = ce.broker_id
       WHERE ce.shop_id = $1::uuid AND ce.purchase_invoice_id = $2::uuid AND ce.type = 'charge' ORDER BY ce.created_at DESC LIMIT 1`,
      shopId, purchaseInvoiceId,
    ),
  ]);
  return {
    hamali: Number(hamaliRows?.[0]?.total) || 0,
    freight: Number(freightRows?.[0]?.total) || 0,
    brokerName: commissionRows?.[0]?.name || null,
    brokerCommission: Number(commissionRows?.[0]?.amount) || 0,
  };
}
