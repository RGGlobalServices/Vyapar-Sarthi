import { NextResponse } from 'next/server';
import { requireShop } from '@/lib/server/auth';
import prisma from '@/lib/server/prisma';
import { randomUUID } from 'crypto';
import { applyVariantStockDeltas } from '@/lib/server/variantStock';

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

    const challans = await prisma.deliveryChallan.findMany({
      where,
      include: { items: true },
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
    const { customerId, customerName, customerMobile, customerAddress, orderId, notes, items } = data;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'At least one item is required.' }, { status: 400 });
    }
    if (!customerId && !customerName) {
      return NextResponse.json({ error: 'A party is required.' }, { status: 400 });
    }

    const challanNumber = `CH-${randomUUID().substring(0, 8).toUpperCase()}`;

    // One transaction: create the challan + items, and decrement each
    // product's flat currentStock (COALESCE-first — currentStock is
    // nullable with no DB default, see billing/route.ts's identical fix).
    // Same reasoning: a plain Prisma `decrement` on NULL silently no-ops.
    const challan = await prisma.$transaction(async (tx) => {
      const created = await tx.deliveryChallan.create({
        data: {
          shopId: shop.id,
          challanNumber,
          orderId: orderId || null,
          customerId: customerId || null,
          customerName: customerName || null,
          customerMobile: customerMobile || null,
          customerAddress: customerAddress || null,
          notes: notes || null,
          items: {
            create: items.map((it: any) => ({
              productId: it.productId,
              name: it.name,
              unit: it.unit || 'Unit',
              variantKey: it.variantKey || null,
              quantity: Number(it.quantity) || 0,
              price: Number(it.price) || 0,
            })),
          },
        },
        include: { items: true },
      });

      // Net per-product quantity so two lines of the same product in one
      // challan decrement currentStock once, correctly.
      const qtyByProduct = new Map<string, number>();
      for (const it of items) {
        qtyByProduct.set(it.productId, (qtyByProduct.get(it.productId) || 0) + (Number(it.quantity) || 0));
      }
      for (const [productId, qty] of qtyByProduct) {
        if (qty <= 0) continue;
        await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) - ${qty} WHERE id = ${productId}::uuid AND shop_id = ${shop.id}::uuid`;
      }

      return created;
    });

    // Variant-row stock (Product.variants[] JSON) — same best-effort,
    // after-the-transaction pattern Purchases already uses via this helper,
    // since it does its own per-product read-modify-write outside tx.
    try {
      await applyVariantStockDeltas(
        prisma,
        items
          .filter((it: any) => it.variantKey)
          .map((it: any) => ({ productId: it.productId, variantKey: it.variantKey, delta: -(Number(it.quantity) || 0) }))
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
