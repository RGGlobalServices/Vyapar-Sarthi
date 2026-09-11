import crypto from 'crypto';
import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { invalidateDashboardCacheForShop } from '@/lib/server/dashboardCache';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { checkLargeTransactionAlert, checkLowStockAlerts } from '@/lib/server/notificationsEngine';
import { calculateInvoice, InputLineItem, DiscountInput, BillType } from '@/lib/financialEngine';
import { isWholesaleTierPackage } from '@/lib/config/packageConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const shopId = shop.id;
  const body = await readBody(req);
  const customerId = (body.customer_id && body.customer_id !== '') ? body.customer_id : null;
  const items = body.items;

  if (!items || !items.length) throw new ApiError(400, 'No items in bill');
  
  // Validation: Check for negative or zero quantities and prices
  for (const item of items) {
    if (item.quantity <= 0) throw new ApiError(400, `Invalid quantity for item ${item.product_id || item.productId}`);
    const price = item.price_per_unit ?? item.pricePerUnit;
    if (price < 0) throw new ApiError(400, `Invalid price for item ${item.product_id || item.productId}`);
  }

  // Fetch product purchase costs & GST rates from DB for authoritative financial calculation
  const productIds = Array.from(new Set(items.map((i: any) => i.product_id || i.productId).filter(Boolean)));
  const products = productIds.length > 0
    ? await prisma.product.findMany({ where: { id: { in: productIds as string[] } } })
    : [];
  const productMap = new Map(products.map(p => [p.id, p]));

  // Server-side stock guard — a UI bypass, direct API call, or race between two
  // billing tabs must not push currentStock below zero. Groups per-line demand
  // by product+variant (the same product on two lines still adds up) and
  // rejects the whole bill up front with a single message naming what's short,
  // so the shopkeeper never has to reconcile a half-committed sale. Manual/
  // custom items (no product_id) skip this — they don't touch inventory.
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

    let available: number | null = null;
    // Variant-tracked products (Udyog per-colour/size in variants[], or
    // Vyapar/Dukan per-size in size_variants) hold stock per row — validate
    // that row, not the total.
    if (vKey) {
      const sv: any = typeof dbP.size_variants === 'string'
        ? (() => { try { return JSON.parse(dbP.size_variants); } catch { return null; } })()
        : dbP.size_variants;
      if (sv && Object.prototype.hasOwnProperty.call(sv, vKey)) {
        available = Number(sv[vKey]) || 0;
      } else if (Array.isArray(dbP.variants) && dbP.variants.length > 0) {
        const row = dbP.variants.find((v: any) => {
          const k = v.color ? `${v.color} / ${v.size || ''}` : (v.size || '');
          return k === vKey;
        });
        if (row) available = Number(row.stock) || 0;
      }
    }
    // Fall through to product-level currentStock for non-variant lines, or
    // when the variant key doesn't match any tracked row (treat that as the
    // aggregate limit — same as the client's resolveStock does).
    if (available === null) {
      available = Number(dbP.currentStock ?? 0);
    }

    if (available < wanted) {
      const label = vKey ? `${dbP.name} (${vKey})` : dbP.name;
      shortages.push(`${label}: only ${available} in stock, bill needs ${wanted}`);
    }
  }
  if (shortages.length > 0) {
    throw new ApiError(400, `Insufficient stock: ${shortages.join('; ')}`);
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
    let cp = Number(i.purchase_price) || Number(i.purchasePrice) || Number(i.cost) || 0;
    if (!cp && dbProduct) {
      const variantKey = i.variant || null;
      if (variantKey && Array.isArray(dbProduct.variants)) {
        for (const v of dbProduct.variants as any[]) {
          const key = v.color ? `${v.color} / ${v.size || ''}` : (v.size || '');
          if (key === variantKey) {
            cp = Number(v.costPrice) || Number(v.wholesalePrice) || 0;
            break;
          }
        }
      }
      if (!cp) cp = Number(dbProduct.costPrice) || Number(dbProduct.wholesaleCost) || 0;
    }
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
  const amountPaid = typeof body.amount_paid !== 'undefined' ? Number(body.amount_paid) : (paymentType === 'Udhar' ? 0 : totalAmount);
  const paymentDetails = body.payment_details || {};
  const outstandingAmount = Math.max(0, totalAmount - amountPaid);

  if (outstandingAmount > 0 && (!customerId && !body.customer_name)) {
    throw new ApiError(400, 'Customer is required for Udhar / Outstanding amounts');
  }

  const invoice_number = `INV-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

  let sale;
  try {
    sale = await prisma.$transaction(async (tx) => {
      let finalCustomerId = customerId;

      if (!finalCustomerId && body.customer_name) {
        const existing = await tx.customer.findFirst({
          where: { shopId, name: body.customer_name }
        });
        
        if (existing) {
          finalCustomerId = existing.id;
          if ((body.customer_mobile && !existing.mobile) || (body.customer_email && !existing.email) || (body.customer_address && !existing.address)) {
            await tx.customer.update({
              where: { id: existing.id },
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

      // ---- Batch-aware costing pass. Batch consumption used to be
      // wholesale/Udyog-tier only; it's now unconditional — a Dukan/Vyapar
      // product with zero Batch rows (the overwhelming majority, day one)
      // has an empty `pBatches` below and falls straight through to the
      // exact same product/variant cost cascade as before, so nothing
      // changes for shops that haven't started batch-tracking anything.
      // Only totalPROFIT changes here — totalAmount (the customer's bill)
      // was already computed above from sellingPrice alone, which never
      // depends on cost, so it stays exactly what the pre-transaction
      // validation/payment logic already agreed on.
      const billProductIds = Array.from(new Set(items.map((i: any) => i.product_id || i.productId).filter(Boolean))) as string[];
      const [billProducts, activeBatches] = await Promise.all([
        tx.product.findMany({ where: { id: { in: billProductIds } } }),
        tx.batch.findMany({ where: { productId: { in: billProductIds }, shopId, quantity: { gt: 0 } }, orderBy: { createdAt: 'asc' } }),
      ]);
      const billProductMap = new Map(billProducts.map((p) => [p.id, p]));
      const batchesByProduct = new Map<string, typeof activeBatches>();
      for (const b of activeBatches) {
        if (!batchesByProduct.has(b.productId)) batchesByProduct.set(b.productId, []);
        batchesByProduct.get(b.productId)!.push(b);
      }
      // Mutable "how much is left" per batch, shared across every cart line
      // touching the same product, so two lines for one product can't both
      // think the same units are still available.
      const batchRemaining = new Map<string, number>();
      for (const b of activeBatches) batchRemaining.set(b.id, b.quantity);

      const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
      const fallbackCost = (dbProduct: any, variant: string | null): number => {
        let cp = 0;
        if (dbProduct) {
          if (variant && Array.isArray(dbProduct.variants)) {
            for (const v of dbProduct.variants as any[]) {
              const key = v.color ? `${v.color} / ${v.size || ''}` : (v.size || '');
              if (key === variant) { cp = Number(v.costPrice) || Number(v.wholesalePrice) || 0; break; }
            }
          }
          if (!cp) cp = Number(dbProduct.costPrice) || Number(dbProduct.wholesaleCost) || 0;
        }
        return cp;
      };

      const batchAwareLineItems: InputLineItem[] = [];
      const originalIndexByLineIndex: number[] = [];
      // Per original cart-line index: which Batch(es) it actually drew from,
      // written as SaleItemBatch rows once the SaleItems exist below.
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

        // For a catalog product with live batches, the batch(es) it's
        // actually sold from are the one true cost source — the Billing
        // page has no UI to hand-edit a cart line's cost, so `purchase_price`
        // it sends is always just that same page's own (non-batch-aware)
        // cascade re-computed client-side, not a deliberate override. If
        // batches took a back seat to it, this whole feature would be a
        // no-op on every real sale. A manual item (no product_id) or a
        // product with zero live batches keeps the exact old behaviour:
        // explicit client cost wins, else the product/variant cascade.
        if (!pBatches.length) {
          const explicitCost = Number(i.purchase_price) || Number(i.purchasePrice) || Number(i.cost) || 0;
          pushLine(qty, explicitCost || fallbackCost(dbProduct, variant));
          return;
        }

        // A batch-barcode scan (billing page → useBarcodeScanner) targets a
        // specific batch first; FIFO oldest-first covers the rest — the
        // same order the app already used for auto-FIFO, just also
        // honouring an explicit pick.
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
        // Batches couldn't cover the whole line (oversold vs. tracked lots,
        // or a product only partly batch-tracked) — cost the remainder the
        // old way rather than blocking the sale over a bookkeeping gap.
        if (remainingQty > 0) pushLine(remainingQty, fallbackCost(dbProduct, variant));
      });

      const batchAwareCalc = calculateInvoice(batchAwareLineItems, discountInput, billType);
      const batchAwareTotalProfit = batchAwareCalc.totalProfit;

      // Collapse the (possibly batch-split) calculated lines back to ONE
      // SaleItem per original cart line — the printed bill still shows one
      // row per product; margin becomes a quantity-weighted average when a
      // line actually spanned two differently-costed batches.
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
                // Manual items (no product_id) have no product row to name them —
                // store what the shopkeeper typed so bills/history/PDFs can show it.
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
      // line actually drew from, at that batch's real cost. `created.items`
      // is returned in the same order as the `items: { create: [...] }`
      // array above, so it lines up with batchDrawsByOriginalIndex by index.
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
        const promises: any[] = [];

        if (saleItemBatchRows.length) {
          promises.push(tx.saleItemBatch.createMany({ data: saleItemBatchRows }));
        }
        // Batch quantity decrements — derived from the allocation already
        // computed above (batchRemaining), so this can never disagree with
        // what SaleItemBatch/cost actually charged. Unconditional across
        // all tiers now; a batch that wasn't touched (remaining === original)
        // is simply skipped.
        for (const b of activeBatches) {
          const remaining = batchRemaining.get(b.id) ?? b.quantity;
          const consumed = b.quantity - remaining;
          if (consumed > 0) {
            promises.push(tx.batch.update({ where: { id: b.id }, data: { quantity: { decrement: consumed } } }));
          }
        }

        for (const product of billProducts) {
          const productItems = itemGroups[product.id];
          if (!productItems) continue;
          let totalQty = 0;
          let newSizeVariants = product.size_variants;
          // Udyog variant products (colour/size) carry their own per-row
          // stock here instead of size_variants — decrement the matching
          // row alongside it, same loop, same eventual single update call.
          const newVariants = Array.isArray(product.variants) ? (product.variants as any[]).map(v => ({ ...v })) : null;
          let variantsChanged = false;

          for (const item of productItems) {
            totalQty += item.quantity;
            if (item.variant && newSizeVariants) {
              try {
                const parsed = typeof newSizeVariants === 'string' ? JSON.parse(newSizeVariants) : newSizeVariants;
                if (parsed[item.variant] !== undefined) {
                  parsed[item.variant] = Math.max(0, (parsed[item.variant] || 0) - item.quantity);
                  newSizeVariants = JSON.stringify(parsed);
                }
              } catch {}
            }
            if (item.variant && newVariants) {
              const row = newVariants.find((v: any) => (v.color ? `${v.color} / ${v.size || ''}` : (v.size || '')) === item.variant);
              if (row) {
                row.stock = Math.max(0, (Number(row.stock) || 0) - item.quantity);
                variantsChanged = true;
              }
            }
          }

          // currentStock is nullable with no DB default — it's null for any
          // product that never had an opening stock explicitly set (common
          // for products created via AI import/scan). A plain Prisma
          // `decrement` compiles to SQL `current_stock - N`, and NULL - N is
          // NULL, so the update above used to skip it entirely rather than
          // leave stock silently wrong — which meant it never initialized at
          // all, and a sale against that product looked like it did nothing
          // to Product/Stock section quantities. COALESCE first via raw SQL,
          // same fix already applied to the Purchases routes.
          promises.push(
            tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) - ${totalQty} WHERE id = ${product.id}::uuid`
          );
          promises.push(
            tx.product.update({
              where: { id: product.id },
              data: {
                size_variants: newSizeVariants,
                ...(variantsChanged ? { variants: newVariants as any } : {}),
              },
            })
          );

          if (isWholesaleTierPackage(shop.packageType)) {
            promises.push(
              tx.stockMovement.create({
                data: {
                  shopId: shopId,
                  productId: product.id,
                  type: 'sale',
                  quantity: totalQty,
                  referenceId: created.id,
                }
              })
            );
          }
        }
        await Promise.all(promises);
      }

      if (outstandingAmount > 0 && finalCustomerId) {
        const custData = await tx.customer.findUnique({ where: { id: finalCustomerId }});
        if (custData && (custData.creditLimit ?? 0) > 0) {
          const currentDue = custData.totalDue || 0;
          if (currentDue + outstandingAmount > custData.creditLimit!) {
            throw new Error(`Credit Limit of ₹${custData.creditLimit} exceeded by ₹${(currentDue + outstandingAmount) - custData.creditLimit!}`);
          }
        }
        
        await Promise.all([
          tx.customer.update({
            where: { id: finalCustomerId },
            data: { totalDue: { increment: outstandingAmount } },
          }),
          tx.customer_transactions.create({
            data: {
              customer_id: finalCustomerId,
              type: 'udhar',
              amount: outstandingAmount,
              note: `Bill: ${invoice_number}`,
              bill_number: invoice_number,
              created_at: new Date()
            }
          })
        ]);
      }

      const cashAmount = paymentType === 'Split' ? Number(paymentDetails?.cash || 0) : (paymentType === 'Cash' ? amountPaid : 0);
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

      return created;
    }, {
      maxWait: 10000, // 10 seconds
      timeout: 20000  // 20 seconds
    });

    try {
      prisma.$transaction(async (tx) => {
        await checkLargeTransactionAlert(tx, shop.id, totalAmount, 'sale', invoice_number);
        // Extract unique product IDs. Manual bills carry no real product (product_id
        // is null), which would otherwise land a null in a Prisma `in` filter and error.
        const productIds = Array.from(new Set(items.map((i: any) => i.product_id || i.productId).filter(Boolean)));
        if (productIds.length) await checkLowStockAlerts(tx, shop.id, productIds as string[]);
      }).catch(e => console.error('Notification failed', e));

      // Asynchronously log the activity outside the transaction to prevent blocking
      prisma.activityLog.create({
        data: {
          shopId: shop.id,
          action: 'bill_created',
          entityId: sale.id,
          details: { invoice: invoice_number, total: totalAmount }
        }
      }).catch(e => console.error('Activity log failed', e));

    } catch(e) {}

  } catch (err: any) {
    console.error('Billing error:', err?.message, err?.stack);
    // Best-effort local log — must never block the actual error response.
    // On a read-only serverless filesystem this throws (EROFS), which would
    // otherwise mask the real billing error behind an unrelated crash.
    try {
      require('fs').writeFileSync('error.log', JSON.stringify({ message: err?.message, stack: err?.stack }, null, 2));
    } catch {}
    return json({
      detail: err?.message || err?.toString() || 'Unknown error',
      stack: err?.stack,
      name: err?.name
    }, 500);
  }
  // A new sale changes today's sales/profit, collection, low-stock, top-products,
  // etc. — every card on the dashboard. Drop the cache so the next fetch is fresh.
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
