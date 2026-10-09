/**
 * Broker name on a purchase bill (purchase_invoices.broker_name, supabase/25_purchase_broker.sql). Not in
 * prisma/schema.prisma — same approach as dispatchDetails.ts: raw queries that run only once the column exists.
 */
let ready = false;
let checkedAt = 0;
export async function purchaseBrokerColumn(db: any): Promise<boolean> {
  if (ready) return true;
  if (Date.now() - checkedAt < 60_000) return false;
  checkedAt = Date.now();
  try {
    const r = await db.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'purchase_invoices' AND column_name = 'broker_name'`;
    ready = (r[0]?.n ?? 0) > 0;
  } catch { ready = false; }
  return ready;
}

export async function setPurchaseBroker(db: any, purchaseInvoiceId: string, name: string) {
  const clean = String(name ?? '').trim().slice(0, 80);
  if (!clean || !(await purchaseBrokerColumn(db))) return;
  await db.$executeRawUnsafe(`UPDATE purchase_invoices SET broker_name = $1 WHERE id = $2::uuid`, clean, purchaseInvoiceId);
}

export type BrokerPurchase = { id: string; invoiceNumber: string | null; date: string; amount: number; supplierName: string | null };

/** Every purchase this broker was tagged on, regardless of whether a commission was ever logged for it — mirrors getBrokerBills (sales) in dispatchDetails.ts. */
export async function getBrokerPurchases(db: any, shopId: string, brokerName: string): Promise<BrokerPurchase[]> {
  if (!brokerName.trim() || !(await purchaseBrokerColumn(db))) return [];
  const rows: Array<{ id: string; invoice_number: string | null; date: Date | null; created_at: Date; total_cost: number | null; supplier_name: string | null }> =
    await db.$queryRawUnsafe(
      `SELECT p.id, p.invoice_number, p.date, p.created_at, p.total_cost, s.name AS supplier_name
       FROM purchase_invoices p LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.shop_id = $1::uuid AND p.broker_name ILIKE $2
       ORDER BY p.created_at DESC LIMIT 200`,
      shopId, brokerName.trim(),
    );
  return rows.map((r) => ({ id: r.id, invoiceNumber: r.invoice_number, date: (r.date ?? r.created_at).toISOString(), amount: Number(r.total_cost) || 0, supplierName: r.supplier_name }));
}
