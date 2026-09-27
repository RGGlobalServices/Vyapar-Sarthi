import { NextResponse } from 'next/server';
import { requireShop } from '@/lib/server/auth';
import prisma from '@/lib/server/prisma';
import { randomUUID } from 'crypto';
import { applyVariantStockDeltas, type VariantStockDelta } from '@/lib/server/variantStock';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Goods sent back to a supplier from a specific purchase — a debit note.
 * Never mutates the original PurchaseInvoice/PurchaseItem rows (their cost/
 * mrp are locked in permanently, same as every other write path in this
 * module); this is a new, additive PurchaseReturn record. The caller (the
 * Purchase Details modal) computes "Net Payable" as totalCost minus the sum
 * of a purchase's returns.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const auth = await requireShop(req);
    const body = await req.json();
    const requested: Array<{ productId: string; variantKey?: string | null; name: string; quantity: number; rate: number }> =
      Array.isArray(body?.items) ? body.items : [];

    if (!requested.length) {
      return NextResponse.json({ error: 'No items to return.' }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      // 1. Lock the purchase invoice to serialize concurrent return requests
      const lockedInvoices = await tx.$queryRaw<Array<{ id: string; supplier_id: string; invoice_number: string | null }>>`
        SELECT id, supplier_id, invoice_number
        FROM purchase_invoices
        WHERE id = ${id}::uuid AND shop_id = ${auth.shop.id}::uuid
        FOR UPDATE
      `;
      if (!lockedInvoices.length) {
        throw new Error('Purchase invoice not found');
      }
      const invoice = lockedInvoices[0];

      const [purchaseItems, purchaseReturns] = await Promise.all([
        tx.purchaseItem.findMany({ where: { purchaseInvoiceId: id } }),
        tx.purchaseReturn.findMany({
          where: { purchaseInvoiceId: id, shopId: auth.shop.id },
          include: { items: true }
        }),
      ]);

      const rowKey = (productId: string, variantKey: string | null | undefined) => `${productId}::${variantKey || ''}`;

      const originalQtyByKey = new Map<string, number>();
      for (const item of purchaseItems) {
        const k = rowKey(item.productId, item.variantKey);
        originalQtyByKey.set(k, (originalQtyByKey.get(k) || 0) + item.quantity);
      }
      const alreadyReturnedByKey = new Map<string, number>();
      for (const ret of purchaseReturns) {
        for (const item of ret.items) {
          const k = rowKey(item.productId, item.variantKey);
          alreadyReturnedByKey.set(k, (alreadyReturnedByKey.get(k) || 0) + item.quantity);
        }
      }

      // Aggregate duplicate lines for the same product/variant BEFORE checking the
      // limit, so two entries of 10 + 10 cannot slip past a remaining quantity of 10.
      const qtyByProduct = new Map<string, number>();
      const requestedByKey = new Map<string, number>();
      for (const r of requested) {
        if (!r.productId || !(r.quantity > 0) || !Number.isFinite(Number(r.quantity))) {
          throw new Error('Every returned item needs a positive quantity.');
        }
        const k = rowKey(r.productId, r.variantKey);
        const total = (requestedByKey.get(k) || 0) + Number(r.quantity);
        requestedByKey.set(k, total);
        const remaining = (originalQtyByKey.get(k) || 0) - (alreadyReturnedByKey.get(k) || 0);
        if (total > remaining) {
          throw new Error(`"${r.name}"${r.variantKey ? ` (${r.variantKey})` : ''} — only ${remaining} left to return from this invoice.`);
        }
        qtyByProduct.set(r.productId, (qtyByProduct.get(r.productId) || 0) + Number(r.quantity));
      }

      // Decrement product current_stock atomically with stock availability guard
      for (const [productId, qty] of [...qtyByProduct.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        const updated = await tx.$executeRaw`
          UPDATE products
          SET current_stock = COALESCE(current_stock, 0) - ${qty}
          WHERE id = ${productId}::uuid AND shop_id = ${auth.shop.id}::uuid
            AND COALESCE(current_stock, 0) >= ${qty}
        `;
        if (updated === 0) {
          const p = await tx.product.findFirst({ where: { id: productId, shopId: auth.shop.id } });
          const name = p?.name || productId;
          throw new Error(`Not enough current stock to return: ${name}.`);
        }
      }

      const totalAmount = requested.reduce((sum, r) => sum + r.quantity * r.rate, 0);
      const returnId = randomUUID();
      const returnNumber = `RET-${randomUUID().substring(0, 8).toUpperCase()}`;

      await tx.purchaseReturn.create({
        data: {
          id: returnId,
          shopId: auth.shop.id,
          supplierId: invoice.supplier_id,
          purchaseInvoiceId: invoice.id,
          returnNumber,
          totalAmount,
        },
      });

      await tx.purchaseReturnItem.createMany({
        data: requested.map((r) => ({
          id: randomUUID(),
          returnId,
          productId: r.productId,
          name: r.name,
          variantKey: r.variantKey || null,
          quantity: r.quantity,
          rate: r.rate,
          amount: r.quantity * r.rate,
        })),
      });

      await tx.stockMovement.createMany({
        data: requested.map((r) => ({
          id: randomUUID(),
          shopId: auth.shop.id,
          productId: r.productId,
          type: 'adjustment',
          quantity: r.quantity,
          referenceId: returnId,
        })),
      });

      // Decrement lot (Batch) quantities for returned items so FIFO billing
      // reflects correct remaining stock per lot after the return.
      const batchsByKey = new Map<string, Array<{ id: string; qty: number }>>();
      for (const item of purchaseItems) {
        if ((item as any).batchId) {
          const k = rowKey(item.productId, item.variantKey);
          const list = batchsByKey.get(k) || [];
          list.push({ id: (item as any).batchId, qty: item.quantity });
          batchsByKey.set(k, list);
        }
      }
      for (const r of requested) {
        const k = rowKey(r.productId, r.variantKey);
        const batches = batchsByKey.get(k) || [];
        let remaining = Number(r.quantity);
        for (const b of batches) {
          if (remaining <= 0) break;
          const toDecrement = Math.min(remaining, b.qty);
          await tx.batch.update({
            where: { id: b.id },
            data: { quantity: { decrement: toDecrement } },
          });
          remaining -= toDecrement;
        }
      }

      // Decrement godown (warehouse) inventory for Udyog/BadaUdyog shops.
      // Look up which warehouse the original purchase was stocked into via the
      // StockMovement that was created at purchase time.
      const purchaseMovements = await tx.stockMovement.findMany({
        where: { shopId: auth.shop.id, referenceId: id, type: 'purchase' },
        select: { productId: true, warehouseId: true },
      });
      const warehouseByProduct = new Map<string, string>();
      for (const m of purchaseMovements) {
        if (m.warehouseId) warehouseByProduct.set(m.productId, m.warehouseId);
      }
      for (const [productId, qty] of [...qtyByProduct.entries()]) {
        const warehouseId = warehouseByProduct.get(productId);
        if (warehouseId) {
          await tx.godownProduct.updateMany({
            where: { godownId: warehouseId, productId },
            data: { quantity: { decrement: qty } },
          });
        }
      }

      await tx.supplier.update({
        where: { id: invoice.supplier_id },
        data: { balance: { decrement: totalAmount } },
      });

      await tx.supplierTransaction.create({
        data: {
          id: randomUUID(),
          supplierId: invoice.supplier_id,
          type: 'purchase_return',
          amount: totalAmount,
          billNumber: returnNumber,
          note: `Return against Purchase Invoice: ${invoice.invoice_number || invoice.id}`,
        },
      });

      const deltas: VariantStockDelta[] = requested
        .filter((r) => r.variantKey)
        .map((r) => ({ productId: r.productId, variantKey: r.variantKey, delta: -r.quantity }));
      if (deltas.length) {
        await applyVariantStockDeltas(tx, deltas, auth.shop.id);
      }

      return tx.purchaseReturn.findUnique({
        where: { id: returnId },
        include: { items: true, supplier: true },
      });
    }, { maxWait: 30000, timeout: 60000 });

    return NextResponse.json({ success: true, purchaseReturn: created });
  } catch (error: any) {
    const msg = error.message || String(error);
    const status = msg.includes('not found') ? 404 : (msg.includes('Not enough current stock') ? 409 : 400);
    return NextResponse.json({ error: msg }, { status });
  }
}
