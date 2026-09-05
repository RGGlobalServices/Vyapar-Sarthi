import prisma from '@/lib/server/prisma';
import { ApiError } from '@/lib/server/http';
import { isWholesaleTierPackage } from '@/lib/config/packageConfig';

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
      // Restore is the exact mirror of DELETE (`reverseSaleEffects` in
      // lib/server/sales.ts): re-creates the Sale + its items, re-applies
      // stock decrement (currentStock + size_variants + Udyog variants[] +
      // wholesale batches), reposts Udhar to customer + ledger, and puts
      // the cash entry back in the drawer. Client requirement — "restore
      // kel tar tech tyach sales/profit/udhar releated ani stock kami
      // hone zal pahije" — needs restore to be truly symmetric with
      // delete, not a partial one that leaves stock stuck. The earlier
      // "skip stock — can't safely reverse" note was over-cautious; a
      // manual restore is by definition the shopkeeper saying "put this
      // exact bill's effect back", so stock going negative is a legitimate
      // audit signal ("you sold what you no longer had") not a bug to
      // silently avoid.
      const { items, ...saleFields } = data;
      const existing = await prisma.sale.findUnique({ where: { id: record.entityId } });
      if (existing) throw new ApiError(409, 'A sale with this ID already exists — it may have been restored already.');

      // Look up shop once for the wholesale-tier gate below (batch/movement)
      const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { packageType: true } });

      const created = await prisma.sale.create({
        data: {
          ...saleFields,
          items: { create: (items || []).map((it: any) => { const { saleId, ...rest } = it; return rest; }) },
        },
        include: { items: true },
      });

      // --- Stock decrement, symmetric with billing/route.ts creation path ---
      const itemsByProduct = new Map<string, typeof created.items>();
      for (const it of created.items) {
        if (!it.productId) continue;
        const arr = itemsByProduct.get(it.productId) || [];
        arr.push(it);
        itemsByProduct.set(it.productId, arr);
      }
      const productIds = [...itemsByProduct.keys()];
      if (productIds.length) {
        const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
        const productById = new Map(products.map(p => [p.id, p]));
        for (const [productId, productItems] of itemsByProduct.entries()) {
          const product = productById.get(productId);
          if (!product) { skipped.push(`Product no longer exists — stock not restored for one line.`); continue; }

          let totalQty = 0;
          let newSizeVariants = product.size_variants;
          const newVariants = Array.isArray(product.variants) ? (product.variants as any[]).map(v => ({ ...v })) : null;
          let variantsChanged = false;

          for (const item of productItems) {
            // Sale item quantity is nullable in Prisma (`Float?`). Coerce
            // once here so `next build`'s strict null check is satisfied
            // and downstream Math never sees `null - number = NaN`.
            const qty = Number(item.quantity) || 0;
            totalQty += qty;
            if (item.variant && newSizeVariants) {
              try {
                const parsed = typeof newSizeVariants === 'string' ? JSON.parse(newSizeVariants) : newSizeVariants;
                if (parsed[item.variant] !== undefined) {
                  parsed[item.variant] = Math.max(0, (Number(parsed[item.variant]) || 0) - qty);
                  newSizeVariants = JSON.stringify(parsed);
                }
              } catch {}
            }
            if (item.variant && newVariants) {
              const row = newVariants.find((v: any) => (v.color ? `${v.color} / ${v.size || ''}` : (v.size || '')) === item.variant);
              if (row) {
                row.stock = Math.max(0, (Number(row.stock) || 0) - qty);
                variantsChanged = true;
              }
            }
          }

          await prisma.product.update({
            where: { id: product.id },
            data: {
              ...(product.currentStock !== null ? { currentStock: { decrement: totalQty } } : {}),
              size_variants: newSizeVariants,
              ...(variantsChanged ? { variants: newVariants as any } : {}),
            },
          });

          // Wholesale batch + movement mirror (Udyog/Bada Udyog only) — same
          // FIFO the sale used originally: re-consume the oldest active batch(es).
          if (isWholesaleTierPackage(shop?.packageType)) {
            let remaining = totalQty;
            const batches = await prisma.batch.findMany({
              where: { productId, shopId, quantity: { gt: 0 } },
              orderBy: { createdAt: 'asc' },
            });
            for (const batch of batches) {
              if (remaining <= 0) break;
              const deduct = Math.min(batch.quantity, remaining);
              await prisma.batch.update({ where: { id: batch.id }, data: { quantity: { decrement: deduct } } });
              remaining -= deduct;
            }
            await prisma.stockMovement.create({
              data: { shopId, productId, type: 'sale', quantity: totalQty, referenceId: created.id },
            });
          }
        }
      }

      // --- Udhar + ledger row (same shape POST /billing writes) ---
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

      // --- Cash back in the drawer ---
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
      break;
    }

    case 'purchase_invoice': {
      // Mirror of DELETE /purchases/[id]: re-create the PurchaseInvoice + its
      // items, re-create the linked SupplierTransaction rows, and if the
      // original delete also reversed stock (`reverseStock: true` in the
      // snapshot) put that stock back on Products so the restore is
      // symmetric. If the delete kept stock as-is (`reverseStock: false`),
      // restore only re-creates the invoice and the supplier ledger — stock
      // stays untouched, matching the "only remove the invoice, keep stock"
      // branch of the delete confirmation modal.
      const { invoice, supplierTransactions, reverseStock } = data || {};
      if (!invoice) throw new ApiError(400, 'Purchase invoice snapshot is empty.');
      const existing = await prisma.purchaseInvoice.findUnique({ where: { id: record.entityId } });
      if (existing) throw new ApiError(409, 'A purchase invoice with this ID already exists — it may have been restored already.');

      const supplier = await prisma.supplier.findFirst({ where: { id: invoice.supplierId, shopId } });
      if (!supplier) {
        throw new ApiError(404, 'The supplier this purchase belonged to no longer exists — restore the supplier first.');
      }

      const { purchaseItems, ...invoiceFields } = invoice;
      await prisma.purchaseInvoice.create({ data: invoiceFields });
      for (const item of purchaseItems || []) {
        try { await prisma.purchaseItem.create({ data: item }); }
        catch { skipped.push(`purchase item on invoice ${invoice.invoiceNumber || invoice.id} (product may no longer exist)`); }
      }

      // Restore the supplier balance + payment-history rows the delete
      // reversed. Silently skip any transaction whose id already exists (e.g.
      // partial restore from a previous attempt) rather than aborting.
      const owed = Math.max(0, Number(invoice.totalCost || 0));
      if (owed > 0) {
        try {
          await prisma.supplier.update({
            where: { id: supplier.id },
            data: { balance: { increment: owed } },
          });
        } catch (e) { skipped.push('supplier balance not re-incremented'); }
      }
      for (const t of supplierTransactions || []) {
        try { await prisma.supplierTransaction.create({ data: t }); }
        catch { skipped.push(`supplier transaction ${t.id}`); }
      }

      // Re-add stock ONLY if the delete had reversed it — otherwise the
      // stock never left, so touching it here would double-count. Sums by
      // (productId, variantKey) so a purchase with multiple lines for the
      // same variant restores as one increment. Best-effort per product.
      if (reverseStock === true) {
        const forwardDeltasByProduct = new Map<string, { total: number; byVariant: Map<string, number> }>();
        for (const item of purchaseItems || []) {
          if (!item.productId) continue;
          const qty = Number(item.quantity) || 0;
          if (qty <= 0) continue;
          let bucket = forwardDeltasByProduct.get(item.productId);
          if (!bucket) { bucket = { total: 0, byVariant: new Map() }; forwardDeltasByProduct.set(item.productId, bucket); }
          bucket.total += qty;
          if (item.variantKey) {
            bucket.byVariant.set(item.variantKey, (bucket.byVariant.get(item.variantKey) || 0) + qty);
          }
        }
        for (const [productId, bucket] of forwardDeltasByProduct.entries()) {
          try {
            const product = await prisma.product.findFirst({ where: { id: productId, shopId } });
            if (!product) { skipped.push('Product no longer exists — stock not restored for one line.'); continue; }

            let newSizeVariants: any = product.size_variants;
            const newVariants = Array.isArray(product.variants) ? (product.variants as any[]).map((v) => ({ ...v })) : null;
            let variantsChanged = false;

            for (const [variantKey, qty] of bucket.byVariant.entries()) {
              if (newSizeVariants) {
                try {
                  const parsed = typeof newSizeVariants === 'string' ? JSON.parse(newSizeVariants) : newSizeVariants;
                  parsed[variantKey] = (Number(parsed[variantKey]) || 0) + qty;
                  newSizeVariants = JSON.stringify(parsed);
                } catch {}
              }
              if (newVariants) {
                const row = newVariants.find((v: any) => (v.color ? `${v.color} / ${v.size || ''}` : (v.size || '')) === variantKey);
                if (row) { row.stock = (Number(row.stock) || 0) + qty; variantsChanged = true; }
              }
            }

            await prisma.product.update({
              where: { id: product.id },
              data: {
                ...(product.currentStock !== null ? { currentStock: { increment: bucket.total } } : {}),
                size_variants: newSizeVariants,
                ...(variantsChanged ? { variants: newVariants as any } : {}),
              },
            });
          } catch (e) { skipped.push('Stock not restored for one product line.'); }
        }
      }
      break;
    }

    default:
      throw new ApiError(400, `Unknown entity type: ${record.entityType}`);
  }

  await prisma.deletedRecord.update({ where: { id: recordId }, data: { restoredAt: new Date() } });

  return { skipped };
}
