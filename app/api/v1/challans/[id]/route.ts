import { NextResponse } from 'next/server';
import { requireShop } from '@/lib/server/auth';
import { assertOwned } from '@/lib/server/ownership';
import prisma from '@/lib/server/prisma';
import { applyVariantStockDeltas } from '@/lib/server/variantStock';

async function getOwnedChallan(req: Request, id: string) {
  const { shop } = await requireShop(req);
  const challan = await prisma.deliveryChallan.findFirst({ where: { id, shopId: shop.id }, include: { items: true } });
  if (!challan) throw Object.assign(new Error('Challan not found'), { status: 404 });
  return { shop, challan };
}

/** GET /api/v1/challans/[id] — full detail, used for print + "Convert to Invoice" prefill. */
export async function GET(req: Request, ctx: any) {
  try {
    const { id } = await ctx.params;
    const { challan } = await getOwnedChallan(req, id);
    return NextResponse.json(challan);
  } catch (err: any) {
    console.error('[challans/[id] GET] failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed to load challan' }, { status: err?.status || 500 });
  }
}

/**
 * PATCH /api/v1/challans/[id]
 *
 * Body: { action: 'cancel' } — voids the challan and restores the stock it
 * took out (mirrors createSaleEffects' reversal pattern), only allowed while
 * still 'open' (an invoiced challan's stock belongs to a real Sale now — that
 * has to be reversed through the normal sale-delete flow, not here).
 * Body: { action: 'invoice', saleId } — marks the challan converted, called
 * by the billing flow right after it successfully creates the real Sale.
 * Deliberately NOT touching stock here — billing/route.ts's create already
 * decremented it for these items when the shopkeeper sent them through the
 * normal Confirm Sale button (see WholesaleBillingUI's challan-prefill flow,
 * which starts a fresh, un-decremented cart from the challan's item list).
 */
export async function PATCH(req: Request, ctx: any) {
  try {
    const { id } = await ctx.params;
    const { shop, challan } = await getOwnedChallan(req, id);
    const body = await req.json();

    if (body.action === 'cancel') {
      if (challan.status !== 'open') {
        return NextResponse.json({ error: `Cannot cancel a challan that is already ${challan.status}.` }, { status: 400 });
      }
      await prisma.$transaction(async (tx) => {
        await tx.deliveryChallan.update({ where: { id }, data: { status: 'cancelled' } });
        const qtyByProduct = new Map<string, number>();
        for (const it of challan.items) {
          qtyByProduct.set(it.productId, (qtyByProduct.get(it.productId) || 0) + it.quantity);
        }
        for (const [productId, qty] of qtyByProduct) {
          if (qty <= 0) continue;
          await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) + ${qty} WHERE id = ${productId}::uuid AND shop_id = ${shop.id}::uuid`;
        }
        // Restore FinishedGoodsLot.availableQuantity for lot-linked items
        for (const it of challan.items as any[]) {
          if (!it.lotId || it.quantity <= 0) continue;
          await tx.$executeRaw`
            UPDATE finished_goods_lots
            SET available_quantity = available_quantity + ${it.quantity}
            WHERE id = ${it.lotId}::uuid AND shop_id = ${shop.id}::uuid
          `;
        }
      });
      try {
        await applyVariantStockDeltas(
          prisma,
          challan.items
            .filter((it) => it.variantKey)
            .map((it) => ({ productId: it.productId, variantKey: it.variantKey, delta: it.quantity })),
          shop.id
        );
      } catch (e) {
        console.error('[challans PATCH cancel] variant stock restore failed (non-fatal):', e);
      }
      const updated = await prisma.deliveryChallan.findUnique({ where: { id }, include: { items: true } });
      return NextResponse.json(updated);
    }

    if (body.action === 'return') {
      if (!['open', 'invoiced'].includes(challan.status)) {
        return NextResponse.json({ error: `Cannot return a challan that is already ${challan.status}.` }, { status: 400 });
      }
      await prisma.$transaction(async (tx) => {
        await tx.deliveryChallan.update({ where: { id }, data: { status: 'returned' } });
        const qtyByProduct = new Map<string, number>();
        for (const it of challan.items) {
          qtyByProduct.set(it.productId, (qtyByProduct.get(it.productId) || 0) + it.quantity);
        }
        for (const [productId, qty] of qtyByProduct) {
          if (qty <= 0) continue;
          await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) + ${qty} WHERE id = ${productId}::uuid AND shop_id = ${shop.id}::uuid`;
        }
        for (const it of challan.items as any[]) {
          if (!it.lotId || it.quantity <= 0) continue;
          await tx.$executeRaw`
            UPDATE finished_goods_lots
            SET available_quantity = available_quantity + ${it.quantity}
            WHERE id = ${it.lotId}::uuid AND shop_id = ${shop.id}::uuid
          `;
        }
      });
      try {
        await applyVariantStockDeltas(
          prisma,
          challan.items
            .filter((it) => it.variantKey)
            .map((it) => ({ productId: it.productId, variantKey: it.variantKey, delta: it.quantity })),
          shop.id
        );
      } catch (e) {
        console.error('[challans PATCH return] variant stock restore failed (non-fatal):', e);
      }
      const updated = await prisma.deliveryChallan.findUnique({ where: { id }, include: { items: true } });
      return NextResponse.json(updated);
    }

    if (body.action === 'invoice') {
      if (challan.status !== 'open') {
        return NextResponse.json({ error: `Challan is already ${challan.status}.` }, { status: 400 });
      }
      if (!body.saleId) {
        return NextResponse.json({ error: 'saleId is required.' }, { status: 400 });
      }
      await assertOwned(shop.id, { saleId: body.saleId });
      const updated = await prisma.deliveryChallan.update({
        where: { id },
        data: { status: 'invoiced', saleId: body.saleId, invoicedAt: new Date() },
        include: { items: true },
      });
      return NextResponse.json(updated);
    }

    // action: 'dispatch' — create a DispatchEntry from this challan (stock already
    // debited when the challan was created, so no stock change here).
    if (body.action === 'dispatch') {
      if (!['open', 'invoiced'].includes(challan.status)) {
        return NextResponse.json({ error: `Cannot dispatch a challan that is ${challan.status}.` }, { status: 400 });
      }

      const d = new Date();
      const prefix = `DC-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      const sameDay = await (prisma as any).dispatchEntry.count({ where: { shopId: shop.id, dispatchNumber: { startsWith: prefix } } });
      const dispatchNumber = `${prefix}-${String(sameDay + 1).padStart(3, '0')}`;

      // Use the first item's product as the primary product for the dispatch entry
      const firstItem = challan.items[0] as any;
      const totalQty = (challan.items as any[]).reduce((s: number, it: any) => s + (it.quantity || 0), 0);

      const dispatch = await (prisma as any).dispatchEntry.create({
        data: {
          shopId: shop.id,
          dispatchNumber,
          challanId: challan.id,
          saleId: (challan as any).saleId || null,
          partyId: challan.customerId || null,
          vehicleNumber: challan.vehicleNumber || null,
          driverName: challan.driverName || null,
          productId: firstItem?.productId || null,
          quantity: totalQty || null,
          unit: firstItem?.unit || null,
          dispatchType: challan.dispatchType || 'sale',
          status: 'dispatched',
          dispatchedAt: (challan as any).challanDate ? new Date((challan as any).challanDate) : new Date(),
          notes: challan.notes || null,
        },
      });

      return NextResponse.json({ dispatch });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err: any) {
    console.error('[challans/[id] PATCH] failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed to update challan' }, { status: err?.status || 500 });
  }
}
