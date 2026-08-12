import type { Prisma, PrismaClient } from '@prisma/client';
import { isWholesaleTierPackage } from '@/lib/config/packageConfig';

export type ReversedSale = Prisma.SaleGetPayload<{ include: { items: true } }>;

/**
 * Returns the quantity already returned per SaleItem (falling back to
 * productId, then item name) for a given sale — extracted from the inline
 * logic that used to live only in the bill-detail GET route so both that
 * route and the delete/reversal path compute this identically. MaterialReturn
 * has no real FK back to Sale, only a JSON `note` carrying `saleItemId`.
 */
export async function getReturnedQuantitiesForSale(
  client: Prisma.TransactionClient,
  shopId: string,
  saleId: string
): Promise<Record<string, number>> {
  const priorReturns = await client.materialReturn.findMany({
    where: { shopId, note: { contains: saleId } },
  });

  const returnedQuantities: Record<string, number> = {};
  for (const r of priorReturns) {
    let noteData: any = {};
    try {
      if (r.note) noteData = JSON.parse(r.note);
    } catch {}
    const key = noteData?.saleItemId || r.productId || r.itemName;
    if (key) returnedQuantities[key] = (returnedQuantities[key] || 0) + r.quantity;
  }
  return returnedQuantities;
}

/**
 * Undoes the CRITICAL, must-be-atomic effects of a sale: restores product
 * stock (net of anything already returned against this sale — a naive full
 * restore would double-count returned units), deletes the sale's Udhar
 * ledger entry + reverses customer.totalDue, deletes matching CashBook
 * entries, then deletes the SaleItem rows (required first — SaleItem.sale is
 * `onDelete: NoAction`) and the Sale row itself. Must run inside an active
 * `tx`. Mirrors reversePurchaseInvoiceEffects in lib/server/purchases.ts:
 * kept to only the financially/inventory-critical steps so the interactive
 * transaction stays short against the pooled remote DB — see
 * cleanupSaleBatches for the best-effort batch/StockMovement companion.
 */
export async function reverseSaleEffects(
  tx: Prisma.TransactionClient,
  shopId: string,
  saleId: string
): Promise<{ sale: ReversedSale; netQuantitiesByProduct: Map<string, number> }> {
  const sale = await tx.sale.findFirst({
    where: { id: saleId, shopId },
    include: { items: true },
  });
  if (!sale) throw new Error('Sale not found');

  const returnedQuantities = await getReturnedQuantitiesForSale(tx, shopId, saleId);

  // Net each item's quantity against what's already been returned, then
  // aggregate per product — a sale can carry multiple line items for the
  // same product/variant (e.g. two different sizes).
  const netQuantitiesByProduct = new Map<string, number>();
  const netByItem = new Map<string, number>(); // saleItemId -> net qty, for variant JSON reversal below
  for (const item of sale.items) {
    if (!item.productId) continue; // manual line items have no product to restore
    const returned = returnedQuantities[item.id] || returnedQuantities[item.productId] || 0;
    const net = Math.max(0, (item.quantity || 0) - returned);
    netByItem.set(item.id, net);
    netQuantitiesByProduct.set(item.productId, (netQuantitiesByProduct.get(item.productId) || 0) + net);
  }

  const productIds = [...netQuantitiesByProduct.keys()];
  if (productIds.length) {
    const products = await tx.product.findMany({ where: { id: { in: productIds } } });
    const productById = new Map(products.map(p => [p.id, p]));

    for (const productId of productIds) {
      const product = productById.get(productId);
      if (!product) continue; // product was itself deleted since — nothing to restore stock on

      // Reverse the same size_variants/variants JSON mutation billing/route.ts
      // applies at creation, item-by-item, using each item's own net (not
      // aggregate) quantity — symmetric with how creation decrements it.
      let newSizeVariants = product.size_variants;
      const newVariants = Array.isArray(product.variants) ? (product.variants as any[]).map(v => ({ ...v })) : null;
      let variantsChanged = false;

      for (const item of sale.items) {
        if (item.productId !== productId || !item.variant) continue;
        const net = netByItem.get(item.id) || 0;
        if (net <= 0) continue;
        if (newSizeVariants) {
          try {
            const parsed = typeof newSizeVariants === 'string' ? JSON.parse(newSizeVariants) : newSizeVariants;
            if (parsed[item.variant] !== undefined) {
              parsed[item.variant] = (parsed[item.variant] || 0) + net;
              newSizeVariants = JSON.stringify(parsed);
            }
          } catch {}
        }
        if (newVariants) {
          const row = newVariants.find((v: any) => (v.color ? `${v.color} / ${v.size || ''}` : (v.size || '')) === item.variant);
          if (row) {
            row.stock = (Number(row.stock) || 0) + net;
            variantsChanged = true;
          }
        }
      }

      await tx.product.update({
        where: { id: productId },
        data: {
          ...(product.currentStock !== null ? { currentStock: { increment: netQuantitiesByProduct.get(productId) } } : {}),
          size_variants: newSizeVariants,
          ...(variantsChanged ? { variants: newVariants as any } : {}),
        },
      });
    }
  }

  if (sale.customerId) {
    const [txns, customer] = await Promise.all([
      tx.customer_transactions.findMany({
        where: { customer_id: sale.customerId, type: 'udhar', bill_number: sale.invoice_number },
      }),
      tx.customer.findUnique({ where: { id: sale.customerId } }),
    ]);
    if (txns.length && customer) {
      const totalUdhar = txns.reduce((sum, t) => sum + (t.amount || 0), 0);
      await Promise.all([
        tx.customer_transactions.deleteMany({ where: { id: { in: txns.map(t => t.id) } } }),
        tx.customer.update({
          where: { id: sale.customerId },
          data: { totalDue: Math.max(0, (customer.totalDue || 0) - totalUdhar) },
        }),
      ]);
    }
  }

  await tx.cashBook.deleteMany({ where: { shopId, referenceId: saleId, type: 'sale' } });

  await tx.saleItem.deleteMany({ where: { saleId } });
  await tx.sale.delete({ where: { id: saleId } });

  return { sale, netQuantitiesByProduct };
}

/**
 * Best-effort companion to reverseSaleEffects — deletes the aggregate
 * StockMovement row the sale created, and (wholesale tier only) restores the
 * decremented quantity to each product's most-recently-created batch. Sale
 * creation only ever records ONE aggregate movement per product (not one per
 * batch actually touched), so exact per-batch attribution isn't recoverable —
 * this follows the exact same "restore to latest batch" convention
 * billing/returns/route.ts already uses for the identical problem, rather
 * than inventing a new approximation.
 *
 * Deliberately NOT run inside the caller's transaction — StockMovement/Batch
 * have no hard FK back to the sale, so getting this wrong or slow doesn't
 * corrupt anything load-bearing. Wrap in try/catch at the call site; a
 * failure here shouldn't fail the delete the user actually asked for.
 */
export async function cleanupSaleBatches(
  prisma: PrismaClient,
  shopId: string,
  saleId: string,
  packageType: string | null | undefined,
  netQuantitiesByProduct: Map<string, number>
) {
  await prisma.stockMovement.deleteMany({ where: { shopId, referenceId: saleId, type: 'sale' } });

  if (!isWholesaleTierPackage(packageType)) return;

  for (const [productId, qty] of netQuantitiesByProduct.entries()) {
    if (qty <= 0) continue;
    const latestBatch = await prisma.batch.findFirst({
      where: { productId, shopId },
      orderBy: { createdAt: 'desc' },
    });
    if (latestBatch) {
      await prisma.batch.update({ where: { id: latestBatch.id }, data: { quantity: { increment: qty } } });
    }
  }
}
