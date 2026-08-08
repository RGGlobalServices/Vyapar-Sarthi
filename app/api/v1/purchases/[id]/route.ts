import { NextResponse } from 'next/server';
import { requireShop } from '@/lib/server/auth';
import prisma from '@/lib/server/prisma';
import { reversePurchaseInvoiceEffects, cleanupPurchaseLedgerAndBatches, PurchaseReversalBlockedError } from '@/lib/server/purchases';
import { checkLargeTransactionAlert } from '@/lib/server/notificationsEngine';
import { applyVariantStockDeltas, type VariantStockDelta } from '@/lib/server/variantStock';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const auth = await requireShop(req, { enforceSubscription: false });
    const invoice = await prisma.purchaseInvoice.findFirst({
      where: { id, shopId: auth.shop.id },
      include: { supplier: true, purchaseItems: { include: { product: true } } },
    });
    if (!invoice) return NextResponse.json({ error: 'Purchase invoice not found' }, { status: 404 });

    // warehouseId isn't stored on the invoice itself (only used at write-time
    // to update godown inventory) — recover it from the linked stock
    // movements so the edit form can pre-select it.
    const movement = await prisma.stockMovement.findFirst({
      where: { shopId: auth.shop.id, referenceId: id, type: 'purchase' },
      select: { warehouseId: true },
    });

    return NextResponse.json({ ...invoice, warehouseId: movement?.warehouseId || null });
  } catch (error: any) {
    console.error('[API] Error fetching purchase:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  let auth: Awaited<ReturnType<typeof requireShop>> | undefined;
  try {
    const { id } = await params;
    auth = await requireShop(req);
    const data = await req.json();
    const { supplierId, invoiceNumber, date, warehouseId, items, paymentMode, amountPaid } = data;

    if (!supplierId || !warehouseId || !items || items.length === 0) {
      return NextResponse.json({ error: 'Missing required purchase details.' }, { status: 400 });
    }

    const finalAmountPaid = typeof amountPaid === 'number' ? amountPaid : 0;
    const finalPaymentMode = paymentMode || 'Cash';

    const processedItems = items.map((item: any) => {
      const factor = Number(item.conversionFactor) || 1;
      const baseQuantity = item.quantity * factor;
      const baseCost = item.cost / factor;
      return { ...item, baseQuantity, baseCost };
    });

    let totalCost = 0;
    let totalGst = 0;
    for (const item of processedItems) {
      totalCost += item.quantity * item.cost;
      if (item.gst) totalGst += item.gst;
    }

    // Undo the old stock/ledger effects, then re-apply as if this were a
    // fresh purchase — same machinery as POST, just keeping the invoice id
    // stable instead of minting a new one. Kept to only the
    // financially/inventory-critical steps (see purchases.ts) so this
    // transaction stays short against the remote DB; the best-effort
    // ledger-note/batch cleanup for the OLD invoice runs after it commits.
    const { invoice, oldInvoice } = await prisma.$transaction(async (tx) => {
      const existing = await tx.purchaseInvoice.findFirst({ where: { id, shopId: auth!.shop.id } });
      if (!existing) throw new Error('Purchase invoice not found');

      const old = await reversePurchaseInvoiceEffects(tx, auth!.shop.id, id);
      await tx.purchaseItem.deleteMany({ where: { purchaseInvoiceId: id } });

      const updatedInvoice = await tx.purchaseInvoice.update({
        where: { id },
        data: {
          supplierId,
          invoiceNumber: invoiceNumber || null,
          date: date ? new Date(date) : new Date(),
          totalCost,
          gst: totalGst,
        },
      });

      await Promise.all([
        tx.purchaseItem.createMany({
          data: processedItems.map((item: any) => ({
            purchaseInvoiceId: id,
            productId: item.productId,
            variantId: item.variantId || null,
            variantKey: item.variant || null,
            quantity: item.baseQuantity,
            cost: item.baseCost,
            gst: item.gst || 0,
          })),
        }),
        tx.batch.createMany({
          data: processedItems.map((item: any) => ({
            shopId: auth!.shop.id,
            productId: item.productId,
            variantId: item.variantId || null,
            batchNumber: item.batchNumber || null,
            mfgDate: item.mfgDate ? new Date(item.mfgDate) : null,
            expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
            quantity: item.baseQuantity,
          })),
        }),
        tx.stockMovement.createMany({
          data: processedItems.map((item: any) => ({
            shopId: auth!.shop.id,
            productId: item.productId,
            variantId: item.variantId || null,
            warehouseId,
            type: 'purchase',
            quantity: item.baseQuantity,
            referenceId: id,
          })),
        }),
        ...processedItems.flatMap((item: any) => [
          tx.godownProduct.upsert({
            where: { godownId_productId: { godownId: warehouseId, productId: item.productId } },
            update: { quantity: { increment: item.baseQuantity } },
            create: { godownId: warehouseId, productId: item.productId, quantity: item.baseQuantity },
          }),
          // currentStock is nullable with no default — a plain increment
          // silently no-ops when it's NULL, so COALESCE it first (see the
          // matching comment in purchases/route.ts POST).
          tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) + ${item.baseQuantity} WHERE id = ${item.productId}::uuid`,
        ]),
        tx.supplier.update({
          where: { id: supplierId },
          data: { balance: { increment: totalCost - finalAmountPaid } },
        }),
        tx.supplierTransaction.create({
          data: {
            supplierId,
            type: 'purchase',
            amount: totalCost,
            note: `Purchase Invoice: ${invoiceNumber || id}`,
          },
        }),
        finalAmountPaid > 0 && finalPaymentMode.toLowerCase() === 'cash'
          ? tx.cashBook.create({
              data: {
                shopId: auth!.shop.id,
                type: 'purchase',
                amount: finalAmountPaid,
                referenceId: id,
                description: `Payment for Purchase Invoice: ${invoiceNumber || id}`,
              },
            })
          : null,
        tx.activityLog.create({
          data: {
            shopId: auth!.shop.id,
            action: 'purchase_edited',
            entityId: id,
            details: { invoice: invoiceNumber || id, total: totalCost },
          },
        }),
      ].filter(Boolean));

      return { invoice: updatedInvoice, oldInvoice: old };
    }, { timeout: 15000, maxWait: 10000 });

    try {
      await cleanupPurchaseLedgerAndBatches(prisma, auth.shop.id, oldInvoice);
    } catch (e) { console.error('Purchase ledger/batch cleanup failed:', e); }

    // Per-variant stock breakdown: undo what the old line items added, then
    // (re)apply the new ones — same best-effort, after-commit treatment as
    // POST. oldInvoice.purchaseItems already carries variantKey, so this
    // needs no extra fetch beyond what reversePurchaseInvoiceEffects returned.
    try {
      const reverseDeltas: VariantStockDelta[] = oldInvoice.purchaseItems
        .filter((item) => item.variantKey)
        .map((item) => ({ productId: item.productId, variantKey: item.variantKey, delta: -item.quantity }));
      const reapplyDeltas: VariantStockDelta[] = processedItems
        .filter((item: any) => item.variant)
        .map((item: any) => ({ productId: item.productId, variantKey: item.variant, delta: item.baseQuantity }));
      await applyVariantStockDeltas(prisma, [...reverseDeltas, ...reapplyDeltas]);
    } catch (e) { console.error('Variant stock update failed:', e); }

    try {
      await prisma.$transaction(async (tx) => {
        await checkLargeTransactionAlert(tx, auth!.shop.id, totalCost, 'purchase', invoiceNumber || id);
      });
    } catch (e) { console.error('Notification failed', e); }

    return NextResponse.json({ success: true, invoice });
  } catch (error: any) {
    if (error instanceof PurchaseReversalBlockedError) {
      return NextResponse.json({ error: error.message, code: 'REVERSAL_BLOCKED' }, { status: 409 });
    }
    console.error('[API] Error updating purchase:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const auth = await requireShop(req);

    const invoice = await prisma.$transaction(async (tx) => {
      const inv = await reversePurchaseInvoiceEffects(tx, auth.shop.id, id);
      await tx.activityLog.create({
        data: {
          shopId: auth.shop.id,
          action: 'purchase_deleted',
          entityId: id,
          details: { invoice: inv.invoiceNumber || id, total: inv.totalCost },
        },
      });
      await tx.purchaseInvoice.delete({ where: { id } }); // cascades to purchaseItems
      return inv;
    }, { timeout: 15000, maxWait: 10000 });

    try {
      await cleanupPurchaseLedgerAndBatches(prisma, auth.shop.id, invoice);
    } catch (e) { console.error('Purchase ledger/batch cleanup failed:', e); }

    try {
      const reverseDeltas: VariantStockDelta[] = invoice.purchaseItems
        .filter((item) => item.variantKey)
        .map((item) => ({ productId: item.productId, variantKey: item.variantKey, delta: -item.quantity }));
      await applyVariantStockDeltas(prisma, reverseDeltas);
    } catch (e) { console.error('Variant stock update failed:', e); }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof PurchaseReversalBlockedError) {
      return NextResponse.json({ error: error.message, code: 'REVERSAL_BLOCKED' }, { status: 409 });
    }
    console.error('[API] Error deleting purchase:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
