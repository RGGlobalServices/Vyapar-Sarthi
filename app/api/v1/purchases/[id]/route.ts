import { NextResponse } from 'next/server';
import { readCharges, chargesTotal } from '@/lib/server/purchaseCharges';
import { requireShop } from '@/lib/server/auth';
import { assertOwned } from '@/lib/server/ownership';
import { apiErrorResponse } from '@/lib/server/http';
import prisma from '@/lib/server/prisma';
import { reversePurchaseInvoiceEffects, cleanupPurchaseLedgerAndBatches, PurchaseReversalBlockedError } from '@/lib/server/purchases';
import { checkLargeTransactionAlert } from '@/lib/server/notificationsEngine';
import { applyVariantStockDeltas, type VariantStockDelta } from '@/lib/server/variantStock';
import { recordDeletion } from '@/lib/server/trash';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const auth = await requireShop(req, { enforceSubscription: false });
    const invoice = await prisma.purchaseInvoice.findFirst({
      where: { id, shopId: auth.shop.id },
      include: {
        supplier: true,
        purchaseItems: { include: { product: true, batch: true } },
        // Lets the Purchase Details modal compute per-item "remaining"
        // returnable quantity and a live "Net Payable" (totalCost minus the
        // sum of these) without ever rewriting the invoice's own totals.
        purchaseReturns: { include: { items: true }, orderBy: { createdAt: 'desc' } },
      },
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

    if (!supplierId || !items || items.length === 0) {
      return NextResponse.json({ error: 'Missing required purchase details.' }, { status: 400 });
    }

    // Checked BEFORE the reversal below so a foreign id fails with no mutation.
    await assertOwned(auth.shop.id, {
      purchaseInvoiceId: id,
      supplierId,
      godownId: warehouseId,
      productId: items.map((i: any) => i.productId),
    });

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
    // The bill's charges (hamali, freight … set when it was imported) are part of what is owed and survive an edit of the items.
    const prior = await prisma.purchaseInvoice.findFirst({ where: { id, shopId: auth!.shop.id }, select: { charges: true } });
    totalCost += chargesTotal(readCharges(prior?.charges));

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
        where: { id, shopId: auth!.shop.id },
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
            mrp: item.mrp != null ? Number(item.mrp) : null,
            discountPercent: item.discountPercent != null ? Number(item.discountPercent) : null,
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
          // Skip when this shop's tier has no godowns (warehouseId null) —
          // same reasoning as POST /purchases.
          ...(warehouseId ? [tx.godownProduct.upsert({
            where: { godownId_productId: { godownId: warehouseId, productId: item.productId } },
            update: { quantity: { increment: item.baseQuantity } },
            create: { godownId: warehouseId, productId: item.productId, quantity: item.baseQuantity },
          })] : []),
          // currentStock is nullable with no default — a plain increment
          // silently no-ops when it's NULL, so COALESCE it first (see the
          // matching comment in purchases/route.ts POST).
          tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) + ${item.baseQuantity} WHERE id = ${item.productId}::uuid AND shop_id = ${auth!.shop.id}::uuid`,
        ]),
        tx.supplier.update({
          where: { id: supplierId, shopId: auth!.shop.id },
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
      await applyVariantStockDeltas(prisma, [...reverseDeltas, ...reapplyDeltas], auth!.shop.id);
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
    const known = apiErrorResponse(error);
    if (known) return known;
    console.error('[API] Error updating purchase:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const auth = await requireShop(req);

    // Shopkeeper's explicit choice, surfaced by the delete confirmation
    // modal: reverse the stock this purchase added, or leave stock as-is
    // and only remove the invoice + its financial (supplier balance/ledger)
    // effects. Defaults to reversing — matches the previous, only behavior —
    // when the request has no body (e.g. an older client).
    let reverseStock = true;
    try {
      const body = await req.json();
      if (typeof body?.reverseStock === 'boolean') reverseStock = body.reverseStock;
    } catch { /* no body sent — keep the default */ }

    // Snapshot the invoice + its items + linked SupplierTransaction rows
    // BEFORE the delete so an admin can restore it from the Recycle Bin.
    // Snapshot the `reverseStock` choice too so restore knows whether to
    // undo the stock-side of this delete (mirror of the delete direction).
    // Best-effort — never let a snapshot failure block the delete itself.
    //
    // The matched IDs are also reused below (see linkedSupplierTxnIds) to
    // actually delete those ledger rows once the invoice itself is gone —
    // this OR match (covers the normal "Purchase Invoice: <number>" note AND
    // an imported invoice's "Imported purchase invoice" note) is the one
    // source of truth for "which SupplierTransaction rows belong to this
    // invoice", since there's no real FK between them.
    let linkedSupplierTxnIds: string[] = [];
    try {
      const snapshotInvoice = await prisma.purchaseInvoice.findFirst({
        where: { id, shopId: auth.shop.id },
        include: { purchaseItems: true },
      });
      if (snapshotInvoice) {
        const linkedSupplierTxns = await prisma.supplierTransaction.findMany({
          where: {
            supplierId: snapshotInvoice.supplierId,
            OR: [
              { note: `Purchase Invoice: ${id}` },
              { note: `Purchase Invoice: ${snapshotInvoice.invoiceNumber || ''}` },
              { note: 'Imported purchase invoice', billNumber: snapshotInvoice.invoiceNumber || undefined },
            ],
          },
        });
        linkedSupplierTxnIds = linkedSupplierTxns.map((t) => t.id);
        await recordDeletion({
          shopId: auth.shop.id,
          entityType: 'purchase_invoice',
          entityId: id,
          label: snapshotInvoice.invoiceNumber || id,
          data: {
            invoice: snapshotInvoice,
            supplierTransactions: linkedSupplierTxns,
            reverseStock,
          },
          deletedBy: (auth as any)?.user?.uuid || null,
        });
      }
    } catch (e) { console.error('Purchase snapshot for trash failed:', e); }

    const invoice = await prisma.$transaction(async (tx) => {
      const inv = await reversePurchaseInvoiceEffects(tx, auth.shop.id, id, { reverseStock });
      await tx.activityLog.create({
        data: {
          shopId: auth.shop.id,
          action: 'purchase_deleted',
          entityId: id,
          details: { invoice: inv.invoiceNumber || id, total: inv.totalCost, stockReversed: reverseStock },
        },
      });
      await tx.purchaseInvoice.delete({ where: { id } }); // cascades to purchaseItems
      return inv;
    }, { timeout: 15000, maxWait: 10000 });

    try {
      await cleanupPurchaseLedgerAndBatches(prisma, auth.shop.id, invoice, { deleteBatches: reverseStock });
    } catch (e) { console.error('Purchase ledger/batch cleanup failed:', e); }

    // Deterministic follow-up to the note-based match inside
    // cleanupPurchaseLedgerAndBatches above: that helper only recognises the
    // "Purchase Invoice: <number>" note pattern and requires amount to match
    // exactly, so it silently leaves the SupplierTransaction row behind for
    // an imported invoice (whose note is "Imported purchase invoice" instead)
    // — the invoice disappears from the Purchases list and supplier.balance
    // is still correctly decremented (that part never depended on this
    // match), but the FIFO "Due Bills" / per-supplier ledger breakdown reads
    // straight off SupplierTransaction rows, so that ghost row kept showing
    // this deleted purchase as still outstanding. linkedSupplierTxnIds was
    // matched with the broader OR above (same one used for the trash
    // snapshot), so delete those exact rows by id instead of re-guessing.
    if (linkedSupplierTxnIds.length) {
      try {
        await prisma.supplierTransaction.deleteMany({ where: { id: { in: linkedSupplierTxnIds } } });
      } catch (e) { console.error('Supplier transaction cleanup failed:', e); }
    }

    if (reverseStock) {
      try {
        const reverseDeltas: VariantStockDelta[] = invoice.purchaseItems
          .filter((item) => item.variantKey)
          .map((item) => ({ productId: item.productId, variantKey: item.variantKey, delta: -item.quantity }));
        await applyVariantStockDeltas(prisma, reverseDeltas, auth!.shop.id);
      } catch (e) { console.error('Variant stock update failed:', e); }
    }

    return NextResponse.json({ success: true, stockReversed: reverseStock });
  } catch (error: any) {
    if (error instanceof PurchaseReversalBlockedError) {
      return NextResponse.json({ error: error.message, code: 'REVERSAL_BLOCKED' }, { status: 409 });
    }
    console.error('[API] Error deleting purchase:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
