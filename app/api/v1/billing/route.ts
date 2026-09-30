import { resolveAmountPaid, validatePaymentDetails, resolveLineCost } from '@/lib/server/moneyValidation';
import crypto from 'crypto';
import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { invalidateDashboardCacheForShop } from '@/lib/server/dashboardCache';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { checkLargeTransactionAlert, checkLowStockAlerts } from '@/lib/server/notificationsEngine';
import { calculateInvoice, InputLineItem, DiscountInput, BillType } from '@/lib/financialEngine';
import { isMillBillingPackage, isWholesaleTierPackage } from '@/lib/config/packageConfig';
import { withTenantIdempotency } from '@/lib/server/idempotency';
import { assertOwned } from '@/lib/server/ownership';
import { handleMillSale } from '@/lib/server/millSale';
import { keysMatch, variantKeyOf as variantKeyOfRow, openVariantStores, adjustVariantStores, closeVariantStores, variantAvailable } from '@/lib/variants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const shopId = shop.id;
  const body = await readBody(req);

  // Mill Billing (Bada Udyog `mill_v2`) — additive early branch. A request WITHOUT `billing_model` (every existing
  // client, and every previously-queued offline bill) skips this and runs the unchanged legacy path below.
  if (body.billing_model !== undefined && body.billing_model !== null) {
    return handleMillSale(req, shop, body);
  }
  // Bada Udyog package = Mill Billing. A Bada Udyog shop can NOT create a legacy / unmarked sale through a direct API call:
  // no billing_model → rejected here, before any legacy processing (never a silent fallback to legacy billing).
  if (isMillBillingPackage(shop.packageType)) {
    throw new ApiError(400, 'Bada Udyog billing must be created as a Mill invoice (billing_model "mill_v2"). Legacy billing is not available for this package.', 'MILL_BILLING_REQUIRED');
  }

  const customerId = (body.customer_id && body.customer_id !== '') ? body.customer_id : null;
  const items = body.items;

  const idempotencyKey = req.headers.get('x-idempotency-key') || body.idempotencyKey || body.idempotency_key || null;
  const deviceId = req.headers.get('x-device-id') || body.deviceId || body.device_id || null;
  const localId = body.localId || body.local_id || body.localTransactionId || null;
  const offlineRefNumber = body.offlineRefNumber || body.offline_ref_number || null;
  const allowNegativeStock = Boolean((shop as any).allowNegativeStock) // policy is the shop's server-side setting; a client flag is ignored;

  if (!items || !items.length) throw new ApiError(400, 'No items in bill');
  
  // Validation: Check for negative or zero quantities and prices
  for (const item of items) {
    if (item.quantity <= 0) throw new ApiError(400, `Invalid quantity for item ${item.product_id || item.productId}`);
    const price = item.price_per_unit ?? item.pricePerUnit;
    if (price < 0) throw new ApiError(400, `Invalid price for item ${item.product_id || item.productId}`);
  }

  // Every id the client references must belong to THIS shop before anything is
  // read or written — otherwise a foreign product_id / customer_id decrements
  // another shop's stock and moves its customer's dues.
  await assertOwned(shopId, {
    customerId,
    productId: items.map((i: any) => i.product_id || i.productId),
  });

  // Fetch product purchase costs & GST rates from DB for authoritative financial calculation
  const productIds = Array.from(new Set(items.map((i: any) => i.product_id || i.productId).filter(Boolean)));
  const products = productIds.length > 0
    ? await prisma.product.findMany({ where: { id: { in: productIds as string[] }, shopId } })
    : [];
  const productMap = new Map(products.map(p => [p.id, p]));

  // Server-side stock guard — provisional offline sales are validated against authoritative server stock
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
    const vKey = variantKeyOf(it.variant);
    const key = `${pid}|${vKey}`;
    perLineDemand.set(key, (perLineDemand.get(key) || 0) + Number(it.quantity || 0));
  }
  const shortages: string[] = [];
  for (const [key, wanted] of perLineDemand.entries()) {
    const [pid, vKey] = key.split('|');
    const dbP: any = productMap.get(pid);
    if (!dbP) { shortages.push(`Unknown product ${pid}`); continue; }

    let available: number | null = vKey ? variantAvailable(dbP, vKey) : null;
    if (available === null) {
      available = Number(dbP.currentStock ?? 0);
    }

    if (available < wanted) {
      const label = vKey ? `${dbP.name} (${vKey})` : dbP.name;
      shortages.push(`${label}: only ${available} in stock, bill needs ${wanted}`);
    }
  }

  if (shortages.length > 0 && !allowNegativeStock) {
    throw new ApiError(409, `STOCK_CONFLICT: ${shortages.join('; ')}`);
  }

  const inputLineItems: InputLineItem[] = items.map((i: any) => {
    const pid = i.product_id || i.productId;
    const dbProduct = pid ? productMap.get(pid) : null;
    const sp = Number(i.price_per_unit ?? i.pricePerUnit ?? i.price) || 0;

    // Cost basis, in priority order:
    //   1. Whatever the client explicitly sent for this line (purchase_price
    //      / purchasePrice / cost) — always wins, lets the shopkeeper
    //      override for a one-off item.
    //   2. Per-variant costPrice from Product.variants[] — Udyog stores the
    //      real cost here per size/colour, and any single variant may have
    //      been bought at a different price. Match by the exact
    //      "colour / size" key the sale row carries.
    //   3. Product.costPrice — the top-level real cost. On Udyog packages
    //      wholesaleCost is REPURPOSED as "wholesale selling price" (see
    //      memory: udyog-three-tier-pricing), so it MUST NOT be used as
    //      cost basis or profit turns negative on Udyog shops. Legacy
    //      Vyapar/Dukan shops store cost in wholesaleCost with costPrice
    //      null, so wholesaleCost remains the fallback for them.
    //   4. Product.wholesaleCost — legacy Vyapar/Dukan cost column.
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

  const invoice_number = body.invoice_number || `INV-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

  let sale;
  try {
    const idempotencyOutcome = await prisma.$transaction(async (tx) => {
      return await withTenantIdempotency(tx, {
        shopId,
        idempotencyKey,
        deviceId,
        entityType: 'sale',
        localId,
        handler: async () => {
          let finalCustomerId = customerId;

          if (!finalCustomerId && body.customer_name) {
            const existing = await tx.customer.findFirst({
              where: { shopId, name: body.customer_name }
            });
            
            if (existing) {
              finalCustomerId = existing.id;
              if ((body.customer_mobile && !existing.mobile) || (body.customer_email && !existing.email) || (body.customer_address && !existing.address)) {
                await tx.customer.update({
                  where: { id: existing.id, shopId },
                  data: {
                    ...(body.customer_mobile && !existing.mobile ? { mobile: body.customer_mobile } : {}),
                    ...(body.customer_email && !existing.email ? { email: body.customer_email } : {}),
                    ...(body.customer_address && !existing.address ? { address: body.customer_address } : {})
                  }
                });
              }
            } else {
              const newCust = await tx.customer.create({
                data: {
                  shopId,
                  name: body.customer_name,
                  mobile: body.customer_mobile || null,
                  email: body.customer_email || null,
                  address: body.customer_address || null,
                  totalDue: 0
                }
              });
              finalCustomerId = newCust.id;
            }
          }

          // ---- Deterministic row-locking for products and active batches
          const billProductIds = Array.from(new Set(items.map((i: any) => i.product_id || i.productId).filter(Boolean))) as string[];
          const sortedProductIds = [...billProductIds].sort();

          // Batch both locks into single queries (2 round trips instead of 2×N)
          if (sortedProductIds.length > 0) {
            await tx.$executeRawUnsafe(
              `SELECT id FROM products WHERE id = ANY($1::uuid[]) AND shop_id = $2::uuid ORDER BY id ASC FOR UPDATE`,
              sortedProductIds, shopId
            );
            await tx.$executeRawUnsafe(
              `SELECT id FROM batches WHERE product_id = ANY($1::uuid[]) AND shop_id = $2::uuid AND quantity > 0 ORDER BY id ASC FOR UPDATE`,
              sortedProductIds, shopId
            );
          }

          if (finalCustomerId) {
            await tx.$queryRaw`
              SELECT id FROM customers
              WHERE id = ${finalCustomerId}::uuid AND shop_id = ${shopId}::uuid
              FOR UPDATE
            `;
          }

          // ---- Batch-aware costing pass
          const [billProducts, activeBatches] = await Promise.all([
            tx.product.findMany({ where: { id: { in: billProductIds }, shopId } }),
            tx.batch.findMany({ where: { productId: { in: billProductIds }, shopId, quantity: { gt: 0 } }, orderBy: { createdAt: 'asc' } }),
          ]);
          const billProductMap = new Map(billProducts.map((p) => [p.id, p]));
          const batchesByProduct = new Map<string, typeof activeBatches>();
          for (const b of activeBatches) {
            if (!batchesByProduct.has(b.productId)) batchesByProduct.set(b.productId, []);
            batchesByProduct.get(b.productId)!.push(b);
          }
          const batchRemaining = new Map<string, number>();
          for (const b of activeBatches) batchRemaining.set(b.id, b.quantity);

          const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
          const fallbackCost = (dbProduct: any, variant: string | null): number => {
            let cp = 0;
            if (dbProduct) {
              if (variant && Array.isArray(dbProduct.variants)) {
                for (const v of dbProduct.variants as any[]) {
                  if (keysMatch(variantKeyOfRow(v), variant)) { cp = Number(v.costPrice) || Number(v.wholesalePrice) || 0; break; }
                }
              }
              if (!cp) cp = Number(dbProduct.costPrice) || Number(dbProduct.wholesaleCost) || 0;
            }
            return cp;
          };

          const batchAwareLineItems: InputLineItem[] = [];
          const originalIndexByLineIndex: number[] = [];
          const batchDrawsByOriginalIndex: { batchId: string; quantity: number; costAtSale: number }[][] = items.map(() => []);

          items.forEach((i: any, origIdx: number) => {
            const pid = i.product_id || i.productId;
            const dbProduct = pid ? billProductMap.get(pid) : null;
            const sp = Number(i.price_per_unit ?? i.pricePerUnit ?? i.price) || 0;
            const qty = Number(i.quantity) || 0;
            const unit = i.unit || dbProduct?.baseUnit || null;
            const variant = i.variant || null;
            const gstRate = Number(i.gst_percent ?? i.gstPercent ?? dbProduct?.gstPercent) || 0;
            const hsn = i.hsn_code || i.hsnCode || dbProduct?.hsnCode || null;

            const pushLine = (lineQty: number, purchasePrice: number) => {
              if (lineQty <= 0) return;
              batchAwareLineItems.push({ productId: pid || null, unit, variant, quantity: lineQty, sellingPrice: sp, purchasePrice, gstPercent: gstRate, hsnCode: hsn });
              originalIndexByLineIndex.push(origIdx);
            };

            const pBatches = pid ? (batchesByProduct.get(pid) || []) : [];

            if (!pBatches.length) {
              pushLine(qty, resolveLineCost(i, dbProduct, sp));
              return;
            }

            const targetId = i.batch_id || i.batchId || null;
            const ordered = targetId
              ? [...pBatches.filter((b) => b.id === targetId), ...pBatches.filter((b) => b.id !== targetId)]
              : pBatches;

            let remainingQty = qty;
            for (const batch of ordered) {
              if (remainingQty <= 0) break;
              const avail = batchRemaining.get(batch.id) || 0;
              if (avail <= 0) continue;
              const take = Math.min(avail, remainingQty);
              batchRemaining.set(batch.id, avail - take);
              const cost = Number(batch.costPrice) || fallbackCost(dbProduct, variant);
              pushLine(take, cost);
              batchDrawsByOriginalIndex[origIdx].push({ batchId: batch.id, quantity: take, costAtSale: cost });
              remainingQty -= take;
            }
            if (remainingQty > 0) pushLine(remainingQty, fallbackCost(dbProduct, variant));
          });

          const batchAwareCalc = calculateInvoice(batchAwareLineItems, discountInput, billType);
          const batchAwareTotalProfit = batchAwareCalc.totalProfit;

          const mergedByOriginal = new Map<number, { quantity: number; netProfit: number }>();
          batchAwareCalc.items.forEach((cItem, i) => {
            const origIdx = originalIndexByLineIndex[i];
            const acc = mergedByOriginal.get(origIdx) || { quantity: 0, netProfit: 0 };
            acc.quantity += cItem.quantity;
            acc.netProfit += cItem.netProfit;
            mergedByOriginal.set(origIdx, acc);
          });

          const created = await tx.sale.create({
            data: {
              shopId,
              customerId: finalCustomerId,
              totalAmount,
              totalProfit: batchAwareTotalProfit,
              paymentType,
              amountPaid,
              paymentDetails,
              invoice_number,
              offlineRefNumber,
              billType,
              gstAmount,
              gstDetails: body.gst_details ?? undefined,
              billImageUrl: body.bill_image_url || null,
              isManual: body.is_manual === true,
              createdAt: body.created_at ? new Date(body.created_at) : undefined,
              items: {
                create: items.map((rawItem: any, idx: number) => {
                  const pid = rawItem.product_id || rawItem.productId;
                  const merged = mergedByOriginal.get(idx);
                  const sp = Number(rawItem.price_per_unit ?? rawItem.pricePerUnit ?? rawItem.price) || 0;
                  const qty = merged ? merged.quantity : (Number(rawItem.quantity) || 0);
                  const marginPerUnit = merged && qty > 0 ? round2(merged.netProfit / qty) : 0;
                  const rawName = rawItem.name || rawItem.product_name || rawItem.title || rawItem.itemName;
                  return {
                    productId: pid || null,
                    unit: rawItem.unit || billProductMap.get(pid)?.baseUnit || null,
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

          // SaleItemBatch rows — the durable record of which batch(es) each
          // line actually drew from, at that batch's real cost.
          const saleItemBatchRows: { saleItemId: string; batchId: string; quantity: number; costAtSale: number }[] = [];
          created.items.forEach((saleItem, idx) => {
            for (const draw of batchDrawsByOriginalIndex[idx] || []) {
              saleItemBatchRows.push({ saleItemId: saleItem.id, batchId: draw.batchId, quantity: draw.quantity, costAtSale: draw.costAtSale });
            }
          });

          const itemGroups = items.reduce((acc: any, item: any) => {
            const pid = item.product_id || item.productId;
            if (!pid) return acc;
            if (!acc[pid]) acc[pid] = [];
            acc[pid].push(item);
            return acc;
          }, {});

          const productIds = Object.keys(itemGroups);
          if (productIds.length > 0) {
            if (saleItemBatchRows.length) {
              await tx.saleItemBatch.createMany({ data: saleItemBatchRows });
            }
            // Batch-update all consumed batches in one query instead of N sequential updates
            const batchUpdates = activeBatches
              .map(b => ({ id: b.id, consumed: b.quantity - (batchRemaining.get(b.id) ?? b.quantity) }))
              .filter(u => u.consumed > 0);
            if (batchUpdates.length > 0) {
              const ids = batchUpdates.map(u => u.id);
              const amounts = batchUpdates.map(u => u.consumed);
              await tx.$executeRawUnsafe(
                `UPDATE batches SET quantity = batches.quantity - v.consumed
                 FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::numeric[]) AS consumed) AS v
                 WHERE batches.id = v.id::uuid`,
                ids, amounts
              );
            }

            // Compute per-product totals and variant JSON updates in JS first
            const stockDecrements: { id: string; qty: number }[] = [];
            const variantUpdates: { id: string; size_variants?: string; variants?: any }[] = [];
            const stockMovements: { productId: string; qty: number }[] = [];

            for (const product of billProducts) {
              const productItems = itemGroups[product.id];
              if (!productItems) continue;
              let totalQty = 0;
              const stores = openVariantStores(product);
              for (const item of productItems) {
                totalQty += item.quantity;
                if (item.variant) {
                  const r = adjustVariantStores(stores, item.variant, -item.quantity, { rejectNegative: !allowNegativeStock });
                  if (r === 'insufficient') throw new ApiError(409, `STOCK_CONFLICT: Insufficient stock for ${product.name} (${item.variant})`);
                  if (r === 'missing') console.warn(`[billing] variant "${item.variant}" not found on product ${product.id}; only total stock reduced`);
                }
              }
              const storeWrite = closeVariantStores(stores);
              
              stockDecrements.push({ id: product.id, qty: totalQty });
              if (Object.keys(storeWrite).length > 0) variantUpdates.push({ id: product.id, ...storeWrite });
              if (isWholesaleTierPackage(shop.packageType)) {
                stockMovements.push({ productId: product.id, qty: totalQty });
              }
            }

            // Batch current_stock decrements — 1 query instead of N
            if (stockDecrements.length > 0) {
              if (!allowNegativeStock) {
                // Must be per-product to detect which one ran out
                for (const { id, qty } of stockDecrements) {
                  const updatedCount = await tx.$executeRawUnsafe(
                    `UPDATE products SET current_stock = COALESCE(current_stock, 0) - $1 WHERE id = $2::uuid AND shop_id = $3::uuid AND COALESCE(current_stock, 0) >= $1`,
                    qty, id, shopId
                  );
                  if (updatedCount === 0) {
                    const p = billProductMap.get(id);
                    throw new ApiError(409, `STOCK_CONFLICT: Insufficient stock for ${p?.name ?? id}`);
                  }
                }
              } else {
                // All at once
                const pids = stockDecrements.map(d => d.id);
                const qtys = stockDecrements.map(d => d.qty);
                await tx.$executeRawUnsafe(
                  `UPDATE products SET current_stock = COALESCE(current_stock, 0) - v.qty
                   FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::numeric[]) AS qty) AS v
                   WHERE products.id = v.id::uuid AND shop_id = $3::uuid`,
                  pids, qtys, shopId
                );
              }
            }

            // Variant JSON updates (only products that actually changed)
            for (const u of variantUpdates) {
              await tx.product.update({
                where: { id: u.id, shopId },
                data: {
                  ...(u.size_variants !== undefined ? { size_variants: u.size_variants } : {}),
                  ...(u.variants !== undefined ? { variants: u.variants as any } : {}),
                },
              });
            }

            // Wholesale stock movements
            if (stockMovements.length > 0) {
              await tx.stockMovement.createMany({
                data: stockMovements.map(m => ({ shopId, productId: m.productId, type: 'sale', quantity: m.qty, referenceId: created.id })),
              });
            }
          }

          if (outstandingAmount > 0 && finalCustomerId) {
            const custData = await tx.customer.findFirst({ where: { id: finalCustomerId, shopId } });
            if (custData && (custData.creditLimit ?? 0) > 0) {
              const currentDue = custData.totalDue || 0;
              if (currentDue + outstandingAmount > custData.creditLimit!) {
                throw new ApiError(400, `Credit Limit of ₹${custData.creditLimit} exceeded by ₹${(currentDue + outstandingAmount) - custData.creditLimit!}`);
              }
            }
            
            await tx.customer.update({
              where: { id: finalCustomerId, shopId },
              data: { totalDue: { increment: outstandingAmount } },
            });
            await tx.customer_transactions.create({
              data: {
                customer_id: finalCustomerId,
                type: 'udhar',
                amount: outstandingAmount,
                note: `Bill: ${invoice_number}`,
                bill_number: invoice_number,
                created_at: new Date()
              }
            });
          }

      const cashAmount = validatedPayment.cash;
      if (cashAmount > 0) {
        await tx.cashBook.create({
          data: {
            shopId: shop.id,
            type: 'sale',
            amount: cashAmount,
            referenceId: created.id,
            description: paymentType === 'Split' ? `Split Sale (Cash portion): ${invoice_number}` : `Cash Sale: ${invoice_number}`
          }
        });
      }

      return { serverId: created.id, response: created };
    },
  });
}, {
  maxWait: 30000, // 30 seconds
  timeout: 60000  // 60 seconds
});

sale = idempotencyOutcome.result;

try {
  if (!idempotencyOutcome.isDuplicate) {
    (async () => {
      try {
        await checkLargeTransactionAlert(prisma, shop.id, totalAmount, 'sale', invoice_number);
        const productIds = Array.from(new Set(items.map((i: any) => i.product_id || i.productId).filter(Boolean)));
        if (productIds.length) await checkLowStockAlerts(prisma, shop.id, productIds as string[]);
      } catch (e) {
        console.error('Notification failed', e);
      }
    })();

    prisma.activityLog.create({
      data: {
        shopId: shop.id,
        action: 'bill_created',
        entityId: sale.id,
        details: { invoice: invoice_number, total: totalAmount }
      }
    }).catch(e => console.error('Activity log failed', e));
  }
} catch(e) {}

} catch (err: any) {
  if (err instanceof ApiError) {
    return json({
      error: err.message,
      detail: err.message,
      code: err.status === 409 ? 'STOCK_CONFLICT' : undefined
    }, err.status);
  }
  console.error('Billing error:', err?.message, err?.stack);
  try {
    require('fs').writeFileSync('error.log', JSON.stringify({ message: err?.message, stack: err?.stack }, null, 2));
  } catch {}
  return json({
    detail: err?.message || err?.toString() || 'Unknown error',
    stack: err?.stack,
    name: err?.name
  }, 500);
}
invalidateDashboardCacheForShop(shopId);
return json(sale, 201);
});

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const sales = await prisma.sale.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: 'desc' },
    include: {
      customer: { select: { name: true, mobile: true, email: true } },
      // Item NAMES only (not price/qty/etc) — just enough for the invoice
      // list row to show what was actually sold ("Rice, Sugar +2 more")
      // instead of the placeholder "? items" it fell back to before, since
      // this list endpoint never carried `items` at all and the list row's
      // `items?.length` was always undefined. Keeping this to name-only
      // avoids bloating a query that already returns every sale for the shop.
      //
      // SaleItem.itemName is ONLY populated for manual/free-text items (see
      // POST above — `itemName: pid ? null : ...`); a normal product-linked
      // line has it null and its real name lives on the linked Product
      // instead, so that has to be selected too or every ordinary sale shows
      // "N items" instead of the product name.
      items: { select: { itemName: true, product: { select: { name: true } } } },
    },
  });
  return json(
    sales.map((s) => ({
      id: s.id,
      invoice_number: s.invoice_number,
      total_amount: s.totalAmount,
      payment_type: s.paymentType,
      amount_paid: s.amountPaid,
      payment_details: s.paymentDetails,
      bill_type: s.billType,
      gst_amount: s.gstAmount,
      gst_details: s.gstDetails,
      // Mill Billing fields (null on every legacy sale)
      pricing_model: (s as any).pricingModel ?? null,
      discount_amount: (s as any).discountAmount ?? null,
      charges: (s as any).charges ?? null,
      charges_total: (s as any).chargesTotal ?? null,
      round_off_amount: (s as any).roundOffAmount ?? null,
      is_manual: s.isManual,
      bill_image_url: s.billImageUrl,
      customer_name: s.customer?.name || null,
      customer_mobile: s.customer?.mobile || null,
      customer_email: s.customer?.email || null,
      created_at: s.createdAt,
      item_count: s.items.length,
      item_names: s.items.map((i) => i.itemName || i.product?.name).filter(Boolean),
    })),
  );
});
