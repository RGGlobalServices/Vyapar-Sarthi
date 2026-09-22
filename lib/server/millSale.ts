import crypto from 'crypto';
import prisma from '@/lib/server/prisma';
import { ApiError, json } from '@/lib/server/http';
import { assertOwned } from '@/lib/server/ownership';
import { withTenantIdempotency } from '@/lib/server/idempotency';
import { invalidateDashboardCacheForShop } from '@/lib/server/dashboardCache';
import { checkLargeTransactionAlert, checkLowStockAlerts } from '@/lib/server/notificationsEngine';
import { isWholesaleTierPackage } from '@/lib/config/packageConfig';
import { resolveAmountPaid, validatePaymentDetails, resolveLineCost, serverCostFor, toPaise, round2 } from '@/lib/server/moneyValidation';
import {
  calculateMillInvoice,
  MILL_PRICING_MODEL,

  parseStrictNumber,
  type MillInput,
  type MillResult,
} from '@/lib/millBilling';
import {
  assertMillEligibleShop,
  millValidation,
  parseGstInterState,
  parseMillBillType,
  parseMillCharges,
  parseMillDiscount,
  resolveMillLineGstRate,
} from '@/lib/server/billingCharges';

/**
 * POST /billing for `billing_model: 'mill_v2'` (Bada Udyog Mill Billing).
 *
 * Reached ONLY through an additive early branch in app/api/v1/billing/route.ts — the legacy inclusive path is
 * untouched. Everything financial is computed here by lib/millBilling.ts; the client's total_amount / GST /
 * round-off / charges total are never used. Side effects (stock, batches, variants, customer udhar, credit limit,
 * cash book) follow the same rules and the same lock order as the legacy route: shop → products → batches → customer.
 */
export async function handleMillSale(req: Request, shop: any, body: any): Promise<Response> {
  if (body.billing_model !== MILL_PRICING_MODEL) {
    throw new ApiError(400, 'Unsupported billing_model', 'INVALID_BILLING_MODEL');
  }
  assertMillEligibleShop(shop);

  const shopId: string = shop.id;
  const items = body.items;
  if (!Array.isArray(items) || !items.length) throw new ApiError(400, 'No items in bill');

  const customerId = (body.customer_id && body.customer_id !== '') ? body.customer_id : null;
  const idempotencyKey = req.headers.get('x-idempotency-key') || body.idempotencyKey || body.idempotency_key || null;
  const deviceId = req.headers.get('x-device-id') || body.deviceId || body.device_id || null;
  const localId = body.localId || body.local_id || body.localTransactionId || null;
  const offlineRefNumber = body.offlineRefNumber || body.offline_ref_number || null;
  const allowNegativeStock = Boolean(shop.allowNegativeStock); // server-side shop policy only

  // ── 1. Validate everything the client controls (pure, before any DB work) ──
  const billType = parseMillBillType(body.bill_type);
  const interState = parseGstInterState(body);
  const charges = parseMillCharges(body.charges);
  const discount = parseMillDiscount(body.discount);
  const paymentType: string = body.payment_type || 'Cash';

  const parsed = items.map((raw: any, idx: number) => {
    const label = `Item ${idx + 1}`;
    if (!raw || typeof raw !== 'object') throw new ApiError(400, `${label}: invalid item`);
    const qty = millValidation(() => parseStrictNumber(raw.quantity, `${label} quantity`));
    if (!(qty > 0)) throw new ApiError(400, `${label}: quantity must be greater than 0`, 'INVALID_QUANTITY');
    const rate = millValidation(() => parseStrictNumber(raw.price_per_unit ?? raw.pricePerUnit ?? raw.price, `${label} rate`));
    if (rate < 0) throw new ApiError(400, `${label}: rate cannot be negative`, 'INVALID_RATE');
    return { raw, idx, label, qty, rate, pid: (raw.product_id || raw.productId || null) as string | null };
  });

  // Duplicate-from-invoice rules (Phase 1): a copy of a legacy NON-GST invoice stays non-GST; a legacy GST invoice
  // cannot be duplicated into mill billing at all. Enforced server-side from the SOURCE invoice's own data.
  if (body.duplicated_from) {
    const src = await prisma.sale.findFirst({
      where: { id: String(body.duplicated_from), shopId },
      select: { pricingModel: true, billType: true },
    });
    if (!src) throw new ApiError(400, 'duplicated_from invoice not found', 'DUPLICATE_SOURCE_NOT_FOUND');
    if (src.pricingModel !== MILL_PRICING_MODEL) {
      if (src.billType === 'gst') {
        throw new ApiError(409, 'A legacy GST invoice cannot be duplicated into mill billing. Please re-enter the rates.', 'MILL_DUPLICATE_LEGACY_GST_BLOCKED');
      }
      if (billType === 'gst') {
        throw new ApiError(409, 'This bill was copied from a non-GST invoice and cannot be switched to GST. Re-enter the rates to raise a GST bill.', 'MILL_DUPLICATE_GST_SWITCH_BLOCKED');
      }
    }
  }

  await assertOwned(shopId, { customerId, productId: parsed.map((p: any) => p.pid) });

  const productIds = Array.from(new Set(parsed.map((p: any) => p.pid).filter(Boolean))) as string[];
  const products = productIds.length ? await prisma.product.findMany({ where: { id: { in: productIds }, shopId } }) : [];
  const productMap = new Map(products.map((p: any) => [p.id, p]));

  // Stock guard (fast reject on current data; the authoritative check is the atomic update inside the transaction)
  const variantKeyOf = (raw: any): string => {
    if (!raw) return '';
    if (typeof raw === 'string') return raw;
    const color = raw.color || raw.colour || '';
    const size = raw.size || '';
    return color ? `${color} / ${size}` : size;
  };
  const demand = new Map<string, number>();
  for (const p of parsed) {
    if (!p.pid) continue;
    const key = `${p.pid}|${variantKeyOf(p.raw.variant)}`;
    demand.set(key, (demand.get(key) || 0) + p.qty);
  }
  const shortages: string[] = [];
  for (const [key, wanted] of demand.entries()) {
    const [pid, vKey] = key.split('|');
    const dbP: any = productMap.get(pid);
    if (!dbP) { shortages.push(`Unknown product ${pid}`); continue; }
    let available: number | null = null;
    if (vKey) {
      const sv: any = typeof dbP.size_variants === 'string' ? (() => { try { return JSON.parse(dbP.size_variants); } catch { return null; } })() : dbP.size_variants;
      if (sv && Object.prototype.hasOwnProperty.call(sv, vKey)) available = Number(sv[vKey]) || 0;
      else if (Array.isArray(dbP.variants) && dbP.variants.length > 0) {
        const row = dbP.variants.find((v: any) => (v.color ? `${v.color} / ${v.size || ''}` : (v.size || '')) === vKey);
        if (row) available = Number(row.stock) || 0;
      }
    }
    if (available === null) available = Number(dbP.currentStock ?? 0);
    if (available < wanted) shortages.push(`${vKey ? `${dbP.name} (${vKey})` : dbP.name}: only ${available} in stock, bill needs ${wanted}`);
  }
  if (shortages.length > 0 && !allowNegativeStock) throw new ApiError(409, `STOCK_CONFLICT: ${shortages.join('; ')}`, 'STOCK_CONFLICT');

  // Per-line GST rate: product rate from the server; overrides only within the supported slabs
  const lineRates: number[] = parsed.map((p: any) => {
    const dbP: any = p.pid ? productMap.get(p.pid) : null;
    return resolveMillLineGstRate(p.raw.gst_percent ?? p.raw.gstPercent, dbP?.gstPercent, !!dbP, billType, p.label);
  });
  const lineHsn: (string | null)[] = parsed.map((p: any) => {
    const dbP: any = p.pid ? productMap.get(p.pid) : null;
    return p.raw.hsn_code || p.raw.hsnCode || dbP?.hsnCode || null;
  });

  const buildInput = (costTotals: number[]): MillInput => ({
    lines: parsed.map((p: any, i: number) => ({ quantity: p.qty, rate: p.rate, gstRate: lineRates[i], costTotal: costTotals[i], hsnCode: lineHsn[i] })),
    discount,
    billType,
    interState,
    charges,
  });

  // The GRAND TOTAL does not depend on cost, so it can be fixed now to validate the payment up front.
  const preCalc: MillResult = millValidation(() => calculateMillInvoice(buildInput(parsed.map(() => 0))));
  const amountPaid = resolveAmountPaid(body.amount_paid === null ? undefined : body.amount_paid, preCalc.grandTotal, paymentType);
  const validatedPayment = validatePaymentDetails(body.payment_details, paymentType, amountPaid);
  const paymentDetails = validatedPayment.details;
  const outstandingPaise = Math.max(0, toPaise(preCalc.grandTotal) - toPaise(amountPaid));
  const outstanding = outstandingPaise / 100;
  if (outstandingPaise > 0 && !customerId && !body.customer_name) {
    throw new ApiError(400, 'Customer is required for Udhar / Outstanding amounts');
  }

  let createdAtOverride: Date | undefined;
  if (body.created_at) {
    createdAtOverride = new Date(body.created_at);
    if (Number.isNaN(createdAtOverride.getTime())) throw new ApiError(400, 'created_at is not a valid date');
  }

  const invoice_number = `INV-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
  const wholesaleTier = isWholesaleTierPackage(shop.packageType);

  // ── 2. One transaction: lock, price, persist ──
  const outcome = await prisma.$transaction(async (tx: any) => {
    return await withTenantIdempotency(tx, {
      shopId, idempotencyKey, deviceId, entityType: 'sale', localId,
      handler: async () => {
        // (a) customer by name (same behaviour as legacy)
        let finalCustomerId: string | null = customerId;
        if (!finalCustomerId && body.customer_name) {
          const existing = await tx.customer.findFirst({ where: { shopId, name: body.customer_name } });
          if (existing) {
            finalCustomerId = existing.id;
            if ((body.customer_mobile && !existing.mobile) || (body.customer_email && !existing.email) || (body.customer_address && !existing.address)) {
              await tx.customer.update({
                where: { id: existing.id, shopId },
                data: {
                  ...(body.customer_mobile && !existing.mobile ? { mobile: body.customer_mobile } : {}),
                  ...(body.customer_email && !existing.email ? { email: body.customer_email } : {}),
                  ...(body.customer_address && !existing.address ? { address: body.customer_address } : {}),
                },
              });
            }
          } else {
            const created = await tx.customer.create({
              data: { shopId, name: body.customer_name, mobile: body.customer_mobile || null, email: body.customer_email || null, address: body.customer_address || null, totalDue: 0 },
            });
            finalCustomerId = created.id;
          }
        }

        // (c) row locks in the deterministic order: products (sorted) with their live batches, then the customer
        for (const pid of [...productIds].sort()) {
          await tx.$queryRaw`SELECT id FROM products WHERE id = ${pid}::uuid AND shop_id = ${shopId}::uuid FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM batches WHERE product_id = ${pid}::uuid AND shop_id = ${shopId}::uuid AND quantity > 0 ORDER BY id ASC FOR UPDATE`;
        }
        if (finalCustomerId) {
          await tx.$queryRaw`SELECT id FROM customers WHERE id = ${finalCustomerId}::uuid AND shop_id = ${shopId}::uuid FOR UPDATE`;
        }

        // (d) fresh data under the locks; cost allocation (stored ex-GST cost, FIFO batches — same as legacy)
        const [billProducts, activeBatches] = await Promise.all([
          tx.product.findMany({ where: { id: { in: productIds }, shopId } }),
          tx.batch.findMany({ where: { productId: { in: productIds }, shopId, quantity: { gt: 0 } }, orderBy: { createdAt: 'asc' } }),
        ]);
        const billProductMap = new Map<string, any>(billProducts.map((p: any) => [p.id, p]));
        const batchesByProduct = new Map<string, any[]>();
        for (const b of activeBatches) {
          if (!batchesByProduct.has(b.productId)) batchesByProduct.set(b.productId, []);
          batchesByProduct.get(b.productId)!.push(b);
        }
        const batchRemaining = new Map<string, number>(activeBatches.map((b: any) => [b.id, b.quantity]));
        const draws: { batchId: string; quantity: number; costAtSale: number }[][] = parsed.map(() => []);
        const costTotals: number[] = parsed.map((p: any, i: number) => {
          const dbP = p.pid ? billProductMap.get(p.pid) : null;
          const variant = p.raw.variant || null;
          const pBatches = p.pid ? (batchesByProduct.get(p.pid) || []) : [];
          if (!pBatches.length) return resolveLineCost(p.raw, dbP, p.rate) * p.qty;
          const targetId = p.raw.batch_id || p.raw.batchId || null;
          const ordered = targetId ? [...pBatches.filter((b) => b.id === targetId), ...pBatches.filter((b) => b.id !== targetId)] : pBatches;
          let remaining = p.qty;
          let cost = 0;
          for (const batch of ordered) {
            if (remaining <= 0) break;
            const avail = batchRemaining.get(batch.id) || 0;
            if (avail <= 0) continue;
            const take = Math.min(avail, remaining);
            batchRemaining.set(batch.id, avail - take);
            const unit = Number(batch.costPrice) || serverCostFor(dbP, variant);
            cost += take * unit;
            draws[i].push({ batchId: batch.id, quantity: take, costAtSale: unit });
            remaining -= take;
          }
          if (remaining > 0) cost += remaining * serverCostFor(dbP, variant);
          return cost;
        });

        const calc: MillResult = millValidation(() => calculateMillInvoice(buildInput(costTotals)));
        if (calc.grandTotal !== preCalc.grandTotal) {
          throw new ApiError(500, 'Internal error: bill total changed while processing');
        }

        // (e) sale + items
        const gstDetails = billType === 'gst'
          ? {
              model: MILL_PRICING_MODEL,
              interState,
              taxable: calc.taxable,
              cgst: calc.cgst,
              sgst: calc.sgst,
              igst: calc.igst,
              totalGst: calc.totalGst,
              goodsWithGst: calc.goodsWithGst,
              chargesTotal: calc.chargesTotal,
              roundOff: calc.roundOff,
              grandTotal: calc.grandTotal, // the bill's final total (incl. charges and round-off)
              groups: calc.groups.map((g) => ({ rate: g.rate, taxable: g.taxable, cgst: g.cgst, sgst: g.sgst, igst: g.igst })),
              hsnGroups: calc.hsnGroups,
              lines: parsed.map((p: any, i: number) => ({ index: i, rate: calc.lines[i].gstRate })), // applied rate per line
            }
          : undefined;

        const created = await tx.sale.create({
          data: {
            shopId,
            customerId: finalCustomerId,
            totalAmount: calc.grandTotal,
            totalProfit: calc.totalProfit,
            paymentType,
            amountPaid,
            paymentDetails,
            invoice_number,
            offlineRefNumber,
            billType,
            gstAmount: billType === 'gst' ? calc.totalGst : null,
            gstDetails,
            billImageUrl: body.bill_image_url || null,
            isManual: body.is_manual === true,
            createdAt: createdAtOverride,
            pricingModel: MILL_PRICING_MODEL,
            discountAmount: calc.discount,
            charges: calc.charges,
            chargesTotal: calc.chargesTotal,
            roundOffAmount: calc.roundOff,
            items: {
              create: parsed.map((p: any, i: number) => {
                const dbP = p.pid ? billProductMap.get(p.pid) : null;
                const rawName = p.raw.name || p.raw.product_name || p.raw.title || p.raw.itemName;
                return {
                  productId: p.pid || null,
                  unit: p.raw.unit || dbP?.baseUnit || null,
                  variant: p.raw.variant || null,
                  itemName: p.pid ? null : (rawName || null),
                  quantity: p.qty,
                  pricePerUnit: p.rate,
                  marginPerUnit: calc.lines[i].marginPerUnit,
                };
              }),
            },
          },
          include: { items: true },
        });

        // (f) batch draws, batch + stock decrements
        const batchRows: { saleItemId: string; batchId: string; quantity: number; costAtSale: number }[] = [];
        created.items.forEach((si: any, i: number) => {
          for (const d of draws[i] || []) batchRows.push({ saleItemId: si.id, batchId: d.batchId, quantity: d.quantity, costAtSale: d.costAtSale });
        });
        if (productIds.length) {
          if (batchRows.length) await tx.saleItemBatch.createMany({ data: batchRows });
          for (const b of activeBatches) {
            const consumed = b.quantity - (batchRemaining.get(b.id) ?? b.quantity);
            if (consumed > 0) await tx.batch.update({ where: { id: b.id }, data: { quantity: { decrement: consumed } } });
          }
          const byProduct = new Map<string, any[]>();
          for (const p of parsed) {
            if (!p.pid) continue;
            if (!byProduct.has(p.pid)) byProduct.set(p.pid, []);
            byProduct.get(p.pid)!.push(p);
          }
          for (const product of billProducts) {
            const lines = byProduct.get(product.id);
            if (!lines) continue;
            let totalQty = 0;
            let newSizeVariants: any = product.size_variants;
            const newVariants = Array.isArray(product.variants) ? (product.variants as any[]).map((v) => ({ ...v })) : null;
            let variantsChanged = false;
            for (const p of lines) {
              totalQty += p.qty;
              const variant = p.raw.variant;
              if (variant && newSizeVariants) {
                try {
                  const sv = typeof newSizeVariants === 'string' ? JSON.parse(newSizeVariants) : newSizeVariants;
                  if (sv[variant] !== undefined) {
                    if (!allowNegativeStock && (Number(sv[variant]) || 0) < p.qty) throw new ApiError(409, `STOCK_CONFLICT: Insufficient stock for ${product.name} (${variant})`, 'STOCK_CONFLICT');
                    sv[variant] = Math.max(0, (sv[variant] || 0) - p.qty);
                    newSizeVariants = JSON.stringify(sv);
                  }
                } catch (e) { if (e instanceof ApiError) throw e; }
              }
              if (variant && newVariants) {
                const row = newVariants.find((v: any) => (v.color ? `${v.color} / ${v.size || ''}` : (v.size || '')) === variant);
                if (row) {
                  if (!allowNegativeStock && (Number(row.stock) || 0) < p.qty) throw new ApiError(409, `STOCK_CONFLICT: Insufficient stock for ${product.name} (${variant})`, 'STOCK_CONFLICT');
                  row.stock = Math.max(0, (Number(row.stock) || 0) - p.qty);
                  variantsChanged = true;
                }
              }
            }
            if (!allowNegativeStock) {
              const updated = await tx.$executeRaw`
                UPDATE products SET current_stock = COALESCE(current_stock, 0) - ${totalQty}
                WHERE id = ${product.id}::uuid AND shop_id = ${shopId}::uuid AND COALESCE(current_stock, 0) >= ${totalQty}`;
              if (updated === 0) throw new ApiError(409, `STOCK_CONFLICT: Insufficient stock for ${product.name}`, 'STOCK_CONFLICT');
            } else {
              await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) - ${totalQty} WHERE id = ${product.id}::uuid AND shop_id = ${shopId}::uuid`;
            }
            await tx.product.update({
              where: { id: product.id, shopId },
              data: { size_variants: newSizeVariants, ...(variantsChanged ? { variants: newVariants as any } : {}) },
            });
            if (wholesaleTier) {
              await tx.stockMovement.create({ data: { shopId, productId: product.id, type: 'sale', quantity: totalQty, referenceId: created.id } });
            }
          }
        }

        // (g) customer udhar + credit limit, cash book
        if (outstandingPaise > 0 && finalCustomerId) {
          const cust = await tx.customer.findFirst({ where: { id: finalCustomerId, shopId } });
          if (cust && (cust.creditLimit ?? 0) > 0) {
            if (toPaise(cust.totalDue || 0) + outstandingPaise > toPaise(cust.creditLimit)) {
              throw new ApiError(400, `Credit Limit of ₹${cust.creditLimit} exceeded by ₹${round2((toPaise(cust.totalDue || 0) + outstandingPaise - toPaise(cust.creditLimit)) / 100)}`, 'CREDIT_LIMIT_EXCEEDED');
            }
          }
          await tx.customer.update({ where: { id: finalCustomerId, shopId }, data: { totalDue: { increment: outstanding } } });
          await tx.customer_transactions.create({
            data: { customer_id: finalCustomerId, type: 'udhar', amount: outstanding, note: `Bill: ${invoice_number}`, bill_number: invoice_number, created_at: new Date() },
          });
        }
        if (validatedPayment.cash > 0) {
          await tx.cashBook.create({
            data: {
              shopId, type: 'sale', amount: validatedPayment.cash, referenceId: created.id,
              description: paymentType === 'Split' ? `Split Sale (Cash portion): ${invoice_number}` : `Cash Sale: ${invoice_number}`,
            },
          });
        }

        const clientTotal = body.total_amount !== undefined && body.total_amount !== null ? Number(body.total_amount) : null;
        const response = {
          ...created,
          pricing_model: MILL_PRICING_MODEL,
          mill: {
            goods_subtotal: calc.goodsSubtotal,
            discount: calc.discount,
            taxable: calc.taxable,
            gst: { billed: calc.gstBilled, inter_state: calc.interState, cgst: calc.cgst, sgst: calc.sgst, igst: calc.igst, total: calc.totalGst, groups: calc.groups },
            charges: calc.charges,
            charges_total: calc.chargesTotal,
            pre_round_total: calc.preRoundTotal,
            round_off: calc.roundOff,
            grand_total: calc.grandTotal,
            // Informational only: the client's own figure was NOT used.
            client_total_mismatch: clientTotal !== null && Number.isFinite(clientTotal) ? toPaise(clientTotal) !== toPaise(calc.grandTotal) : false,
          },
        };
        return { serverId: created.id, response };
      },
    });
  }, { maxWait: 30000, timeout: 60000 });

  const sale: any = outcome.result;
  if (!outcome.isDuplicate) {
    (async () => {
      try {
        await checkLargeTransactionAlert(prisma, shopId, sale.totalAmount, 'sale', sale.invoice_number || invoice_number);
        if (productIds.length) await checkLowStockAlerts(prisma, shopId, productIds);
      } catch (e) { console.error('Notification failed', e); }
    })();
    prisma.activityLog.create({
      data: { shopId, action: 'bill_created', entityId: sale.id, details: { invoice: sale.invoice_number || invoice_number, total: sale.totalAmount, model: MILL_PRICING_MODEL } },
    }).catch((e: any) => console.error('Activity log failed', e));
  }
  invalidateDashboardCacheForShop(shopId);
  return json(sale, 201);
}
