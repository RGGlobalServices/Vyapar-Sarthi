import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { planReturn, parsePriorReturns, splitRefund } from '@/lib/server/refunds';
import { serverSellingPriceFor, serverCostFor, round2, toPaise } from '@/lib/server/moneyValidation';
import { isMillBillingPackage, isWholesaleTierPackage } from '@/lib/config/packageConfig';
import { assertNotMillSale } from '@/lib/server/millGuards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Exchange pipeline — a customer returns item(s) from an existing bill AND
 * walks out with different item(s) instead of a cash refund. Built as its
 * own route (not two calls to /billing/returns + /billing) because the
 * money math is genuinely different from a pure return: a pure return always
 * pays the full return value out; here that value is a TRADE-IN CREDIT
 * toward the new sale, and only the DIFFERENCE is ever settled in cash/
 * UPI/card/udhar. Calling the two existing endpoints back-to-back would
 * double-handle the traded-in value (paid out as a refund, then paid back in
 * as a new sale) and desync the ledger.
 */

interface ReturnItemInput {
  item_id: string;
  quantity: number;
  reason?: string;
  name?: string;
  price?: number;
  product_id?: string;
}

interface ExchangeItemInput {
  product_id: string;
  variant?: string | null;
  quantity: number;
  price: number;
  name?: string;
}

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const allowNegativeStock = Boolean((shop as any).allowNegativeStock);
  const body = await readBody(req) as {
    bill_id: string;
    return_items: ReturnItemInput[];
    exchange_items: ExchangeItemInput[];
    settlement_method?: 'Cash' | 'UPI' | 'Card' | 'Udhar';
  };
  const { bill_id, return_items, exchange_items, settlement_method } = body;

  if (!bill_id || !return_items?.length) throw new ApiError(400, 'bill_id and return_items are required');
  if (!exchange_items?.length) throw new ApiError(400, 'exchange_items is required — use /billing/returns for a plain refund');
  if (settlement_method !== undefined && !['Cash', 'UPI', 'Card', 'Udhar'].includes(settlement_method as string)) {
    throw new ApiError(400, 'Invalid settlement_method');
  }

  // Mill bills (`mill_v2`) cannot be exchanged yet (the exchange leg is priced GST-inclusive). Legacy bills unaffected.
  await assertNotMillSale(shop.id, bill_id, 'exchange');

  // (After the Mill-sale check above, which keeps answering 409 for a Mill invoice.) An exchange creates a NEW legacy (unmarked) sale. Bada Udyog package = Mill Billing, so a Bada Udyog shop cannot create
  // legacy sales by any route (same rule as POST /billing).
  if (isMillBillingPackage(shop.packageType)) {
    throw new ApiError(400, 'Legacy exchanges are not available for the Bada Udyog package (its bills are Mill invoices).', 'MILL_BILLING_REQUIRED');
  }

  const result = await prisma.$transaction(async (tx) => {
    // 1. Lock original Sale row to serialize concurrent returns/exchanges
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

    const { lines: planned, totalRefund: returnValueRaw } = planReturn({
      saleItems,
      saleTotal: Number(saleRow.total_amount) || 0,
      priorReturns: parsePriorReturns(priorRows as any, bill_id),
      requests: return_items.map((i) => ({ item_id: i?.item_id, quantity: i?.quantity })),
    });
    const reasonByItem = new Map(return_items.map((i) => [i?.item_id, i?.reason]));
    const preparedReturns = planned.map((l) => ({
      saleItem: l.saleItem as typeof saleItems[number],
      qty: l.qty,
      reason: reasonByItem.get(l.saleItem.id) || 'Customer Return',
      refundAmount: l.refundAmount,
      refundProfit: l.refundProfit,
      variantKey: (l.saleItem.variant as string | null) || null,
    }));
    const returnValue = returnValueRaw;

    // Deterministic locking of all involved products (return and exchange)
    const returnQtyByProduct = new Map<string, number>();
    for (const p of preparedReturns) {
      if (!p.saleItem.productId) continue;
      returnQtyByProduct.set(p.saleItem.productId, (returnQtyByProduct.get(p.saleItem.productId) || 0) + p.qty);
    }
    const returnedProductIds = [...returnQtyByProduct.keys()];
    const exchangeProductIds = [...new Set(exchange_items.map((e) => e.product_id))];
    const allProductIds = [...new Set([...returnedProductIds, ...exchangeProductIds])].sort();

    for (const pid of allProductIds) {
      await tx.$queryRaw`
        SELECT id FROM products
        WHERE id = ${pid}::uuid AND shop_id = ${shop.id}::uuid
        FOR UPDATE
      `;
    }

    // Lock order (global): sale -> products (also serialises batches) -> customer.
    // Lock customer row if present
    let lockedCustomer: { id: string; total_due: number | null; name: string | null; credit_limit: number | null } | null = null;
    if (saleRow.customer_id) {
      const lockedCustomers = await tx.$queryRaw<Array<{ id: string; total_due: number | null; name: string | null; credit_limit: number | null }>>`
        SELECT id, total_due, name, credit_limit
        FROM customers
        WHERE id = ${saleRow.customer_id}::uuid AND shop_id = ${shop.id}::uuid
        FOR UPDATE
      `;
      if (lockedCustomers.length) {
        lockedCustomer = lockedCustomers[0];
      }
    }

    const exchangeProducts = await tx.product.findMany({ where: { id: { in: exchangeProductIds }, shopId: shop.id } });
    const exchangeProductById = new Map(exchangeProducts.map((p) => [p.id, p]));

    interface PreparedExchange {
      productId: string;
      product: any;
      variantKey: string | null;
      qty: number;
      price: number;
      cost: number;
      name: string;
    }

    const preparedExchange: PreparedExchange[] = [];
    for (const ex of exchange_items) {
      const qty = typeof ex.quantity === 'number' ? ex.quantity : Number(ex.quantity);
      if (!Number.isFinite(qty) || qty < 0) throw new ApiError(400, 'Exchange quantity must be a valid non-negative number');
      if (qty === 0) continue;
      const product = exchangeProductById.get(ex.product_id);
      if (!product) throw new ApiError(400, `Product ${ex.product_id} not found`);
      const serverPrice = serverSellingPriceFor(product, ex.variant || null);
      if (!(serverPrice > 0)) throw new ApiError(400, `"${product.name}" has no selling price set; cannot exchange`);
      preparedExchange.push({
        productId: product.id,
        product,
        variantKey: ex.variant || null,
        qty,
        price: serverPrice,
        cost: serverCostFor(product, ex.variant || null),
        name: ex.name || product.name || 'Item',
      });
    }
    if (!preparedExchange.length) throw new ApiError(400, 'No valid exchange quantities provided');
    const exchangeValue = round2(preparedExchange.reduce((s, p) => s + p.qty * p.price, 0));

    // Stock-availability check for exchange items
    const exchangeQtyByProduct = new Map<string, number>();
    for (const p of preparedExchange) exchangeQtyByProduct.set(p.productId, (exchangeQtyByProduct.get(p.productId) || 0) + p.qty);
    const short = exchangeProducts.filter((p) => (p.currentStock ?? 0) < (exchangeQtyByProduct.get(p.id) || 0));
    if (short.length && !allowNegativeStock) {
      throw new ApiError(409, `Not enough stock to give in exchange: ${short.map((p) => p.name).join(', ')}.`);
    }

    const difference = Math.round((exchangeValue - returnValue) * 100) / 100;
    if (difference > 0 && !settlement_method) {
      throw new ApiError(400, 'settlement_method is required when the exchange value is more than the return value');
    }
    if (difference > 0 && settlement_method === 'Udhar' && !saleRow.customer_id) {
      throw new ApiError(400, 'This bill has no linked customer — cannot add the difference to udhar');
    }

    // 1. Restock the RETURNED items
    const returnedProducts = returnedProductIds.length
      ? await tx.product.findMany({ where: { id: { in: returnedProductIds } } })
      : [];
    const returnedProductById = new Map(returnedProducts.map((pp) => [pp.id, pp]));

    for (const [productId, totalQty] of returnQtyByProduct.entries()) {
      const product = returnedProductById.get(productId);
      if (!product) continue;
      let newSizeVariants = product.size_variants;
      const newVariants = Array.isArray(product.variants) ? (product.variants as any[]).map((v) => ({ ...v })) : null;
      let variantsChanged = false;

      for (const p of preparedReturns) {
        if (p.saleItem.productId !== productId || !p.variantKey) continue;
        if (newSizeVariants) {
          try {
            const parsed = typeof newSizeVariants === 'string' ? JSON.parse(newSizeVariants) : newSizeVariants;
            if (parsed[p.variantKey] !== undefined) {
              parsed[p.variantKey] = (Number(parsed[p.variantKey]) || 0) + p.qty;
              newSizeVariants = JSON.stringify(parsed);
            }
          } catch {}
        }
        if (newVariants) {
          const row = newVariants.find((v: any) => (v.color ? `${v.color} / ${v.size || ''}` : (v.size || '')) === p.variantKey);
          if (row) {
            row.stock = (Number(row.stock) || 0) + p.qty;
            variantsChanged = true;
          }
        }
      }

      await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) + ${totalQty} WHERE id = ${productId}::uuid AND shop_id = ${shop.id}::uuid`;
      await tx.product.update({
        where: { id: productId },
        data: {
          size_variants: newSizeVariants,
          ...(variantsChanged ? { variants: newVariants as any } : {}),
        },
      });

      if (isWholesaleTierPackage(shop.packageType)) {
        const latestBatch = await tx.batch.findFirst({ where: { productId, shopId: shop.id }, orderBy: { createdAt: 'desc' } });
        if (latestBatch) await tx.batch.update({ where: { id: latestBatch.id }, data: { quantity: { increment: totalQty } } });
      }
    }

    // 2. Create replacement Sale
    const exchangeInvoiceNumber = `EXC-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
    const totalExchangeProfit = preparedExchange.reduce((s, p) => s + (p.price - p.cost) * p.qty, 0);

    let exchangeAmountPaid: number;
    let exchangePaymentType: string;
    if (difference <= 0) {
      exchangeAmountPaid = exchangeValue;
      exchangePaymentType = 'Cash';
    } else if (settlement_method === 'Udhar') {
      exchangeAmountPaid = returnValue;
      exchangePaymentType = 'Udhar';
    } else {
      exchangeAmountPaid = exchangeValue;
      exchangePaymentType = settlement_method!;
    }

    const newSale = await tx.sale.create({
      data: {
        shopId: shop.id,
        customerId: saleRow.customer_id,
        totalAmount: exchangeValue,
        totalProfit: totalExchangeProfit,
        paymentType: exchangePaymentType,
        amountPaid: exchangeAmountPaid,
        invoice_number: exchangeInvoiceNumber,
        billType: 'non_gst',
        items: {
          create: preparedExchange.map((p) => ({
            productId: p.productId,
            unit: p.product.baseUnit || undefined,
            quantity: p.qty,
            pricePerUnit: p.price,
            marginPerUnit: p.price - p.cost,
            variant: p.variantKey || undefined,
            itemName: p.name,
          })),
        },
      },
    });

    // 3. Decrement stock for the EXCHANGE items
    const exchangeProductsFresh = await tx.product.findMany({ where: { id: { in: [...exchangeQtyByProduct.keys()] } } });
    const exchangeProductByIdFresh = new Map(exchangeProductsFresh.map((pp) => [pp.id, pp]));
    const activeBatches = isWholesaleTierPackage(shop.packageType)
      ? await tx.batch.findMany({ where: { productId: { in: [...exchangeQtyByProduct.keys()] }, shopId: shop.id, quantity: { gt: 0 } }, orderBy: { createdAt: 'asc' } })
      : [];
    const batchesByProduct = new Map<string, typeof activeBatches>();
    for (const b of activeBatches) {
      if (!batchesByProduct.has(b.productId!)) batchesByProduct.set(b.productId!, []);
      batchesByProduct.get(b.productId!)!.push(b);
    }

    for (const [productId, totalQty] of exchangeQtyByProduct.entries()) {
      const product = exchangeProductByIdFresh.get(productId);
      if (!product) continue;
      let newSizeVariants = product.size_variants;
      const newVariants = Array.isArray(product.variants) ? (product.variants as any[]).map((v) => ({ ...v })) : null;
      let variantsChanged = false;

      for (const p of preparedExchange) {
        if (p.productId !== productId || !p.variantKey) continue;
        if (newSizeVariants) {
          try {
            const parsed = typeof newSizeVariants === 'string' ? JSON.parse(newSizeVariants) : newSizeVariants;
            if (parsed[p.variantKey] !== undefined) {
              parsed[p.variantKey] = Math.max(0, (Number(parsed[p.variantKey]) || 0) - p.qty);
              newSizeVariants = JSON.stringify(parsed);
            }
          } catch {}
        }
        if (newVariants) {
          const row = newVariants.find((v: any) => (v.color ? `${v.color} / ${v.size || ''}` : (v.size || '')) === p.variantKey);
          if (row) {
            row.stock = Math.max(0, (Number(row.stock) || 0) - p.qty);
            variantsChanged = true;
          }
        }
      }

      if (!allowNegativeStock) {
        const decCount = await tx.$executeRaw`
          UPDATE products
          SET current_stock = COALESCE(current_stock, 0) - ${totalQty}
          WHERE id = ${productId}::uuid AND shop_id = ${shop.id}::uuid AND COALESCE(current_stock, 0) >= ${totalQty}
        `;
        if (decCount === 0) {
          throw new ApiError(409, `Not enough stock to give in exchange for product ${product.name}`);
        }
      } else {
        await tx.$executeRaw`
          UPDATE products
          SET current_stock = COALESCE(current_stock, 0) - ${totalQty}
          WHERE id = ${productId}::uuid AND shop_id = ${shop.id}::uuid
        `;
      }

      await tx.product.update({
        where: { id: productId },
        data: {
          size_variants: newSizeVariants,
          ...(variantsChanged ? { variants: newVariants as any } : {}),
        },
      });

      if (isWholesaleTierPackage(shop.packageType)) {
        let remainingQty = totalQty;
        for (const batch of batchesByProduct.get(productId) || []) {
          if (remainingQty <= 0) break;
          const deduct = Math.min(batch.quantity, remainingQty);
          await tx.batch.update({ where: { id: batch.id }, data: { quantity: { decrement: deduct } } });
          remainingQty -= deduct;
        }
        await tx.stockMovement.create({ data: { shopId: shop.id, productId, type: 'sale', quantity: totalQty, referenceId: newSale.id } });
      }
    }

    // 4. MaterialReturn rows
    const exchangedForSnapshot = preparedExchange.map((p) => ({ name: p.name, variant: p.variantKey, quantity: p.qty, price: p.price }));
    const createdReturnIds: string[] = [];
    for (const p of preparedReturns) {
      const row = await tx.materialReturn.create({
        data: {
          shopId: saleRow.shop_id,
          productId: p.saleItem.productId ?? undefined,
          itemName: p.saleItem.product?.name || p.saleItem.itemName || p.variantKey || 'Unknown Item',
          quantity: p.qty,
          reason: p.reason,
          amount: p.refundAmount,
          date: new Date(),
          note: JSON.stringify({
            billId: saleRow.id,
            invoiceNumber: saleRow.invoice_number,
            customerName: lockedCustomer?.name || 'Guest',
            customerId: saleRow.customer_id || null,
            paymentType: saleRow.payment_type,
            saleDate: saleRow.created_at,
            saleItemId: p.saleItem.id,
            variant: p.variantKey,
            refundProfit: p.refundProfit,
            udharCleared: 0,
            cashRefunded: 0,
            settled: true,
            exchange: true,
            exchangeSaleId: newSale.id,
            exchangeInvoiceNumber,
            exchangedFor: exchangedForSnapshot,
          }),
        },
      });
      createdReturnIds.push(row.id);

      if (isWholesaleTierPackage(shop.packageType) && p.saleItem.productId) {
        await tx.stockMovement.create({ data: { shopId: shop.id, productId: p.saleItem.productId, type: 'return', quantity: p.qty, referenceId: row.id } });
      }
    }

    // 5. Adjust original sale
    const totalProfitRefunded = preparedReturns.reduce((s, p) => s + p.refundProfit, 0);

    let udharCleared = 0;
    let cashRefunded = 0;
    let udharAdded = 0;
    let cashCollected = 0;

    if (difference < 0) {
      const excess = -difference;
      const paidBefore = Number(saleRow.amount_paid) || 0;
      const totalBefore = Number(saleRow.total_amount) || 0;
      const outstandingOnThisBill = Math.max(0, totalBefore - paidBefore);
      const split = splitRefund(excess, outstandingOnThisBill, lockedCustomer ? Number(lockedCustomer.total_due) || 0 : null);
      udharCleared = split.udharCleared;
      cashRefunded = split.cashRefunded;
    } else if (difference > 0 && settlement_method === 'Udhar') {
      udharAdded = difference;
    } else if (difference > 0) {
      cashCollected = settlement_method === 'Cash' ? difference : 0;
    }

    await tx.sale.update({
      where: { id: saleRow.id },
      data: {
        totalAmount: { decrement: returnValue },
        totalProfit: { decrement: totalProfitRefunded },
        ...(cashRefunded > 0 ? { amountPaid: { decrement: Math.min(cashRefunded, Number(saleRow.amount_paid) || 0) } } : {}),
      },
    });

    // 6. Net settlement — udhar side
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
          note: `Exchange refund: ${saleRow.invoice_number}`,
          bill_number: saleRow.invoice_number,
          created_at: new Date(),
        },
      });
    }
    if (saleRow.customer_id && udharAdded > 0) {
      if (lockedCustomer && (lockedCustomer.credit_limit ?? 0) > 0) {
        const curDue = Number(lockedCustomer.total_due || 0);
        if (curDue + udharAdded > lockedCustomer.credit_limit!) {
          throw new ApiError(400, `Credit Limit of ₹${lockedCustomer.credit_limit} exceeded by ₹${(curDue + udharAdded) - lockedCustomer.credit_limit!}`);
        }
      }
      await tx.customer.update({ where: { id: saleRow.customer_id }, data: { totalDue: { increment: udharAdded } } });
      await tx.customer_transactions.create({
        data: {
          customer_id: saleRow.customer_id,
          type: 'udhar',
          amount: udharAdded,
          note: `Exchange: ${exchangeInvoiceNumber}`,
          bill_number: exchangeInvoiceNumber,
          created_at: new Date(),
        },
      });
    }

    // 7. Net settlement — cash side
    if (cashRefunded > 0) {
      await tx.cashBook.create({
        data: { shopId: shop.id, type: 'refund', amount: cashRefunded, referenceId: saleRow.id, description: `Exchange refund for ${saleRow.invoice_number}` },
      });
    }
    if (cashCollected > 0) {
      await tx.cashBook.create({
        data: { shopId: shop.id, type: 'sale', amount: cashCollected, referenceId: newSale.id, description: `Exchange (Cash portion): ${exchangeInvoiceNumber}` },
      });
    }

    return {
      returnMaterialReturnIds: createdReturnIds,
      exchangeSaleId: newSale.id,
      exchangeInvoiceNumber,
      returnValue: Math.round(returnValue * 100) / 100,
      exchangeValue: Math.round(exchangeValue * 100) / 100,
      difference,
      settlement: { udharCleared, cashRefunded, udharAdded, cashCollected },
    };
  }, {
    maxWait: 30000,
    timeout: 60000,
  });

  return json({ detail: 'Exchange processed', ...result });
});
