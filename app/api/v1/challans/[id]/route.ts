import { debitGodown, creditGodown, syncsGodownStock } from '@/lib/server/godownStock';
import { NextResponse } from 'next/server';
import { requireShop } from '@/lib/server/auth';
import { assertOwned } from '@/lib/server/ownership';
import prisma from '@/lib/server/prisma';
import { applyVariantStockDeltas } from '@/lib/server/variantStock';
import { isMillBillingPackage } from '@/lib/config/packageConfig';
import { billTagColumns } from '@/lib/server/billTags';
import { FROM_BILL_MARK } from '@/lib/server/challanFromInvoice';
import { withDispatchNumber } from '@/lib/server/dispatchNumber';

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
          if (syncsGodownStock(shop)) await creditGodown(tx, shop.id, productId, qty);
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
      // Bada Udyog: the sale freight, sale hamali and sale broker commission booked with this challan go with it
      if (isMillBillingPackage((shop as any).packageType)) {
        try {
          await prisma.$executeRawUnsafe(`DELETE FROM freight_entries WHERE shop_id = $1::uuid AND challan_id = $2::uuid AND type = 'charge'`, shop.id, id);
          if (await billTagColumns()) {
            await prisma.$executeRawUnsafe(`DELETE FROM expenses WHERE shop_id = $1::uuid AND challan_id = $2::uuid AND direction = 'sale'`, shop.id, id);
            await prisma.$executeRawUnsafe(`DELETE FROM commission_entries WHERE shop_id = $1::uuid AND challan_id = $2::uuid AND direction = 'sale'`, shop.id, id);
          }
        } catch (e) {
          console.error('[challans PATCH cancel] linked freight / hamali / commission cleanup failed (non-fatal):', e);
        }
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
        // A challan made FROM an invoice never took product stock (the bill did), so returning it must not add stock either — returning the goods
        // to stock is the bill's return. Its lot availability (which the challan did take) does go back.
        const fromBill = String((challan as any).notes || '').startsWith(FROM_BILL_MARK);
        const qtyByProduct = new Map<string, number>();
        for (const it of challan.items) {
          qtyByProduct.set(it.productId, (qtyByProduct.get(it.productId) || 0) + it.quantity);
        }
        for (const [productId, qty] of qtyByProduct) {
          if (qty <= 0 || fromBill) continue;
          await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) + ${qty} WHERE id = ${productId}::uuid AND shop_id = ${shop.id}::uuid`;
          if (syncsGodownStock(shop)) await creditGodown(tx, shop.id, productId, qty);
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
        if (!String((challan as any).notes || '').startsWith(FROM_BILL_MARK)) await applyVariantStockDeltas(
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

      // one live dispatch per challan — a second click used to create a second DC for the same goods
      const existingDc = await (prisma as any).dispatchEntry.findFirst({ where: { shopId: shop.id, challanId: challan.id, status: { not: 'returned' } }, select: { dispatchNumber: true } });
      if (existingDc) return NextResponse.json({ error: `This challan is already dispatched (${existingDc.dispatchNumber}).` }, { status: 409 });

      // Use the first item's product as the primary product for the dispatch entry
      const firstItem = challan.items[0] as any;
      const totalQty = (challan.items as any[]).reduce((s: number, it: any) => s + (it.quantity || 0), 0);

      const dispatch = await withDispatchNumber(shop.id, (dispatchNumber) => (prisma as any).dispatchEntry.create({
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
      }));

      return NextResponse.json({ dispatch });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err: any) {
    console.error('[challans/[id] PATCH] failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed to update challan' }, { status: err?.status || 500 });
  }
}
