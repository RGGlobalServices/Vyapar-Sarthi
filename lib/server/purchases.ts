import type { Prisma, PrismaClient } from '@prisma/client';

export class PurchaseReversalBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PurchaseReversalBlockedError';
  }
}

export type ReversedInvoice = Prisma.PurchaseInvoiceGetPayload<{ include: { purchaseItems: true } }>;

/**
 * Undoes the CRITICAL, must-be-atomic effects of a purchase invoice: product
 * + godown stock, the stock movement rows, and the supplier balance/cashbook
 * entries it created. Must run inside an active `tx` — throws
 * PurchaseReversalBlockedError (caller should map to 409) if reversing would
 * push any product's stock negative, meaning some of that purchased stock
 * has already been sold/moved elsewhere.
 *
 * `reverseStock` (default true) lets a caller skip the stock/godown side
 * entirely — used by DELETE when the shopkeeper explicitly says "delete this
 * purchase record but leave my stock count as it is" (e.g. a duplicate/wrong
 * entry whose stock has already been mixed in and partly sold, where full
 * reversal would otherwise throw PurchaseReversalBlockedError and leave the
 * bad invoice stuck forever). The supplier balance/cashbook side is still
 * always reversed — it's a bookkeeping correction independent of physical
 * stock and never blocked by a negative-stock check.
 *
 * Deliberately does NOT touch SupplierTransaction/Batch here — see
 * cleanupPurchaseLedgerAndBatches. Keeping this function to only the
 * financially/inventory-critical steps keeps the interactive transaction
 * short; the full reverse-then-reapply chain (this file + the PATCH route's
 * own re-create step) was previously long enough to occasionally outlast the
 * transaction against the remote DB.
 */
export async function reversePurchaseInvoiceEffects(
  tx: Prisma.TransactionClient,
  shopId: string,
  invoiceId: string,
  options: { reverseStock?: boolean } = {}
): Promise<ReversedInvoice> {
  const { reverseStock = true } = options;
  const invoice = await tx.purchaseInvoice.findFirst({
    where: { id: invoiceId, shopId },
    include: { purchaseItems: true },
  });
  if (!invoice) throw new Error('Purchase invoice not found');

  const movements = await tx.stockMovement.findMany({
    where: { shopId, referenceId: invoiceId, type: 'purchase' },
  });

  if (reverseStock) {
    // Guard: block if any product has since sold/moved below what this
    // invoice added — reversing would take current stock negative.
    const qtyByProduct = new Map<string, number>();
    for (const m of movements) {
      qtyByProduct.set(m.productId, (qtyByProduct.get(m.productId) || 0) + m.quantity);
    }
    // Fallback for imported purchases (or any invoice created before the
    // StockMovement audit trail was added): no movement rows exist, so
    // derive what to reverse directly from the purchase items themselves.
    // Without this, editing or deleting an imported purchase silently
    // skips the stock reversal even though the re-apply step still runs,
    // leaving the removed items' quantities stuck in the product totals.
    if (qtyByProduct.size === 0 && invoice.purchaseItems.length > 0) {
      for (const item of invoice.purchaseItems) {
        qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) || 0) + item.quantity);
      }
    }
    const productIds = [...qtyByProduct.keys()];
    if (productIds.length) {
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, currentStock: true },
      });
      const short = products.filter(p => (p.currentStock ?? 0) < (qtyByProduct.get(p.id) || 0));
      if (short.length) {
        throw new PurchaseReversalBlockedError(
          `Cannot undo this purchase — stock already sold/moved for: ${short.map(p => p.name).join(', ')}. Adjust stock manually first.`
        );
      }
    }

    // Reverse warehouse inventory (clamped at 0 defensively — a transfer out
    // of this specific warehouse after the purchase, while the product total
    // above still checks out, could otherwise take one godown negative).
    // Looked up concurrently, then applied concurrently, to pipeline the
    // round-trips instead of paying full network latency per item in series.
    const relevant = movements.filter(m => m.warehouseId);
    const godownRows = await Promise.all(relevant.map(m =>
      tx.godownProduct.findUnique({
        where: { godownId_productId: { godownId: m.warehouseId as string, productId: m.productId } },
      })
    ));
    await Promise.all(relevant.map((m, i) => {
      const gp = godownRows[i];
      if (!gp) return null;
      return tx.godownProduct.update({ where: { id: gp.id }, data: { quantity: Math.max(0, gp.quantity - m.quantity) } });
    }).filter(Boolean));

    await Promise.all([
      ...[...qtyByProduct.entries()].map(([productId, qty]) =>
        tx.product.update({ where: { id: productId }, data: { currentStock: { decrement: qty } } })
      ),
      movements.length ? tx.stockMovement.deleteMany({ where: { id: { in: movements.map(m => m.id) } } }) : null,
    ].filter(Boolean));
  }

  const cashEntries = await tx.cashBook.findMany({
    where: { shopId, referenceId: invoiceId, type: 'purchase' },
  });
  const amountPaid = cashEntries.reduce((sum, c) => sum + c.amount, 0);
  const balanceDelta = (invoice.totalCost || 0) - amountPaid;

  await Promise.all([
    balanceDelta !== 0
      ? tx.supplier.update({ where: { id: invoice.supplierId }, data: { balance: { decrement: balanceDelta } } })
      : null,
    cashEntries.length ? tx.cashBook.deleteMany({ where: { id: { in: cashEntries.map(c => c.id) } } }) : null,
  ].filter(Boolean));

  return invoice;
}

/**
 * Best-effort companion to reversePurchaseInvoiceEffects — deletes the
 * matching SupplierTransaction ledger entry and Batch rows, but only when
 * the match is unambiguous (note+amount for the transaction; product+qty+
 * the exact same-transaction createdAt for batches — Batch shares the
 * invoice's createdAt because both were written in the same original DB
 * transaction). Leaves rows in place rather than guessing wrong.
 *
 * `deleteBatches` (default true) should be passed false when the invoice was
 * deleted with reverseStock:false — the Batch row still represents real
 * physical stock sitting on the shelf (or partially sold via FIFO), so it
 * must survive the invoice being deleted; only the ledger note is cleaned up.
 *
 * Deliberately NOT run inside the caller's transaction: neither model has a
 * hard FK back to the invoice, so getting this wrong or slow doesn't
 * corrupt anything load-bearing — it's fine (and much cheaper) to run these
 * lookups after the critical transaction has already committed. Call it
 * best-effort (wrap in try/catch) — a failure here shouldn't fail the
 * edit/delete the user actually asked for.
 */
export async function cleanupPurchaseLedgerAndBatches(
  prisma: PrismaClient,
  shopId: string,
  invoice: ReversedInvoice,
  options: { deleteBatches?: boolean } = {}
) {
  const { deleteBatches = true } = options;
  const expectedNote = `Purchase Invoice: ${invoice.invoiceNumber || invoice.id}`;
  const [txns, batchMatches] = await Promise.all([
    prisma.supplierTransaction.findMany({
      where: { supplierId: invoice.supplierId, type: 'purchase', note: expectedNote, amount: invoice.totalCost || 0 },
    }),
    deleteBatches ? Promise.all(invoice.purchaseItems.map(item =>
      prisma.batch.findMany({
        where: {
          shopId,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          createdAt: invoice.createdAt,
        },
      })
    )) : Promise.resolve([] as Awaited<ReturnType<typeof prisma.batch.findMany>>[]),
  ]);

  await Promise.all([
    txns.length === 1 ? prisma.supplierTransaction.delete({ where: { id: txns[0].id } }) : null,
    ...batchMatches.map(batches => (batches.length === 1 ? prisma.batch.delete({ where: { id: batches[0].id } }) : null)),
  ].filter(Boolean));
}
