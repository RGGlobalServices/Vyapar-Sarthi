import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { isWholesaleTierPackage } from '@/lib/config/packageConfig';

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
 *
 * For the returned side: same stock-restore + MaterialReturn bookkeeping as
 * /billing/returns, with the returned rows' `note` additionally carrying
 * `exchange: true` / `exchangeSaleId` / `exchangedFor` so the Returns page
 * can show what the customer actually left with instead of cash.
 *
 * For the replacement side: a real new Sale + SaleItem[] (invoice-numbered
 * `EXC-XXXXXXXX` to stay visually distinct from a normal `INV-` sale), so it
 * shows up in the dashboard/party ledger/stock reports the same way any
 * other sale does — no separate exchange-aware report code needed anywhere
 * else in the app.
 *
 * Settlement of `exchangeValue - returnValue`:
 *   - 0: nothing else happens, the new sale is fully covered by the trade-in.
 *   - negative (shop owes money back): the excess is refunded udhar-first-
 *     then-cash, identical attribution to /billing/returns.
 *   - positive (customer owes more): settled via `settlement_method`
 *     (Cash/UPI/Card fully collected now, or added to the customer's udhar).
 *
 * Whole thing runs in one transaction — a half-processed exchange (stock
 * moved but ledger not settled, or vice versa) is worse than not processing
 * at all.
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
  const body = await readBody(req) as {
    bill_id: string;
    return_items: ReturnItemInput[];
    exchange_items: ExchangeItemInput[];
    settlement_method?: 'Cash' | 'UPI' | 'Card' | 'Udhar';
  };
  const { bill_id, return_items, exchange_items, settlement_method } = body;

  if (!bill_id || !return_items?.length) throw new ApiError(400, 'bill_id and return_items are required');
  if (!exchange_items?.length) throw new ApiError(400, 'exchange_items is required — use /billing/returns for a plain refund');

  const sale = await prisma.sale.findFirst({
    where: { id: bill_id, shopId: shop.id },
    include: { items: { include: { product: true } }, customer: true },
  });
  if (!sale) throw new ApiError(404, 'Bill not found');

  // ── Validate the returned side (identical guard to /billing/returns) ──
  const priorReturns = await prisma.materialReturn.findMany({
    where: { shopId: shop.id, note: { contains: sale.id } },
    select: { productId: true, itemName: true, quantity: true, note: true },
  });
  const alreadyReturnedByItem = new Map<string, number>();
  for (const r of priorReturns) {
    let noteData: any = {};
    try { if (r.note) noteData = JSON.parse(r.note); } catch {}
    const key = noteData?.saleItemId || r.productId || r.itemName;
    if (key) alreadyReturnedByItem.set(key, (alreadyReturnedByItem.get(key) || 0) + r.quantity);
  }

  interface PreparedReturn {
    saleItem: typeof sale.items[number];
    qty: number;
    reason: string;
    refundAmount: number;
    refundProfit: number;
    variantKey: string | null;
  }
  const preparedReturns: PreparedReturn[] = [];
  for (const ret of return_items) {
    const saleItem = sale.items.find((si) => si.id === ret.item_id);
    if (!saleItem) throw new ApiError(400, `Sale item ${ret.item_id} not on this bill`);
    const qty = Number(ret.quantity) || 0;
    if (qty <= 0) continue;
    const alreadyReturned = alreadyReturnedByItem.get(saleItem.id) || 0;
    const returnable = (saleItem.quantity || 0) - alreadyReturned;
    if (qty > returnable) {
      throw new ApiError(400, `Only ${returnable} of "${saleItem.product?.name || saleItem.itemName || 'this item'}" can still be returned`);
    }
    const price = Number(ret.price) || Number(saleItem.pricePerUnit) || 0;
    const margin = Number(saleItem.marginPerUnit) || 0;
    preparedReturns.push({
      saleItem,
      qty,
      reason: ret.reason || 'Customer Return',
      refundAmount: qty * price,
      refundProfit: qty * margin,
      variantKey: saleItem.variant || null,
    });
  }
  if (!preparedReturns.length) throw new ApiError(400, 'No valid return quantities provided');
  const returnValue = preparedReturns.reduce((s, p) => s + p.refundAmount, 0);

  // ── Validate the exchange side ──
  interface PreparedExchange {
    productId: string;
    product: any;
    variantKey: string | null;
    qty: number;
    price: number;
    name: string;
  }
  const exchangeProductIds = [...new Set(exchange_items.map(e => e.product_id))];
  const exchangeProducts = await prisma.product.findMany({ where: { id: { in: exchangeProductIds }, shopId: shop.id } });
  const exchangeProductById = new Map(exchangeProducts.map(p => [p.id, p]));

  const preparedExchange: PreparedExchange[] = [];
  for (const ex of exchange_items) {
    const qty = Number(ex.quantity) || 0;
    if (qty <= 0) continue;
    const product = exchangeProductById.get(ex.product_id);
    if (!product) throw new ApiError(400, `Product ${ex.product_id} not found`);
    preparedExchange.push({
      productId: product.id,
      product,
      variantKey: ex.variant || null,
      qty,
      price: Number(ex.price) || Number(product.sellingPrice) || 0,
      name: ex.name || product.name || 'Item',
    });
  }
  if (!preparedExchange.length) throw new ApiError(400, 'No valid exchange quantities provided');
  const exchangeValue = preparedExchange.reduce((s, p) => s + p.qty * p.price, 0);

  // Stock-availability guard, checked before any write — same pattern as
  // app/api/v1/purchases/[id]/return/route.ts. Aggregate qty per product
  // first since one product can appear via more than one variant line.
  const exchangeQtyByProduct = new Map<string, number>();
  for (const p of preparedExchange) exchangeQtyByProduct.set(p.productId, (exchangeQtyByProduct.get(p.productId) || 0) + p.qty);
  const short = exchangeProducts.filter(p => (p.currentStock ?? 0) < (exchangeQtyByProduct.get(p.id) || 0));
  if (short.length) {
    throw new ApiError(409, `Not enough stock to give in exchange: ${short.map(p => p.name).join(', ')}.`);
  }

  const difference = Math.round((exchangeValue - returnValue) * 100) / 100;
  if (difference > 0 && !settlement_method) {
    throw new ApiError(400, 'settlement_method is required when the exchange value is more than the return value');
  }
  if (difference > 0 && settlement_method === 'Udhar' && !sale.customerId) {
    throw new ApiError(400, 'This bill has no linked customer — cannot add the difference to udhar');
  }

  const result = await prisma.$transaction(async (tx) => {
    // 1. Restock the RETURNED items — COALESCE-safe raw SQL (unlike the
    //    older conditional-skip idiom in /billing/returns) so a null
    //    currentStock never silently swallows the restore.
    const returnQtyByProduct = new Map<string, number>();
    for (const p of preparedReturns) {
      if (!p.saleItem.productId) continue;
      returnQtyByProduct.set(p.saleItem.productId, (returnQtyByProduct.get(p.saleItem.productId) || 0) + p.qty);
    }
    const returnedProductIds = [...returnQtyByProduct.keys()];
    const returnedProducts = returnedProductIds.length
      ? await tx.product.findMany({ where: { id: { in: returnedProductIds } } })
      : [];
    const returnedProductById = new Map(returnedProducts.map(pp => [pp.id, pp]));

    for (const [productId, totalQty] of returnQtyByProduct.entries()) {
      const product = returnedProductById.get(productId);
      if (!product) continue;
      let newSizeVariants = product.size_variants;
      const newVariants = Array.isArray(product.variants) ? (product.variants as any[]).map(v => ({ ...v })) : null;
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

      await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) + ${totalQty} WHERE id = ${productId}::uuid`;
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

    // 2. Create the replacement Sale (the "new item" leg) — mirrors
    //    POST /billing's creation shape.
    const exchangeInvoiceNumber = `EXC-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
    const totalExchangeProfit = preparedExchange.reduce((s, p) => s + (p.price - (Number(p.product.costPrice) || 0)) * p.qty, 0);

    let exchangeAmountPaid: number;
    let exchangePaymentType: string;
    if (difference <= 0) {
      // Fully covered by the trade-in credit (exactly even, or the shop
      // owes money back — that excess is settled separately below).
      exchangeAmountPaid = exchangeValue;
      exchangePaymentType = 'Cash';
    } else if (settlement_method === 'Udhar') {
      exchangeAmountPaid = returnValue; // only the trade-in portion is "paid"
      exchangePaymentType = 'Udhar';
    } else {
      exchangeAmountPaid = exchangeValue; // trade-in + collected method covers it all
      exchangePaymentType = settlement_method!;
    }

    const newSale = await tx.sale.create({
      data: {
        shopId: shop.id,
        customerId: sale.customerId,
        totalAmount: exchangeValue,
        totalProfit: totalExchangeProfit,
        paymentType: exchangePaymentType,
        amountPaid: exchangeAmountPaid,
        invoice_number: exchangeInvoiceNumber,
        billType: 'non_gst',
        items: {
          create: preparedExchange.map(p => ({
            productId: p.productId,
            unit: p.product.baseUnit || undefined,
            quantity: p.qty,
            pricePerUnit: p.price,
            marginPerUnit: p.price - (Number(p.product.costPrice) || 0),
            variant: p.variantKey || undefined,
            itemName: p.name,
          })),
        },
      },
    });

    // 3. Decrement stock for the EXCHANGE items — COALESCE raw SQL, mirrors
    //    POST /billing exactly.
    const exchangeProductsFresh = await tx.product.findMany({ where: { id: { in: [...exchangeQtyByProduct.keys()] } } });
    const exchangeProductByIdFresh = new Map(exchangeProductsFresh.map(pp => [pp.id, pp]));
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
      const newVariants = Array.isArray(product.variants) ? (product.variants as any[]).map(v => ({ ...v })) : null;
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

      await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) - ${totalQty} WHERE id = ${productId}::uuid`;
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

    // 4. MaterialReturn rows for the returned items, carrying the exchange
    //    linkage in `note` so the Returns page can show what was given back.
    const exchangedForSnapshot = preparedExchange.map(p => ({ name: p.name, variant: p.variantKey, quantity: p.qty, price: p.price }));
    const createdReturnIds: string[] = [];
    for (const p of preparedReturns) {
      const row = await tx.materialReturn.create({
        data: {
          shopId: sale.shopId!,
          productId: p.saleItem.productId ?? undefined,
          itemName: p.saleItem.product?.name || p.saleItem.itemName || p.variantKey || 'Unknown Item',
          quantity: p.qty,
          reason: p.reason,
          amount: p.refundAmount,
          date: new Date(),
          note: JSON.stringify({
            billId: sale.id,
            invoiceNumber: sale.invoice_number,
            customerName: sale.customer?.name || 'Guest',
            customerId: sale.customerId || null,
            paymentType: sale.paymentType,
            saleDate: sale.createdAt,
            saleItemId: p.saleItem.id,
            variant: p.variantKey,
            refundProfit: p.refundProfit,
            // No cash/udhar refund of the traded-in value itself — it went
            // toward the new sale, not back to the customer. Only the NET
            // difference (settled below) ever touches cash/udhar.
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

    // 5. Adjust the ORIGINAL sale — identical to /billing/returns. The
    //    amountPaid decrement only happens for whatever cash/udhar portion
    //    is actually settled below (step 6), never for the traded-in value.
    const totalProfitRefunded = preparedReturns.reduce((s, p) => s + p.refundProfit, 0);

    let udharCleared = 0;
    let cashRefunded = 0;
    let udharAdded = 0;
    let cashCollected = 0;

    if (difference < 0) {
      // Shop owes the customer the excess back — udhar-first-then-cash,
      // identical attribution to /billing/returns, against this bill's own
      // outstanding.
      const excess = -difference;
      const paidBefore = Number(sale.amountPaid) || 0;
      const totalBefore = Number(sale.totalAmount) || 0;
      const outstandingOnThisBill = Math.max(0, totalBefore - paidBefore);
      udharCleared = Math.min(excess, outstandingOnThisBill);
      cashRefunded = excess - udharCleared;
    } else if (difference > 0 && settlement_method === 'Udhar') {
      udharAdded = difference;
    } else if (difference > 0) {
      cashCollected = settlement_method === 'Cash' ? difference : 0; // UPI/Card collected but never touches CashBook, matching POST /billing
    }

    await tx.sale.update({
      where: { id: sale.id },
      data: {
        totalAmount: { decrement: returnValue },
        totalProfit: { decrement: totalProfitRefunded },
        ...(cashRefunded > 0 ? { amountPaid: { decrement: cashRefunded } } : {}),
      },
    });

    // 6. Net settlement — udhar side
    if (sale.customerId && udharCleared > 0) {
      await tx.customer.update({ where: { id: sale.customerId }, data: { totalDue: { decrement: udharCleared } } });
      await tx.customer_transactions.create({
        data: {
          customer_id: sale.customerId,
          type: 'refund',
          amount: udharCleared,
          note: `Exchange refund: ${sale.invoice_number}`,
          bill_number: sale.invoice_number,
          created_at: new Date(),
        },
      });
    }
    if (sale.customerId && udharAdded > 0) {
      await tx.customer.update({ where: { id: sale.customerId }, data: { totalDue: { increment: udharAdded } } });
      await tx.customer_transactions.create({
        data: {
          customer_id: sale.customerId,
          type: 'udhar',
          amount: udharAdded,
          note: `Exchange: ${exchangeInvoiceNumber}`,
          bill_number: exchangeInvoiceNumber,
          created_at: new Date(),
        },
      });
    }

    // 7. Net settlement — cash side (physical drawer movement only; UPI/Card
    //    never get a CashBook row anywhere else in this app either).
    if (cashRefunded > 0) {
      await tx.cashBook.create({
        data: { shopId: shop.id, type: 'refund', amount: cashRefunded, referenceId: sale.id, description: `Exchange refund for ${sale.invoice_number}` },
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
    maxWait: 10000,
    timeout: 20000,
  });

  return json({ detail: 'Exchange processed', ...result });
});
