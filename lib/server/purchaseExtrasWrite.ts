import { billTagColumns, tagRows } from '@/lib/server/billTags';

/**
 * Create/update/remove the Hamali and Freight rows tied to a purchase bill (see purchaseExtras.ts for why
 * these live outside PurchaseInvoice.charges). Lets the Purchases "Edit" form fill in what the import
 * screen missed, without duplicating a row on every re-save: each is looked up by its existing
 * purchase_invoice_id tag and updated in place, created only if none exists yet, and removed if the
 * field is cleared back to 0. No-op entirely until the billTags migration columns exist.
 */
export async function upsertHamali(tx: any, shopId: string, purchaseInvoiceId: string, invoiceLabel: string, amount: number) {
  if (!(await billTagColumns())) return;
  const rows = await tx.$queryRawUnsafe(
    `SELECT id::text AS id FROM expenses WHERE shop_id = $1::uuid AND purchase_invoice_id = $2::uuid AND category = 'Hamali / Labour' LIMIT 1`,
    shopId, purchaseInvoiceId,
  );
  const existingId: string | null = rows?.[0]?.id || null;
  if (amount > 0) {
    if (existingId) {
      await tx.expense.update({ where: { id: existingId }, data: { amount } });
    } else {
      const created = await tx.expense.create({
        data: { shopId, category: 'Hamali / Labour', amount, paymentMode: 'Cash', description: `Hamali — Purchase bill ${invoiceLabel}`, date: new Date() },
      });
      await tagRows(tx, 'expenses', [created.id], { direction: 'purchase', purchaseInvoiceId });
    }
  } else if (existingId) {
    await tx.expense.delete({ where: { id: existingId } });
  }
}

export async function upsertFreight(tx: any, shopId: string, purchaseInvoiceId: string, invoiceLabel: string, amount: number, partyName?: string) {
  if (!(await billTagColumns())) return;
  const rows = await tx.$queryRawUnsafe(
    `SELECT id::text AS id FROM freight_entries WHERE shop_id = $1::uuid AND purchase_invoice_id = $2::uuid AND type = 'charge' LIMIT 1`,
    shopId, purchaseInvoiceId,
  );
  const existingId: string | null = rows?.[0]?.id || null;
  if (amount > 0) {
    if (existingId) {
      await tx.freightEntry.update({ where: { id: existingId }, data: { amount } });
    } else {
      const tName = (partyName || `Freight — ${invoiceLabel}`).trim().slice(0, 80);
      let transporter = await tx.customer.findFirst({ where: { shopId, customerType: 'transporter', name: { equals: tName, mode: 'insensitive' } } });
      if (!transporter) transporter = await tx.customer.create({ data: { shopId, name: tName, customerType: 'transporter' } });
      const created = await tx.freightEntry.create({
        data: { shopId, transporterId: transporter.id, type: 'charge', amount, note: `Freight — purchase bill ${invoiceLabel}` },
      });
      await tagRows(tx, 'freight_entries', [created.id], { direction: 'purchase', purchaseInvoiceId });
    }
  } else if (existingId) {
    await tx.freightEntry.delete({ where: { id: existingId } });
  }
}
