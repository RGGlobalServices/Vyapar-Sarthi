import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
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
  const { bill_id, items } = await readBody(req) as { bill_id: string; items: ReturnItemInput[] };

  if (!bill_id || !items || !items.length) {
    throw new ApiError(400, 'bill_id and items are required');
  }

  const sale = await prisma.sale.findFirst({
    where: { id: bill_id, shopId: shop.id },
    include: { items: { include: { product: true } }, customer: true },
  });
  if (!sale) throw new ApiError(404, 'Bill not found');

  // Reject asks that exceed the qty still returnable on this bill — better
  // to fail cleanly before touching stock than to half-process and leave the
  // shopkeeper reconciling by hand.
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

  interface Prepared {
    saleItem: typeof sale.items[number];
    qty: number;
    reason: string;
    refundAmount: number;
    refundProfit: number;
    variantKey: string | null;
  }
  const prepared: Prepared[] = [];
  for (const ret of items) {
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
    prepared.push({
      saleItem,
      qty,
      reason: ret.reason || 'Customer Return',
      refundAmount: qty * price,
      refundProfit: qty * margin,
      variantKey: saleItem.variant || null,
    });
  }
  if (!prepared.length) throw new ApiError(400, 'No valid return quantities provided');

  const totalRefund = prepared.reduce((s, p) => s + p.refundAmount, 0);

  // Attribution: udhar first, cash second. `outstandingOnThisBill` is what
  // the customer still owes *on this specific bill* — never touching
  // customer.totalDue for older bills the customer also has.
  const paidBefore = Number(sale.amountPaid) || 0;
  const totalBefore = Number(sale.totalAmount) || 0;
  const outstandingOnThisBill = Math.max(0, totalBefore - paidBefore);
  const udharCleared = Math.min(totalRefund, outstandingOnThisBill);
  const cashRefunded = totalRefund - udharCleared;

  // The full pipeline runs inside a transaction — a return that half-runs
  // (stock restored but udhar not cleared) is the exact failure mode this
  // rewrite exists to prevent.
  const result = await prisma.$transaction(async (tx) => {
    // 1. Stock: currentStock, size_variants, variants[], batches
    // Aggregate net qty per product so we do ONE product.update per product,
    // not one per line — same shape sales.ts/reverseSaleEffects follows.
    const qtyByProduct = new Map<string, number>();
    for (const p of prepared) {
      if (!p.saleItem.productId) continue;
      qtyByProduct.set(p.saleItem.productId, (qtyByProduct.get(p.saleItem.productId) || 0) + p.qty);
    }

    const productIds = [...qtyByProduct.keys()];
    const products = productIds.length
      ? await tx.product.findMany({ where: { id: { in: productIds } } })
      : [];
    const productById = new Map(products.map(pp => [pp.id, pp]));

    for (const [productId, totalQty] of qtyByProduct.entries()) {
      const product = productById.get(productId);
      if (!product) continue;

      let newSizeVariants = product.size_variants;
      const newVariants = Array.isArray(product.variants) ? (product.variants as any[]).map(v => ({ ...v })) : null;
      let variantsChanged = false;

      for (const p of prepared) {
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

      await tx.product.update({
        where: { id: productId },
        data: {
          ...(product.currentStock !== null ? { currentStock: { increment: totalQty } } : {}),
          size_variants: newSizeVariants,
          ...(variantsChanged ? { variants: newVariants as any } : {}),
        },
      });
    }

    // 2. materialReturn records — one per line item, with the SETTLED marker
    //    so the dashboard knows Sale + customer.totalDue already reflect this
    //    return and doesn't double-count. Legacy pre-fix rows won't have the
    //    marker and continue to be subtracted the old way.
    const created = [] as string[];
    for (const p of prepared) {
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
            udharCleared: udharCleared > 0 && p.refundAmount > 0 ? (udharCleared * p.refundAmount) / totalRefund : 0,
            cashRefunded: cashRefunded > 0 && p.refundAmount > 0 ? (cashRefunded * p.refundAmount) / totalRefund : 0,
            // Marker: this return was processed by the closed-loop pipeline
            // (Sale row + customer.totalDue + cashBook already adjusted).
            // Dashboard/reports must NOT subtract this row's amount again.
            settled: true,
          }),
        }
      });
      created.push(row.id);

      // Wholesale batch restore + stock_movement for audit
      if (isWholesaleTierPackage(shop.packageType) && p.saleItem.productId) {
        const latestBatch = await tx.batch.findFirst({
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

    // 3. Adjust the Sale row so ALL downstream aggregations (dashboard,
    //    reports, party ledger) see the correct post-return numbers without
    //    each report having to know about materialReturn separately.
    const totalProfitRefunded = prepared.reduce((s, p) => s + p.refundProfit, 0);
    await tx.sale.update({
      where: { id: sale.id },
      data: {
        totalAmount: { decrement: totalRefund },
        totalProfit: { decrement: totalProfitRefunded },
        // Only the CASH portion of the refund reduces amountPaid — the udhar
        // portion never came in in the first place. Symmetric with attribution.
        ...(cashRefunded > 0 ? { amountPaid: { decrement: cashRefunded } } : {}),
      },
    });

    // 4. Udhar side — reduce customer.totalDue AND write a refund row so
    //    the party ledger shows "why did their outstanding drop today".
    if (sale.customerId && udharCleared > 0) {
      await tx.customer.update({
        where: { id: sale.customerId },
        data: { totalDue: { decrement: udharCleared } },
      });
      await tx.customer_transactions.create({
        data: {
          customer_id: sale.customerId,
          // type='refund' so dashboards that group payments (type='payment')
          // don't count this as money-in — nothing came in, we gave credit
          // back. The party ledger view treats refund + payment identically
          // for balance display.
          type: 'refund',
          amount: udharCleared,
          note: `Return refund: ${sale.invoice_number}`,
          bill_number: sale.invoice_number,
          created_at: new Date(),
        }
      });
    }

    // 5. Cash side — physical money going OUT of the drawer for the paid
    //    portion of the refund. Same referenceId as the sale so a shopkeeper
    //    scrolling the cashbook can see the sale row and its refund row line
    //    up. Sign convention: type='refund' with positive amount, direction
    //    implied by type — matches how 'expense' is stored.
    if (cashRefunded > 0) {
      await tx.cashBook.create({
        data: {
          shopId: shop.id,
          type: 'refund',
          amount: cashRefunded,
          referenceId: sale.id,
          description: `Refund for ${sale.invoice_number}`,
        },
      });
    }

    return { createdReturnIds: created, totalRefund, udharCleared, cashRefunded, totalProfitRefunded };
  }, {
    // Same envelope as billing/route.ts's own POST — enough room for a
    // multi-line bill under Prisma Accelerate latency, without stretching
    // the connection lease unnecessarily.
    maxWait: 10000,
    timeout: 20000,
  });

  return json({
    detail: 'Return processed',
    ...result,
  });
});
