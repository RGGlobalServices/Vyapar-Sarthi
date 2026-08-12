import prisma from '@/lib/server/prisma';
import { ApiError } from '@/lib/server/http';

/**
 * Restoring means re-creating each row from its own snapshot with its
 * original id, so anything that referenced it (an order, a bill line) that
 * itself survived points at a real row again. Rows whose snapshot references
 * something that's gone too are skipped individually and reported back,
 * rather than failing the whole restore. Shared by both the single-record
 * restore route and the bulk-restore route so the entityType switch only
 * lives in one place.
 */
export async function restoreDeletedRecord(shopId: string, recordId: string): Promise<{ skipped: string[] }> {
  const record = await prisma.deletedRecord.findFirst({ where: { id: recordId, shopId } });
  if (!record) throw new ApiError(404, 'Deleted record not found');
  if (record.restoredAt) throw new ApiError(400, 'This record was already restored');

  const data = record.data as any;
  const skipped: string[] = [];

  switch (record.entityType) {
    case 'product': {
      // A "deleted" product very often never actually left the table — if it
      // was referenced by a Sale/StockLog etc, DELETE /products/:id falls
      // back to archiving instead of a hard delete (see that route's P2003
      // catch), which is the common case for any product with real sales
      // history, not a rare edge case. Restoring an archived row must
      // un-archive it, not try to `create` a duplicate id (which always
      // 409s, since the row was never gone) — same reasoning as the
      // 'customer' case below un-prefixing instead of re-inserting.
      const existing = await prisma.product.findUnique({ where: { id: record.entityId } });
      if (existing) {
        if (!existing.archived) {
          throw new ApiError(409, 'A product with this ID already exists and is not archived — it may have been restored already.');
        }
        await prisma.product.update({ where: { id: record.entityId }, data: { archived: false } });
      } else {
        await prisma.product.create({ data });
      }
      break;
    }

    case 'staff': {
      const { staff, attendance, salaryPayments, advanceSalaries } = data;
      const existing = await prisma.staff.findUnique({ where: { id: record.entityId } });
      if (existing) throw new ApiError(409, 'A staff member with this ID already exists — it may have been restored already.');
      await prisma.staff.create({ data: staff });
      for (const a of attendance || []) {
        try { await prisma.attendance.create({ data: a }); } catch { skipped.push(`attendance ${a.date}`); }
      }
      for (const s of salaryPayments || []) {
        try { await prisma.salaryPayment.create({ data: s }); } catch { skipped.push(`salary payment ${s.id}`); }
      }
      for (const adv of advanceSalaries || []) {
        try { await prisma.advanceSalary.create({ data: adv }); } catch { skipped.push(`advance ${adv.id}`); }
      }
      break;
    }

    case 'supplier': {
      const { supplier, supplierTransactions, purchaseInvoices } = data;
      const existing = await prisma.supplier.findUnique({ where: { id: record.entityId } });
      if (existing) throw new ApiError(409, 'A supplier with this ID already exists — it may have been restored already.');
      await prisma.supplier.create({ data: supplier });
      for (const t of supplierTransactions || []) {
        try { await prisma.supplierTransaction.create({ data: t }); } catch { skipped.push(`transaction ${t.id}`); }
      }
      for (const inv of purchaseInvoices || []) {
        const { purchaseItems, ...invoiceFields } = inv;
        try {
          await prisma.purchaseInvoice.create({ data: invoiceFields });
        } catch {
          skipped.push(`purchase invoice ${inv.invoiceNumber || inv.id}`);
          continue;
        }
        for (const item of purchaseItems || []) {
          try { await prisma.purchaseItem.create({ data: item }); }
          catch { skipped.push(`purchase item on invoice ${inv.invoiceNumber || inv.id} (product may no longer exist)`); }
        }
      }
      break;
    }

    case 'customer': {
      // Customers are never actually destroyed — the row is still there,
      // just tagged `archived_<type>`. Restoring means stripping that prefix.
      const customer = await prisma.customer.findFirst({ where: { id: record.entityId, shopId } });
      if (!customer) throw new ApiError(404, 'The customer row no longer exists — it may have been hard-deleted through another path.');
      const restoredType = (customer.customerType || '').startsWith('archived_')
        ? customer.customerType!.slice('archived_'.length)
        : (customer.customerType || 'customer');
      await prisma.customer.update({ where: { id: record.entityId }, data: { customerType: restoredType } });
      break;
    }

    case 'customer_transaction': {
      const tx = data;
      const customer = await prisma.customer.findFirst({ where: { id: tx.customer_id, shopId } });
      if (!customer) throw new ApiError(404, 'The customer this transaction belonged to no longer exists.');
      const existing = await prisma.customer_transactions.findUnique({ where: { id: record.entityId } });
      if (existing) throw new ApiError(409, 'This transaction already exists — it may have been restored already.');
      await prisma.customer_transactions.create({ data: tx });
      await prisma.customer.update({
        where: { id: tx.customer_id },
        data: { totalDue: { [tx.type === 'udhar' ? 'increment' : 'decrement']: Number(tx.amount || 0) } },
      });
      break;
    }

    case 'sale': {
      // Recreates the Sale + its line items and replays the financial
      // ledger effects (Udhar entry + totalDue, cash entry) exactly as
      // POST /billing originally computed them — all unambiguous, derived
      // straight from the sale's own stored totals. Deliberately does NOT
      // attempt to re-decrement stock/variant JSON or restore
      // batches/StockMovement rows: unlike the ledger math, that would
      // require re-deriving how much of the ORIGINAL sale's stock is still
      // safe to remove given everything that's happened since (further
      // sales, adjustments, transfers) — the same class of judgment call
      // Purchase-reversal guards against going negative for, but with no
      // safe automatic answer here. Reported back so the shopkeeper knows
      // to true up stock manually instead of the restore silently
      // guessing wrong.
      const { items, ...saleFields } = data;
      const existing = await prisma.sale.findUnique({ where: { id: record.entityId } });
      if (existing) throw new ApiError(409, 'A sale with this ID already exists — it may have been restored already.');

      await prisma.sale.create({
        data: {
          ...saleFields,
          items: { create: (items || []).map((it: any) => { const { saleId, ...rest } = it; return rest; }) },
        },
      });

      const totalAmount = saleFields.totalAmount || 0;
      const amountPaid = saleFields.amountPaid || 0;
      const outstanding = Math.max(0, totalAmount - amountPaid);

      if (outstanding > 0 && saleFields.customerId) {
        const customer = await prisma.customer.findFirst({ where: { id: saleFields.customerId, shopId } });
        if (customer) {
          await prisma.customer.update({
            where: { id: saleFields.customerId },
            data: { totalDue: { increment: outstanding } },
          });
          await prisma.customer_transactions.create({
            data: {
              customer_id: saleFields.customerId,
              type: 'udhar',
              amount: outstanding,
              note: `Bill: ${saleFields.invoice_number}`,
              bill_number: saleFields.invoice_number,
            },
          });
        } else {
          skipped.push('The customer this sale was billed to no longer exists — Udhar ledger entry was not restored.');
        }
      }

      const paymentDetails = saleFields.paymentDetails || {};
      const cashAmount = saleFields.paymentType === 'Split' ? Number(paymentDetails?.cash || 0) : (saleFields.paymentType === 'Cash' ? amountPaid : 0);
      if (cashAmount > 0) {
        await prisma.cashBook.create({
          data: {
            shopId,
            type: 'sale',
            amount: cashAmount,
            referenceId: record.entityId,
            description: `Restored sale: ${saleFields.invoice_number}`,
          },
        });
      }

      skipped.push('Stock levels were not automatically restored for this sale — please verify and adjust stock manually for its items if needed.');
      break;
    }

    default:
      throw new ApiError(400, `Unknown entity type: ${record.entityType}`);
  }

  await prisma.deletedRecord.update({ where: { id: recordId }, data: { restoredAt: new Date() } });

  return { skipped };
}
