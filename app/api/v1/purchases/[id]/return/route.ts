import { NextResponse } from 'next/server';
import { requireShop } from '@/lib/server/auth';
import prisma from '@/lib/server/prisma';
import { randomUUID } from 'crypto';
import { applyVariantStockDeltas, type VariantStockDelta } from '@/lib/server/variantStock';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Goods sent back to a supplier from a specific purchase — a debit note.
 * Never mutates the original PurchaseInvoice/PurchaseItem rows (their cost/
 * mrp are locked in permanently, same as every other write path in this
 * module); this is a new, additive PurchaseReturn record. The caller (the
 * Purchase Details modal) computes "Net Payable" as totalCost minus the sum
 * of a purchase's returns.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const auth = await requireShop(req);
    const body = await req.json();
    const requested: Array<{ productId: string; variantKey?: string | null; name: string; quantity: number; rate: number }> =
      Array.isArray(body?.items) ? body.items : [];

    if (!requested.length) {
      return NextResponse.json({ error: 'No items to return.' }, { status: 400 });
    }

    const invoice = await prisma.purchaseInvoice.findFirst({
      where: { id, shopId: auth.shop.id },
      include: {
        purchaseItems: true,
        purchaseReturns: { include: { items: true } },
      },
    });
    if (!invoice) return NextResponse.json({ error: 'Purchase invoice not found' }, { status: 404 });

    // "<productId>::<variantKey>" (variantKey normalised to '' when absent)
    // — same composite-key idea PurchaseItem/StockMovement already use for
    // per-variant rows, just keyed for a quick remaining-qty lookup here.
    const rowKey = (productId: string, variantKey: string | null | undefined) => `${productId}::${variantKey || ''}`;

    const originalQtyByKey = new Map<string, number>();
    for (const item of invoice.purchaseItems) {
      const k = rowKey(item.productId, item.variantKey);
      originalQtyByKey.set(k, (originalQtyByKey.get(k) || 0) + item.quantity);
    }
    const alreadyReturnedByKey = new Map<string, number>();
    for (const ret of invoice.purchaseReturns) {
      for (const item of ret.items) {
        const k = rowKey(item.productId, item.variantKey);
        alreadyReturnedByKey.set(k, (alreadyReturnedByKey.get(k) || 0) + item.quantity);
      }
    }

    // Validate each requested line against what's actually still returnable
    // from THIS invoice, and total the per-product quantity being decremented
    // (a product can appear in more than one requested line via different
    // variants) so the stock guard below checks the combined effect, not
    // each line in isolation.
    const qtyByProduct = new Map<string, number>();
    for (const r of requested) {
      if (!r.productId || !(r.quantity > 0)) {
        return NextResponse.json({ error: 'Every returned item needs a positive quantity.' }, { status: 400 });
      }
      const k = rowKey(r.productId, r.variantKey);
      const original = originalQtyByKey.get(k) || 0;
      const already = alreadyReturnedByKey.get(k) || 0;
      const remaining = original - already;
      if (r.quantity > remaining) {
        return NextResponse.json(
          { error: `"${r.name}"${r.variantKey ? ` (${r.variantKey})` : ''} — only ${remaining} left to return from this invoice.` },
          { status: 400 }
        );
      }
      qtyByProduct.set(r.productId, (qtyByProduct.get(r.productId) || 0) + r.quantity);
    }

    // Can't return stock that's already been sold/moved elsewhere — mirrors
    // the guard reversePurchaseInvoiceEffects uses in lib/server/purchases.ts.
    const products = await prisma.product.findMany({
      where: { id: { in: [...qtyByProduct.keys()] } },
      select: { id: true, name: true, currentStock: true },
    });
    const short = products.filter(p => (p.currentStock ?? 0) < (qtyByProduct.get(p.id) || 0));
    if (short.length) {
      return NextResponse.json(
        { error: `Not enough current stock to return: ${short.map(p => p.name).join(', ')}.` },
        { status: 409 }
      );
    }

    const totalAmount = requested.reduce((sum, r) => sum + r.quantity * r.rate, 0);
    const returnId = randomUUID();
    const returnNumber = `RET-${randomUUID().substring(0, 8).toUpperCase()}`;

    // Flat array transaction (not an interactive callback) — same choice
    // POST /purchases makes, so this stays one round-trip against the remote
    // DB instead of an open transaction waiting on sequential awaits.
    await prisma.$transaction([
      prisma.purchaseReturn.create({
        data: {
          id: returnId,
          shopId: auth.shop.id,
          supplierId: invoice.supplierId,
          purchaseInvoiceId: invoice.id,
          returnNumber,
          totalAmount,
        },
      }),
      prisma.purchaseReturnItem.createMany({
        data: requested.map(r => ({
          returnId,
          productId: r.productId,
          name: r.name,
          variantKey: r.variantKey || null,
          quantity: r.quantity,
          rate: r.rate,
          amount: r.quantity * r.rate,
        })),
      }),
      // currentStock is nullable with no DB default — COALESCE first so a
      // plain decrement never silently no-ops on NULL (same fix already
      // applied to every other stock-writing route in this module).
      ...[...qtyByProduct.entries()].map(([productId, qty]) =>
        prisma.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) - ${qty} WHERE id = ${productId}::uuid`
      ),
      prisma.stockMovement.createMany({
        data: requested.map(r => ({
          shopId: auth.shop.id,
          productId: r.productId,
          // Reuses the existing generic 'adjustment' type rather than a new
          // 'purchase_return' type, so Stock Ledger / daily register (which
          // already know how to read 'adjustment' rows) don't need new
          // classification logic to show this correctly.
          type: 'adjustment',
          quantity: r.quantity,
          referenceId: returnId,
        })),
      }),
      prisma.supplier.update({
        where: { id: invoice.supplierId },
        data: { balance: { decrement: totalAmount } },
      }),
      prisma.supplierTransaction.create({
        data: {
          supplierId: invoice.supplierId,
          type: 'purchase_return',
          amount: totalAmount,
          billNumber: returnNumber,
          note: `Return against Purchase Invoice: ${invoice.invoiceNumber || invoice.id}`,
        },
      }),
      prisma.activityLog.create({
        data: {
          shopId: auth.shop.id,
          action: 'purchase_return_added',
          entityId: returnId,
          details: { invoice: invoice.invoiceNumber || invoice.id, return: returnNumber, total: totalAmount },
        },
      }),
    ]);

    // Best-effort, after commit (same convention as every other
    // applyVariantStockDeltas call) — reduces Product.variants[] JSON stock
    // for variant-tracked lines. The flat currentStock update above already
    // landed unconditionally, so a failure here doesn't leave stock wrong,
    // only the per-variant breakdown momentarily stale.
    try {
      const deltas: VariantStockDelta[] = requested
        .filter(r => r.variantKey)
        .map(r => ({ productId: r.productId, variantKey: r.variantKey, delta: -r.quantity }));
      await applyVariantStockDeltas(prisma, deltas);
    } catch (e) { console.error('Variant stock update failed (purchase return):', e); }

    const created = await prisma.purchaseReturn.findUnique({
      where: { id: returnId },
      include: { items: true, supplier: true },
    });

    return NextResponse.json({ success: true, purchaseReturn: created });
  } catch (error: any) {
    console.error('[API] Error creating purchase return:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
