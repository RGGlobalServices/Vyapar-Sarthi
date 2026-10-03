import { creditGodown } from '@/lib/server/godownStock';
import { resolveAmountPaid, validatePaymentDetails, resolveLineCost } from '@/lib/server/moneyValidation';
import { allocateFromLots } from '@/lib/lots';
import { readLotVariantKeys, savePriceAtSale } from '@/lib/server/lotColumns';
import { openVariantStores, adjustVariantStores, closeVariantStores, variantAvailable } from '@/lib/variants';
import type { Prisma, PrismaClient } from '@prisma/client';
import { isWholesaleTierPackage } from '@/lib/config/packageConfig';
import { calculateInvoice, InputLineItem, DiscountInput, BillType } from '@/lib/financialEngine';
import { ApiError } from '@/lib/server/http';
import { assertOwned } from '@/lib/server/ownership';

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
): Promise<{ sale: ReversedSale; netQuantitiesByProduct: Map<string, number>; lotRestores: Map<string, number> }> {
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
    const products = await tx.product.findMany({ where: { id: { in: productIds }, shopId } });
    const productById = new Map(products.map(p => [p.id, p]));

    for (const productId of productIds) {
      const product = productById.get(productId);
      if (!product) continue; // product was itself deleted since — nothing to restore stock on

      // Reverse the same size_variants/variants JSON mutation billing/route.ts
      // applies at creation, item-by-item, using each item's own net (not
      // aggregate) quantity — symmetric with how creation decrements it.
      const stores = openVariantStores(product);
      for (const item of sale.items) {
        if (item.productId !== productId || !item.variant) continue;
        const net = netByItem.get(item.id) || 0;
        if (net <= 0) continue;
        adjustVariantStores(stores, item.variant, net);
      }
      const storeWrite = closeVariantStores(stores);

      await tx.product.update({
        where: { id: productId, shopId },
        data: {
          ...(product.currentStock !== null ? { currentStock: { increment: netQuantitiesByProduct.get(productId) } } : {}),
          ...(storeWrite as any),
        },
      });
      // a deleted / reversed Bada Udyog bill puts the goods back in a godown too (it took them from one)
      if ((sale as any).pricingModel === 'mill_v2' && product.currentStock !== null) await creditGodown(tx, shopId, productId, netQuantitiesByProduct.get(productId) || 0);
    }
  }

  if (sale.customerId) {
    // Pull BOTH the udhar row(s) this sale created AND any `refund` rows a
    // subsequent return recorded against the same invoice. When we tear this
    // sale down we need to undo the net effect on customer.totalDue —
    // originally +sum(udhar) and later -sum(refund) — so the correct delta
    // to reverse is (udhar - refund), not just udhar. Missing the refund
    // rows was over-decrementing totalDue by the returned amount every time
    // a bill-with-return was deleted.
    const [udharTxns, refundTxns, customer] = await Promise.all([
      tx.customer_transactions.findMany({
        where: { customer_id: sale.customerId, type: 'udhar', bill_number: sale.invoice_number },
      }),
      tx.customer_transactions.findMany({
        where: { customer_id: sale.customerId, type: 'refund', bill_number: sale.invoice_number },
      }),
      tx.customer.findFirst({ where: { id: sale.customerId, shopId } }),
    ]);
    const netDue = udharTxns.reduce((s, t) => s + (t.amount || 0), 0)
                 - refundTxns.reduce((s, t) => s + (t.amount || 0), 0);
    const allIds = [...udharTxns.map(t => t.id), ...refundTxns.map(t => t.id)];
    if (allIds.length && customer) {
      await Promise.all([
        tx.customer_transactions.deleteMany({ where: { id: { in: allIds } } }),
        tx.customer.update({
          where: { id: sale.customerId, shopId },
          data: { totalDue: Math.max(0, (customer.totalDue || 0) - netDue) },
        }),
      ]);
    }
  }

  // Same net-effect discipline as the customer side: clear the sale's cash
  // inflow AND any refund cash outflow the return route wrote — leaving a
  // stale refund row after the sale is gone would keep phantom money in the
  // daily register.
  await tx.cashBook.deleteMany({ where: { shopId, referenceId: saleId, type: { in: ['sale', 'refund'] } } });

  // Which lots did each line actually draw from? Read BEFORE the SaleItem rows (and their SaleItemBatch children)
  // go away, so the quantity can go back to those exact lots, not "the latest lot". A partly returned line
  // restores only its net share (returns already put their share back).
  const lotRestores = new Map<string, number>();
  const draws = await tx.saleItemBatch.findMany({ where: { saleItemId: { in: sale.items.map((i) => i.id) } } });
  const drawsByItem = new Map<string, typeof draws>();
  for (const d of draws) drawsByItem.set(d.saleItemId, [...(drawsByItem.get(d.saleItemId) || []), d]);
  for (const item of sale.items) {
    const net = netByItem.get(item.id) || 0;
    const total = Number(item.quantity) || 0;
    const list = drawsByItem.get(item.id) || [];
    if (net <= 0 || total <= 0 || !list.length) continue;
    let left = net;
    list.forEach((d, idx) => {
      const share = idx === list.length - 1 ? left : Math.min(left, Math.round(((Number(d.quantity) || 0) * net / total) * 1e4) / 1e4);
      left -= share;
      if (share > 0) lotRestores.set(d.batchId, (lotRestores.get(d.batchId) || 0) + share);
    });
  }

  await tx.saleItem.deleteMany({ where: { saleId } });
  await tx.sale.delete({ where: { id: saleId } });

  return { sale, netQuantitiesByProduct, lotRestores };
}

/**
 * Creates a sale + its stock/customer/cashbook effects — used by both
 * POST /billing (a fresh invoice_number/id, auto-generated) and
 * PATCH /billing/[identifier] (editing an existing bill: reverseSaleEffects()
 * runs first in the SAME transaction, then this re-creates with the edited
 * customer/payment/items, reusing the ORIGINAL id/invoice_number/createdAt
 * via `overrides` so the invoice the customer already has in hand — WhatsApp
 * message, printed slip — still matches after the shopkeeper fixes a mistake).
 *
 * Deliberately simpler than POST's own inline transaction body: it skips the
 * FIFO batch-aware costing pass (lib/server/sales.ts's caller for POST keeps
 * that separately) — batch-level cost attribution is an internal profit-
 * tracking refinement, not something an edited bill needs to reproduce
 * exactly. The customer-facing total, GST, stock movement and payment
 * bookkeeping are all still fully correct; only the per-batch profit split
 * falls back to the product's plain cost price on an edited line.
 */
export async function createSaleEffects(
  tx: Prisma.TransactionClient,
  shop: { id: string; packageType: string | null | undefined },
  body: any,
  overrides?: { id?: string; invoiceNumber?: string; createdAt?: Date | null }
) {
  const shopId = shop.id;
  const customerId = (body.customer_id && body.customer_id !== '') ? body.customer_id : null;
  const items = body.items;

  if (!items || !items.length) throw new ApiError(400, 'No items in bill');
  for (const item of items) {
    if (item.quantity <= 0) throw new ApiError(400, `Invalid quantity for item ${item.product_id || item.productId}`);
    const price = item.price_per_unit ?? item.pricePerUnit;
    if (price < 0) throw new ApiError(400, `Invalid price for item ${item.product_id || item.productId}`);
  }

  // Every referenced id must belong to this shop before any read or write
  // (runs inside the caller's transaction, so a failure rolls back the whole
  // edit — including the reversal that already ran).
  await assertOwned(shopId, { customerId, productId: items.map((i: any) => i.product_id || i.productId) });

  const productIds = Array.from(new Set(items.map((i: any) => i.product_id || i.productId).filter(Boolean))) as string[];
  const products = productIds.length > 0 ? await tx.product.findMany({ where: { id: { in: productIds }, shopId } }) : [];
  const productMap = new Map(products.map(p => [p.id, p]));

  // Same per-line stock guard as POST — a shortage here must reject the
  // whole edit rather than leave stock negative, exactly as a fresh sale would.
  const variantKeyOf = (raw: any): string => {
    if (!raw) return '';
    if (typeof raw === 'string') return raw;
    const color = raw.color || raw.colour || '';
    const size = raw.size || '';
    return color ? `${color} / ${size}` : size;
  };
  const perLineDemand = new Map<string, number>();
  for (const it of items) {
    const pid = it.product_id || it.productId;
    if (!pid) continue;
    const key = `${pid}|${variantKeyOf(it.variant)}`;
    perLineDemand.set(key, (perLineDemand.get(key) || 0) + Number(it.quantity || 0));
  }
  const shortages: string[] = [];
  for (const [key, wanted] of perLineDemand.entries()) {
    const [pid, vKey] = key.split('|');
    const dbP: any = productMap.get(pid);
    if (!dbP) { shortages.push(`Unknown product ${pid}`); continue; }
    let available: number | null = vKey ? variantAvailable(dbP, vKey) : null;
    if (available === null) available = Number(dbP.currentStock ?? 0);
    if (available < wanted) {
      const label = vKey ? `${dbP.name} (${vKey})` : dbP.name;
      shortages.push(`${label}: only ${available} in stock, bill needs ${wanted}`);
    }
  }
  if (shortages.length > 0) throw new ApiError(400, `Insufficient stock: ${shortages.join('; ')}`);

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  const inputLineItems: InputLineItem[] = items.map((i: any) => {
    const pid = i.product_id || i.productId;
    const dbProduct: any = pid ? productMap.get(pid) : null;
    const sp = Number(i.price_per_unit ?? i.pricePerUnit ?? i.price) || 0;
    // Cost comes from the server (variant → product cost); the client's
    // purchase_price is never used for a product-backed line.
    const cp = resolveLineCost(i, dbProduct, sp);
    const gstRate = Number(i.gst_percent ?? i.gstPercent ?? dbProduct?.gstPercent) || 0;
    return {
      productId: pid || null,
      unit: i.unit || dbProduct?.baseUnit || null,
      variant: i.variant || null,
      quantity: Number(i.quantity) || 0,
      sellingPrice: sp,
      purchasePrice: cp,
      gstPercent: gstRate,
      hsnCode: i.hsn_code || i.hsnCode || dbProduct?.hsnCode || null,
    };
  });

  const billType: BillType = body.bill_type === 'gst' ? 'gst' : 'non_gst';
  const discountInput: DiscountInput = typeof body.discount === 'object' && body.discount !== null
    ? { type: body.discount.type, value: Number(body.discount.value) || 0 }
    : { type: 'fixed', value: Number(body.discount) || 0 };

  const calcResult = calculateInvoice(inputLineItems, discountInput, billType);
  const totalAmount = calcResult.discountedSubtotal;
  const totalProfit = calcResult.totalProfit;
  const gstAmount = billType === 'gst' ? calcResult.totalGst : null;

  const paymentType = body.payment_type || 'Cash';
  // amount_paid / split components are validated against the SERVER-computed
  // total; nothing money-related from the client is trusted as-is.
  const amountPaid = resolveAmountPaid(body.amount_paid === null ? undefined : body.amount_paid, totalAmount, paymentType);
  const validatedPayment = validatePaymentDetails(body.payment_details, paymentType, amountPaid);
  const paymentDetails = validatedPayment.details;
  const outstandingAmount = Math.max(0, totalAmount - amountPaid);

  if (outstandingAmount > 0 && (!customerId && !body.customer_name)) {
    throw new ApiError(400, 'Customer is required for Udhar / Outstanding amounts');
  }

  const invoice_number = overrides?.invoiceNumber || `INV-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

  let finalCustomerId = customerId;
  if (!finalCustomerId && body.customer_name) {
    const existing = await tx.customer.findFirst({ where: { shopId, name: body.customer_name } });
    if (existing) {
      finalCustomerId = existing.id;
      if ((body.customer_mobile && !existing.mobile) || (body.customer_email && !existing.email)) {
        await tx.customer.update({
          where: { id: existing.id, shopId },
          data: {
            ...(body.customer_mobile && !existing.mobile ? { mobile: body.customer_mobile } : {}),
            ...(body.customer_email && !existing.email ? { email: body.customer_email } : {}),
          },
        });
      }
    } else {
      const newCust = await tx.customer.create({
        data: { shopId, name: body.customer_name, mobile: body.customer_mobile || null, email: body.customer_email || null, totalDue: 0 },
      });
      finalCustomerId = newCust.id;
    }
  }

  const created = await tx.sale.create({
    data: {
      ...(overrides?.id ? { id: overrides.id } : {}),
      shopId,
      customerId: finalCustomerId,
      totalAmount,
      totalProfit,
      paymentType,
      amountPaid,
      paymentDetails,
      invoice_number,
      billType,
      gstAmount,
      gstDetails: body.gst_details ?? undefined,
      billImageUrl: body.bill_image_url || null,
      isManual: body.is_manual === true,
      createdAt: overrides?.createdAt ?? (body.created_at ? new Date(body.created_at) : undefined),
      items: {
        create: items.map((rawItem: any) => {
          const pid = rawItem.product_id || rawItem.productId;
          const dbProduct: any = pid ? productMap.get(pid) : null;
          const sp = Number(rawItem.price_per_unit ?? rawItem.pricePerUnit ?? rawItem.price) || 0;
          const qty = Number(rawItem.quantity) || 0;
          const calcLine = calcResult.items.find((c: any, idx: number) => idx === items.indexOf(rawItem));
          const marginPerUnit = calcLine && qty > 0 ? round2(calcLine.netProfit / qty) : 0;
          const rawName = rawItem.name || rawItem.product_name || rawItem.title || rawItem.itemName;
          return {
            productId: pid || null,
            unit: rawItem.unit || dbProduct?.baseUnit || null,
            variant: rawItem.variant || null,
            itemName: pid ? null : (rawName || null),
            quantity: qty,
            pricePerUnit: sp,
            marginPerUnit,
          };
        }),
      },
    },
    include: { items: true },
  });

  // Stock decrement — product-level + variant rows, same COALESCE-first
  // pattern as POST (currentStock is nullable with no DB default).
  const itemGroups = items.reduce((acc: any, item: any) => {
    const pid = item.product_id || item.productId;
    if (!pid) return acc;
    if (!acc[pid]) acc[pid] = [];
    acc[pid].push(item);
    return acc;
  }, {});
  const groupProductIds = Object.keys(itemGroups);
  if (groupProductIds.length > 0) {
    const promises: any[] = [];
    for (const product of products) {
      const productItems = itemGroups[product.id];
      if (!productItems) continue;
      let totalQty = 0;
      const stores = openVariantStores(product);
      for (const item of productItems) {
        totalQty += item.quantity;
        if (item.variant) adjustVariantStores(stores, item.variant, -item.quantity);
      }
      const storeWrite = closeVariantStores(stores);

      promises.push(tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) - ${totalQty} WHERE id = ${product.id}::uuid AND shop_id = ${shopId}::uuid`);
      promises.push(tx.product.update({
        where: { id: product.id, shopId },
        data: { ...(storeWrite as any), },
      }));

      if (isWholesaleTierPackage(shop.packageType)) {
        promises.push(tx.stockMovement.create({
          data: { shopId, productId: product.id, type: 'sale', quantity: totalQty, referenceId: created.id },
        }));
      }
    }
    await Promise.all(promises);
  }

  // Lot quantities: an edited bill draws from lots again (its old draws were restored by reverseSaleEffects).
  // created.items comes back in no guaranteed order, so pair every saved line with its own input line by
  // product + variant + quantity + price instead of trusting the index.
  {
    const used = new Set<number>();
    const pairedInputs: any[] = [];
    for (const si of created.items) {
      const k = items.findIndex((it: any, i: number) =>
        !used.has(i)
        && (it.product_id || it.productId || null) === si.productId
        && ((it.variant || null) === (si.variant || null))
        && Number(it.quantity) === Number(si.quantity)
        && Number(it.price_per_unit ?? it.pricePerUnit ?? it.price) === Number(si.pricePerUnit));
      if (k >= 0) used.add(k);
      pairedInputs.push(k >= 0 ? items[k] : null);
    }
    await recordLotDraws(tx, shopId, created.items, pairedInputs, productMap);
  }

  if (outstandingAmount > 0 && finalCustomerId) {
    const custData = await tx.customer.findFirst({ where: { id: finalCustomerId, shopId } });
    if (custData && (custData.creditLimit ?? 0) > 0) {
      const currentDue = custData.totalDue || 0;
      if (currentDue + outstandingAmount > custData.creditLimit!) {
        throw new Error(`Credit Limit of ₹${custData.creditLimit} exceeded by ₹${(currentDue + outstandingAmount) - custData.creditLimit!}`);
      }
    }
    await Promise.all([
      tx.customer.update({ where: { id: finalCustomerId, shopId }, data: { totalDue: { increment: outstandingAmount } } }),
      tx.customer_transactions.create({
        data: { customer_id: finalCustomerId, type: 'udhar', amount: outstandingAmount, note: `Bill: ${invoice_number}`, bill_number: invoice_number, created_at: new Date() },
      }),
    ]);
  }

  const cashAmount = validatedPayment.cash;
  if (cashAmount > 0) {
    await tx.cashBook.create({
      data: {
        shopId, type: 'sale', amount: cashAmount, referenceId: created.id,
        description: paymentType === 'Split' ? `Split Sale (Cash portion): ${invoice_number}` : `Cash Sale: ${invoice_number}`,
      },
    });
  }

  return { sale: created, totalAmount, invoice_number };
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
  netQuantitiesByProduct: Map<string, number>,
  lotRestores?: Map<string, number>
) {
  await prisma.stockMovement.deleteMany({ where: { shopId, referenceId: saleId, type: 'sale' } });

  // Exact: the lots the sale really drew from (all packages). Only when the sale has no lot record at all
  // does the old "latest lot" convention apply (wholesale tier only).
  if (lotRestores && lotRestores.size) { await restoreToDrawnLots(prisma, shopId, lotRestores); return; }
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

/**
 * Just the batch-quantity-restore half of cleanupSaleBatches, WITHOUT the
 * StockMovement delete — for the edit flow (PATCH /billing/[identifier]),
 * which reverses the old sale and re-creates it (via createSaleEffects)
 * under the SAME id in one transaction. createSaleEffects already inserts
 * fresh StockMovement rows for the edited items using that same id, so
 * running the combined cleanupSaleBatches afterward would wipe out those
 * brand-new rows along with the old ones. The edit route deletes the OLD
 * movement rows itself, inside the transaction, before re-creating — this
 * only needs to do the wholesale-tier batch-quantity restore afterward.
 */
export async function restoreBatchQuantities(
  prisma: PrismaClient,
  shopId: string,
  packageType: string | null | undefined,
  netQuantitiesByProduct: Map<string, number>,
  lotRestores?: Map<string, number>
) {
  if (lotRestores && lotRestores.size) { await restoreToDrawnLots(prisma, shopId, lotRestores); return; }
  if (!isWholesaleTierPackage(packageType)) return;
  for (const [productId, qty] of netQuantitiesByProduct.entries()) {
    if (qty <= 0) continue;
    const latestBatch = await prisma.batch.findFirst({ where: { productId, shopId }, orderBy: { createdAt: 'desc' } });
    if (latestBatch) {
      await prisma.batch.update({ where: { id: latestBatch.id }, data: { quantity: { increment: qty } } });
    }
  }
}

/** Puts quantity back on the exact lots a deleted/edited sale drew from. Lots that no longer exist are skipped. */
export async function restoreToDrawnLots(prisma: Prisma.TransactionClient | PrismaClient, shopId: string, lotRestores: Map<string, number>) {
  const entries = [...lotRestores.entries()].filter(([, qty]) => qty > 0);
  if (!entries.length) return;
  // One statement for all lots (the DB sits behind a pooler: every round trip counts inside a transaction).
  await (prisma as any).$executeRawUnsafe(
    `UPDATE batches SET quantity = batches.quantity + v.qty
       FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::numeric[]) AS qty) AS v
      WHERE batches.id = v.id::uuid AND batches.shop_id = $3::uuid`,
    entries.map(([id]) => id), entries.map(([, qty]) => qty), shopId,
  );
}

/**
 * Lot draws for a sale that createSaleEffects just created (the bill-edit flow): takes each line's quantity from
 * the shop's live lots — the line's own lot when one is named (batch_id), otherwise oldest lot first — and writes
 * SaleItemBatch rows (qty, cost, selling price) plus the lot quantity decrement, exactly like a fresh POST /billing.
 * Edit never fails on a lot shortfall: a stale lot just falls back to old-lot-first, and stock no lot can cover
 * stays untracked (product-level stock was already handled by the caller).
 */
export async function recordLotDraws(
  tx: Prisma.TransactionClient,
  shopId: string,
  createdItems: Array<{ id: string; productId: string | null }>,
  inputItems: any[],
  productById: Map<string, any>,
) {
  const productIds = Array.from(new Set(createdItems.map((i) => i.productId).filter(Boolean))) as string[];
  if (!productIds.length) return;
  const live = await tx.batch.findMany({ where: { shopId, productId: { in: productIds }, quantity: { gt: 0 } }, orderBy: { createdAt: 'asc' } });
  if (!live.length) return;
  const variantKeys = await readLotVariantKeys(tx as any, live.map((b) => b.id));
  const byProduct = new Map<string, Array<(typeof live)[number] & { variantKey?: string | null }>>();
  for (const b of live) byProduct.set(b.productId, [...(byProduct.get(b.productId) || []), { ...b, variantKey: variantKeys.get(b.id) ?? null }]);
  const remaining = new Map<string, number>(live.map((b) => [b.id, b.quantity]));

  const drawRows: Array<{ saleItemId: string; batchId: string; quantity: number; costAtSale: number }> = [];
  const priceRows: Array<{ saleItemId: string; batchId: string; price: number }> = [];
  createdItems.forEach((saleItem, idx) => {
    const raw = inputItems[idx];
    if (!saleItem.productId || !raw) return;
    const lots = byProduct.get(saleItem.productId) || [];
    if (!lots.length) return;
    const qty = Number(raw.quantity) || 0;
    const variant = (typeof raw.variant === 'string' ? raw.variant : '') || null;
    const price = Number(raw.price_per_unit ?? raw.pricePerUnit ?? raw.price) || 0;
    const pinned = raw.batch_id || raw.batchId || null;
    const pinnedLive = pinned ? lots.find((l) => l.id === pinned && (remaining.get(l.id) || 0) > 0) : null;
    let alloc = allocateFromLots(lots as any, remaining, qty, { pinnedId: pinnedLive ? pinned : null, variantKey: variant });
    if (pinnedLive && alloc.shortfall > 0) {
      const rest = allocateFromLots(lots as any, remaining, alloc.shortfall, { variantKey: variant });
      alloc = { draws: [...alloc.draws, ...rest.draws], shortfall: rest.shortfall, pinnedShort: false };
    }
    const dbProduct = productById.get(saleItem.productId);
    for (const d of alloc.draws) {
      const lot = lots.find((l) => l.id === d.batchId)!;
      const cost = Number(lot.costPrice) || Number(dbProduct?.costPrice) || Number(dbProduct?.wholesaleCost) || 0;
      drawRows.push({ saleItemId: saleItem.id, batchId: d.batchId, quantity: d.quantity, costAtSale: cost });
      priceRows.push({ saleItemId: saleItem.id, batchId: d.batchId, price });
    }
  });
  if (!drawRows.length) return;

  await tx.saleItemBatch.createMany({ data: drawRows });
  await savePriceAtSale(tx as any, priceRows);
  const consumed = live
    .map((b) => ({ id: b.id, used: b.quantity - (remaining.get(b.id) ?? b.quantity) }))
    .filter((u) => u.used > 0);
  if (consumed.length) {
    await tx.$executeRawUnsafe(
      `UPDATE batches SET quantity = batches.quantity - v.used
         FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::numeric[]) AS used) AS v
        WHERE batches.id = v.id::uuid`,
      consumed.map((u) => u.id), consumed.map((u) => u.used),
    );
  }
}
