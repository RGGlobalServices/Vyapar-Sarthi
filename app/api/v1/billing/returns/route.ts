import { debitGodown, creditGodown, syncsGodownStock } from '@/lib/server/godownStock';
import prisma from '@/lib/server/prisma';
import { assertSaleNotJobWork } from '@/lib/server/millGuards';
import { splitAcrossDraws } from '@/lib/lots';
import { openVariantStores, adjustVariantStores, closeVariantStores } from '@/lib/variants';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { toPaise } from '@/lib/server/moneyValidation';
import { planReturn, parsePriorReturns, splitRefund } from '@/lib/server/refunds';
import { isWholesaleTierPackage } from '@/lib/config/packageConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Return / refund pipeline. When a customer returns goods against an
 * existing bill this closes the loop across every place the original sale
 * touched — stock (including per-variant), the party's outstanding, and
 * the cash drawer — so a shopkeeper doesn't have to reconcile three
 * places by hand and the dashboard stays honest.
 *
 * For each returned unit:
 *   - Product stock is restored (currentStock + size_variants +
 *     Udyog variants[] + latest batch for wholesale tiers), mirroring how
 *     the sale itself decremented these on the way in.
 *   - The refund is attributed **udhar first, cash second** — the party
 *     already owes less, so their outstanding drops before we assume the
 *     shopkeeper is handing physical cash back. This is exactly the flow
 *     the client described: "return karle tar udhar pan clear zala pahije".
 *   - The historical SaleItem.marginPerUnit is used to compute refunded
 *     profit — NOT the product's current sellingPrice - costPrice, which
 *     drifts every time prices are edited and made the old dashboard swing
 *     wildly negative. That refunded-profit lands in the materialReturn's
 *     note so the dashboard can subtract it without recomputing.
 *   - A cashBook entry of type `refund` is written for the physical cash
 *     going out (if any). The udhar-cleared portion writes a
 *     customer_transactions row of type `refund` (NOT `payment`, so it
 *     doesn't inflate today's udhar-collection KPI — the customer never
 *     actually paid, we just gave credit back).
 *
 * Anything failing here rolls the whole return back — half-processed
 * returns would leave stock and ledger out of sync, which is worse than
 * not processing at all.
 */

interface ReturnItemInput {
  item_id: string;
  quantity: number;
  reason?: string;
  name?: string;
  price?: number;
  product_id?: string;
}

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody(req) as {
    bill_id: string;
    items: ReturnItemInput[];
    cash_refund?: number;   // shopkeeper-chosen cash amount (≤ auto cashRefunded)
    credit_to_add?: number; // remainder to park as customer credit
  };
  const { bill_id, items } = body;
  const shopkeeperCashRefund = typeof body.cash_refund === 'number' && isFinite(body.cash_refund) ? body.cash_refund : null;
  const shopkeeperCreditToAdd = typeof body.credit_to_add === 'number' && isFinite(body.credit_to_add) ? body.credit_to_add : null;

  if (!bill_id || !items || !items.length) {
    throw new ApiError(400, 'bill_id and items are required');
  }
  await assertSaleNotJobWork(shop.id, bill_id);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Lock the target Sale row to serialize concurrent returns on the same bill
    const lockedSales = await tx.$queryRaw<Array<{
      id: string;
      shop_id: string;
      total_amount: number;
      amount_paid: number;
      customer_id: string | null;
      invoice_number: string;
      payment_type: string;
      created_at: Date;
    }>>`
      SELECT id, shop_id, total_amount, amount_paid, customer_id, invoice_number, payment_type, created_at
      FROM sales
      WHERE id = ${bill_id}::uuid AND shop_id = ${shop.id}::uuid
      FOR UPDATE
    `;
    if (!lockedSales.length) throw new ApiError(404, 'Bill not found');
    const saleRow = lockedSales[0];

    const [saleItems, priorRows] = await Promise.all([
      tx.saleItem.findMany({
        where: { saleId: bill_id },
        include: { product: true },
      }),
      tx.materialReturn.findMany({
        where: { shopId: shop.id, note: { contains: bill_id } },
        select: { productId: true, itemName: true, quantity: true, amount: true, note: true },
      }),
    ]);

    const { lines: prepared0, totalRefund } = planReturn({
      saleItems,
      saleTotal: Number(saleRow.total_amount) || 0,
      priorReturns: parsePriorReturns(priorRows as any, bill_id),
      requests: items.map((i) => ({ item_id: i?.item_id, quantity: i?.quantity })),
    });

    const reasonByItem = new Map(items.map((i) => [i?.item_id, i?.reason]));
    const prepared = prepared0.map((l) => ({
      saleItem: l.saleItem as typeof saleItems[number],
      qty: l.qty,
      reason: reasonByItem.get(l.saleItem.id) || 'Customer Return',
      refundAmount: l.refundAmount,
      refundProfit: l.refundProfit,
      variantKey: (l.saleItem.variant as string | null) || null,
    }));

    // 2. Stock: currentStock, size_variants, variants[], batches
    const qtyByProduct = new Map<string, number>();
    for (const p of prepared) {
      if (!p.saleItem.productId) continue;
      qtyByProduct.set(p.saleItem.productId, (qtyByProduct.get(p.saleItem.productId) || 0) + p.qty);
    }

    const sortedProductIds = [...qtyByProduct.keys()].sort();
    const lockedProducts: Array<{ id: string; current_stock: number | null; size_variants: any; variants: any }> = [];
    for (const pid of sortedProductIds) {
      const rows = await tx.$queryRaw<Array<{
        id: string;
        current_stock: number | null;
        size_variants: any;
        variants: any;
      }>>`
        SELECT id, current_stock, size_variants, variants
        FROM products
        WHERE id = ${pid}::uuid AND shop_id = ${shop.id}::uuid
        FOR UPDATE
      `;
      if (rows.length) lockedProducts.push(rows[0]);
    }
    const productById = new Map(lockedProducts.map((pp) => [pp.id, pp]));

    for (const productId of sortedProductIds) {
      const product = productById.get(productId);
      if (!product) continue;
      const totalQty = qtyByProduct.get(productId) || 0;

      const stores = openVariantStores(product);
      for (const p of prepared) {
        if (p.saleItem.productId !== productId || !p.variantKey) continue;
        adjustVariantStores(stores, p.variantKey, p.qty);
      }
      const storeWrite = closeVariantStores(stores);

      await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) + ${totalQty} WHERE id = ${productId}::uuid AND shop_id = ${shop.id}::uuid`;
      if (syncsGodownStock(shop)) await creditGodown(tx, shop.id, productId, totalQty);
      await tx.product.update({
        where: { id: productId },
        data: {
          ...(storeWrite as any),
        },
      });
    }

    // Lock order (global): sale -> products (also serialises batches) -> customer.
    // Billing takes products -> customer, so both paths agree and cannot deadlock.
    // Lock customer row if present to prevent concurrent payment/refund balance races
    let customerDue: number | null = null;
    let customerName = 'Guest';
    if (saleRow.customer_id) {
      const lockedCustomers = await tx.$queryRaw<Array<{ id: string; total_due: number | null; name: string | null }>>`
        SELECT id, total_due, name
        FROM customers
        WHERE id = ${saleRow.customer_id}::uuid AND shop_id = ${shop.id}::uuid
        FOR UPDATE
      `;
      if (lockedCustomers.length) {
        customerDue = Number(lockedCustomers[0].total_due || 0);
        customerName = lockedCustomers[0].name || 'Guest';
      }
    }

    const paidBefore = Number(saleRow.amount_paid) || 0;
    const totalBefore = Number(saleRow.total_amount) || 0;
    const outstandingOnThisBill = Math.max(0, totalBefore - paidBefore);
    const autoSplit = splitRefund(totalRefund, outstandingOnThisBill, customerDue);

    // If the shopkeeper overrode the cash amount (editable input on the UI),
    // honour it — but never let cash exceed what the auto-split would pay out
    // (can't refund more cash than the return is worth) and never negative.
    const udharCleared = autoSplit.udharCleared;
    const maxCash = autoSplit.cashRefunded;
    const cashRefunded = shopkeeperCashRefund !== null
      ? Math.max(0, Math.min(Math.round(shopkeeperCashRefund * 100) / 100, maxCash))
      : maxCash;
    // The portion withheld from cash goes to the customer's credit balance
    // (negative udhar = shop owes customer; reduces total_due or creates a credit).
    const creditToAdd = shopkeeperCreditToAdd !== null
      ? Math.max(0, Math.min(Math.round(shopkeeperCreditToAdd * 100) / 100, maxCash - cashRefunded + 0.001))
      : Math.max(0, maxCash - cashRefunded);

    // 3. materialReturn records
    const created = [] as string[];
    for (const p of prepared) {
      const row = await tx.materialReturn.create({
        data: {
          shopId: shop.id,
          productId: p.saleItem.productId ?? undefined,
          itemName: p.saleItem.product?.name || p.saleItem.itemName || p.variantKey || 'Unknown Item',
          quantity: p.qty,
          reason: p.reason,
          amount: p.refundAmount,
          date: new Date(),
          note: JSON.stringify({
            billId: saleRow.id,
            invoiceNumber: saleRow.invoice_number,
            customerName,
            customerId: saleRow.customer_id || null,
            paymentType: saleRow.payment_type,
            saleDate: saleRow.created_at,
            saleItemId: p.saleItem.id,
            variant: p.variantKey,
            refundProfit: p.refundProfit,
            udharCleared: udharCleared > 0 && p.refundAmount > 0 ? (udharCleared * p.refundAmount) / totalRefund : 0,
            cashRefunded: cashRefunded > 0 && p.refundAmount > 0 ? (cashRefunded * p.refundAmount) / totalRefund : 0,
            creditToAdd: creditToAdd > 0 && p.refundAmount > 0 ? (creditToAdd * p.refundAmount) / totalRefund : 0,
            settled: true,
          }),
        }
      });
      created.push(row.id);

      // Lot restore: the returned units go back to the lot(s) this bill line drew from (all packages).
      // Sales made before lots were recorded have no draw rows and keep the old wholesale-only convention below.
      let restoredToDrawnLots = false;
      if (p.saleItem.productId) {
        const draws = await tx.saleItemBatch.findMany({ where: { saleItemId: p.saleItem.id } });
        const parts = splitAcrossDraws(draws.map((d) => ({ batchId: d.batchId, quantity: d.quantity })), p.qty);
        for (const part of parts) {
          await tx.batch.updateMany({ where: { id: part.batchId, shopId: shop.id }, data: { quantity: { increment: part.quantity } } });
        }
        restoredToDrawnLots = parts.length > 0;
      }

      // Wholesale batch restore + stock_movement for audit
      if (isWholesaleTierPackage(shop.packageType) && p.saleItem.productId) {
        const latestBatch = restoredToDrawnLots ? null : await tx.batch.findFirst({
          where: { productId: p.saleItem.productId, shopId: shop.id },
          orderBy: { createdAt: 'desc' }
        });
        if (latestBatch) {
          await tx.batch.update({
            where: { id: latestBatch.id },
            data: { quantity: { increment: p.qty } }
          });
        }
        await tx.stockMovement.create({
          data: {
            shopId: shop.id,
            productId: p.saleItem.productId,
            type: 'return',
            quantity: p.qty,
            referenceId: row.id,
          }
        });
      }
    }

    // 4. Adjust the Sale row
    // amountPaid drops by however much physical cash leaves the drawer (cashRefunded).
    // The credit portion (creditToAdd) is parked on the customer account separately —
    // it does NOT reduce amountPaid here because no cash actually changes hands.
    const totalProfitRefunded = prepared.reduce((s, p) => s + p.refundProfit, 0);
    await tx.sale.update({
      where: { id: saleRow.id },
      data: {
        totalAmount: { decrement: totalRefund },
        totalProfit: { decrement: totalProfitRefunded },
        ...(cashRefunded > 0 ? { amountPaid: { decrement: Math.min(cashRefunded, paidBefore) } } : {}),
      },
    });

    // 5. Udhar side
    if (saleRow.customer_id && udharCleared > 0) {
      const dec = await tx.$executeRaw`
        UPDATE customers SET total_due = COALESCE(total_due, 0) - ${udharCleared}
        WHERE id = ${saleRow.customer_id}::uuid AND shop_id = ${shop.id}::uuid
          AND ROUND(COALESCE(total_due, 0)::numeric * 100) >= ${toPaise(udharCleared)}
      `;
      if (dec === 0) throw new ApiError(409, 'Customer balance changed; please retry');
      await tx.customer_transactions.create({
        data: {
          customer_id: saleRow.customer_id,
          type: 'refund',
          amount: udharCleared,
          note: `Return refund: ${saleRow.invoice_number}`,
          bill_number: saleRow.invoice_number,
          created_at: new Date(),
        }
      });
    }

    // 6. Cash side
    if (cashRefunded > 0) {
      await tx.cashBook.create({
        data: {
          shopId: shop.id,
          type: 'refund',
          amount: cashRefunded,
          referenceId: saleRow.id,
          description: `Refund for ${saleRow.invoice_number}`,
        },
      });
    }

    // 6.5. Credit side — shopkeeper chose to give less cash; remainder is
    // credited to the customer's account (reduces their total_due, or if they
    // have no udhar, creates a negative balance = store credit they can use
    // on the next purchase).
    if (saleRow.customer_id && creditToAdd > 0) {
      await tx.$executeRaw`
        UPDATE customers SET total_due = COALESCE(total_due, 0) - ${creditToAdd}
        WHERE id = ${saleRow.customer_id}::uuid AND shop_id = ${shop.id}::uuid
      `;
      await tx.customer_transactions.create({
        data: {
          customer_id: saleRow.customer_id,
          type: 'refund',
          amount: creditToAdd,
          note: `Credit note: ${saleRow.invoice_number} (return credit)`,
          bill_number: saleRow.invoice_number,
          created_at: new Date(),
        }
      });
    }

    return { createdReturnIds: created, totalRefund, udharCleared, cashRefunded, creditToAdd, totalProfitRefunded };
  }, {
    maxWait: 30000,
    timeout: 60000,
  });

  return json({
    detail: 'Return processed',
    ...result,
  });
});
