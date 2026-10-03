import { NextResponse } from 'next/server';
import { requireShop } from '@/lib/server/auth';
import { assertOwned } from '@/lib/server/ownership';
import prisma from '@/lib/server/prisma';
import { randomUUID } from 'crypto';
import { applyVariantStockDeltas } from '@/lib/server/variantStock';
import { tagRows } from '@/lib/server/billTags';
import { logBrokerCommission } from '@/lib/server/brokerCommission';
import { isMillBillingPackage } from '@/lib/config/packageConfig';
import { remainingForSale, FROM_BILL_MARK } from '@/lib/server/challanFromInvoice';

/**
 * GET /api/v1/challans
 *
 * List delivery challans for this shop, newest first. Optional filters:
 * status ('open'|'invoiced'|'cancelled'), customerId, q (challan #/customer name).
 */
export async function GET(req: Request) {
  try {
    const { shop } = await requireShop(req);
    const url = new URL(req.url);
    const status = url.searchParams.get('status') || '';
    const customerId = url.searchParams.get('customerId') || '';
    const q = url.searchParams.get('q') || '';

    const where: any = { shopId: shop.id };
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (q) {
      where.OR = [
        { challanNumber: { contains: q, mode: 'insensitive' } },
        { customerName: { contains: q, mode: 'insensitive' } },
      ];
    }

    const challans = await (prisma as any).deliveryChallan.findMany({
      where,
      include: {
        items: true,
        transporterCustomer: { select: { id: true, name: true, mobile: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(challans);
  } catch (err: any) {
    console.error('[challans GET] failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed to load challans' }, { status: err?.status || 500 });
  }
}

/**
 * POST /api/v1/challans
 *
 * Records a delivery/dispatch note and decrements stock immediately — goods
 * are physically leaving the shop against this document, ahead of the
 * formal GST invoice (see the DeliveryChallan model comment in schema.prisma
 * for why this is deliberately kept separate from Sale/billing). Body:
 *   { customerId?, customerName?, customerMobile?, customerAddress?,
 *     orderId?, notes?, items: [{ productId, name, unit, variantKey?, quantity, price }] }
 */
export async function POST(req: Request) {
  try {
    const { shop } = await requireShop(req);
    const data = await req.json();
    const {
      customerId, customerName, customerMobile, customerAddress, orderId, notes, items,
      challanDate, dispatchType, dispatchFrom,
      transporterId, transporter, freightAmount,
      vehicleNumber, driverName, driverMobile, lrNumber,
      jobWorkOrderRef, eWayBillNo, expectedInvoiceDate,
      hamaliAmount, brokerName, brokerCommission,
    } = data;
    // Sale hamali / sale broker are Bada Udyog (mill) fields — ignored for every other package
    const isMill = isMillBillingPackage((shop as any).packageType);
    const saleHamali = isMill && Number(hamaliAmount) > 0 ? Number(hamaliAmount) : 0;

    // Bada Udyog "challan from invoice": the bill already took the stock, so this challan takes none — it is linked to the bill and limited to
    // what the bill still has undelivered. (A plain challan, with no fromSaleId, behaves exactly as before.)
    let fromSale: any = null;
    if (data.fromSaleId) {
      if (!isMill) return NextResponse.json({ error: 'A challan from an invoice is a Bada Udyog feature.' }, { status: 403 });
      const rem = await remainingForSale(shop.id, String(data.fromSaleId));
      const want = new Map<string, number>();
      for (const it of items) want.set(it.productId, (want.get(it.productId) || 0) + (Number(it.quantity) || 0));
      for (const [pid, qty] of want) {
        const line = rem.lines.find((l) => l.productId === pid);
        if (!line) return NextResponse.json({ error: 'A product on this challan is not on the invoice.' }, { status: 400 });
        if (qty > line.remainingQty + 0.0005) {
          return NextResponse.json({ error: `${line.name}: only ${line.remainingQty} ${line.unit} of the invoice is still to be delivered (billed ${line.billedQty}, already on challans ${line.alreadyQty}).` }, { status: 400 });
        }
      }
      fromSale = rem.sale;
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'At least one item is required.' }, { status: 400 });
    }
    if (!customerId && !customerName) {
      return NextResponse.json({ error: 'A party is required.' }, { status: 400 });
    }

    // Client-supplied ids must belong to this shop before any write.
    const lotIds = items.map((it: any) => it.lotId).filter(Boolean);
    await assertOwned(shop.id, {
      customerId,
      orderId,
      productId: items.map((it: any) => it.productId),
    });

    // Validate transporterId if provided
    const parsedFreight = freightAmount != null && freightAmount !== '' ? Number(freightAmount) : null;
    if (transporterId) {
      const tCheck = await prisma.customer.findFirst({ where: { id: transporterId, shopId: shop.id, customerType: 'transporter' } });
      if (!tCheck) return NextResponse.json({ error: 'Transporter not found.' }, { status: 400 });
    }

    // Verify lot ids belong to this shop (assertOwned doesn't cover lots)
    if (lotIds.length > 0) {
      const count = await prisma.finishedGoodsLot.count({
        where: { id: { in: lotIds }, shopId: shop.id },
      });
      if (count !== lotIds.length) {
        return NextResponse.json({ error: 'One or more lots are invalid.' }, { status: 400 });
      }
    }

    const challanNumber = `CH-${randomUUID().substring(0, 8).toUpperCase()}`;

    let freightEntryId: string | null = null;
    const challan = await prisma.$transaction(async (tx) => {
      const created = await tx.deliveryChallan.create({
        data: {
          shopId: shop.id,
          challanNumber,
          orderId: orderId || null,
          customerId: fromSale ? (fromSale.customerId || customerId || null) : (customerId || null),
          customerName: fromSale ? (fromSale.customer?.name || customerName || null) : (customerName || null),
          customerMobile: customerMobile || null,
          customerAddress: customerAddress || null,
          notes: fromSale ? `${FROM_BILL_MARK} Invoice ${fromSale.invoice_number}${notes ? ' · ' + notes : ''}` : (notes || null),
          ...(fromSale ? { status: 'invoiced', saleId: fromSale.id, invoicedAt: new Date() } : {}),
          // new fields
          challanDate: challanDate ? new Date(challanDate) : null,
          dispatchType: dispatchType || 'sale',
          dispatchFrom: dispatchFrom || null,
          transporter: transporter || null,
          transporterId: transporterId || null,
          freightAmount: parsedFreight,
          vehicleNumber: vehicleNumber || null,
          driverName: driverName || null,
          driverMobile: driverMobile || null,
          lrNumber: lrNumber || null,
          jobWorkOrderRef: jobWorkOrderRef || null,
          eWayBillNo: eWayBillNo || null,
          expectedInvoiceDate: expectedInvoiceDate ? new Date(expectedInvoiceDate) : null,
          items: {
            create: items.map((it: any) => ({
              productId: it.productId,
              name: it.name,
              unit: it.unit || 'Unit',
              variantKey: it.variantKey || null,
              quantity: Number(it.quantity) || 0,
              price: Number(it.price) || 0,
              lotId: it.lotId || null,
              lotNumber: it.lotNumber || null,
              godown: it.godown || null,
              packSize:    it.packSize    != null ? Number(it.packSize)    : null,
              noOfPacks:   it.noOfPacks   != null ? Number(it.noOfPacks)   : null,
              totalWeight: it.totalWeight != null ? Number(it.totalWeight) : null,
            })),
          },
        },
        include: { items: true },
      });

      // Decrement flat product stock — NOT for a challan from an invoice (the bill took it already)
      const qtyByProduct = new Map<string, number>();
      for (const it of items) {
        qtyByProduct.set(it.productId, (qtyByProduct.get(it.productId) || 0) + (Number(it.quantity) || 0));
      }
      for (const [productId, qty] of qtyByProduct) {
        if (qty <= 0 || fromSale) continue;
        await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) - ${qty} WHERE id = ${productId}::uuid AND shop_id = ${shop.id}::uuid`;
      }

      // Decrement FinishedGoodsLot.availableQuantity for items linked to a lot
      for (const it of items) {
        if (!it.lotId || Number(it.quantity) <= 0) continue;
        await tx.$executeRaw`
          UPDATE finished_goods_lots
          SET available_quantity = GREATEST(0, available_quantity - ${Number(it.quantity)})
          WHERE id = ${it.lotId}::uuid AND shop_id = ${shop.id}::uuid
        `;
      }

      // Auto-create freight charge when a linked transporter + amount is given
      if (transporterId && parsedFreight && parsedFreight > 0) {
        const fe = await (tx as any).freightEntry.create({
          data: {
            shopId: shop.id,
            transporterId,
            challanId: created.id,
            type: 'charge',
            amount: parsedFreight,
            vehicleNumber: vehicleNumber || null,
            note: `Auto from challan ${challanNumber}`,
          },
        });
        freightEntryId = fe.id;
      }

      return created;
    }, { timeout: 60000, maxWait: 15000 });

    // Sale freight / sale hamali: tagged Sale and linked to this challan. Done after the challan is saved (the challan transaction is
    // already close to its time limit on a distant database), and best-effort — the challan itself is never lost over a tag.
    try {
      if (freightEntryId) await tagRows(prisma as any, 'freight_entries', [freightEntryId], { direction: 'sale', challanId: challan.id });
      if (saleHamali > 0) {
        const hx = await (prisma as any).expense.create({ data: { shopId: shop.id, category: 'Hamali / Labour', amount: saleHamali, paymentMode: 'Cash', description: `Sale hamali - challan ${challanNumber}${vehicleNumber ? ` (${vehicleNumber})` : ''}`, date: new Date() } });
        await tagRows(prisma as any, 'expenses', [hx.id], { direction: 'sale', challanId: challan.id });
      }
    } catch (e) {
      console.error('[challans POST] sale hamali / freight tag failed (non-fatal):', e);
    }

    // Sale broker (kind customer) — commission owed to the broker, linked to this challan; best-effort, the challan is already saved
    if (isMill && String(brokerName ?? '').trim()) {
      try { await logBrokerCommission(shop.id, { name: brokerName, commission: brokerCommission, billNumber: challanNumber, kind: 'customer', party: customerName || undefined, challanId: challan.id }); }
      catch (e) { console.error('[challans POST] broker commission failed (non-fatal):', e); }
    }

    // Variant-row stock (Product.variants[] JSON) — same best-effort,
    // after-the-transaction pattern Purchases already uses via this helper,
    // since it does its own per-product read-modify-write outside tx.
    try {
      if (!fromSale) await applyVariantStockDeltas(
        prisma,
        items
          .filter((it: any) => it.variantKey)
          .map((it: any) => ({ productId: it.productId, variantKey: it.variantKey, delta: -(Number(it.quantity) || 0) })),
        shop.id
      );
    } catch (e) {
      console.error('[challans POST] variant stock update failed (non-fatal):', e);
    }

    return NextResponse.json(challan);
  } catch (err: any) {
    console.error('[challans POST] failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed to create challan' }, { status: err?.status || 500 });
  }
}
