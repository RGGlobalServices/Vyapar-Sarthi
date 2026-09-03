import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { isSupplierCredit } from '@/lib/server/ledgerClassification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/suppliers/[id]/transactions/[transactionId]
 *
 * Full detail for one purchase/payment row — the flat SupplierTransaction
 * fields plus, best-effort, the real line-item PurchaseInvoice behind it.
 *
 * SupplierTransaction has no real FK to PurchaseInvoice (see
 * app/api/v1/purchases/route.ts) — a purchase made through the full
 * Purchases module (with a real item picker) stamps the invoice's id or
 * user-typed invoiceNumber into the transaction's free-text `note` as
 * "Purchase Invoice: {key}". That's the only link back, so it's matched
 * here on read. Purchases quick-entered from this Supplier page (no item
 * picker) and bulk-imported rows never get a PurchaseInvoice at all —
 * `invoice` stays null for those and the caller just shows the flat fields.
 */
export const GET = handle(async (req, ctx: any) => {
  const { id, transactionId } = await ctx.params;
  const { shop } = await requireShop(req);

  const supplier = await prisma.supplier.findFirst({ where: { id, shopId: shop.id } });
  if (!supplier) throw new ApiError(404, 'Supplier not found');

  const txn = await prisma.supplierTransaction.findFirst({ where: { id: transactionId, supplierId: id } });
  if (!txn) throw new ApiError(404, 'Transaction not found');

  const creditDays = Number((supplier as any).creditDays) || 0;
  const dueDate = txn.type !== 'payment' && creditDays > 0 && txn.createdAt
    ? new Date(new Date(txn.createdAt).getTime() + creditDays * 86400000)
    : null;

  let invoice: any = null;
  const match = txn.note?.match(/^Purchase Invoice: (.+)$/);
  if (match) {
    const key = match[1].trim();
    const found = await prisma.purchaseInvoice.findFirst({
      where: { supplierId: id, OR: [{ id: key }, { invoiceNumber: key }] },
      include: {
        purchaseItems: {
          include: { product: { select: { name: true, baseUnit: true } } },
        },
      },
    });
    if (found) {
      invoice = {
        invoiceNumber: found.invoiceNumber,
        date: found.date,
        totalCost: found.totalCost,
        gst: found.gst,
        items: found.purchaseItems.map((pi) => ({
          productName: pi.product?.name || 'Unknown product',
          unit: pi.product?.baseUnit || '',
          variant: pi.variantKey || null,
          quantity: pi.quantity,
          cost: pi.cost,
          gst: pi.gst,
          mrp: pi.mrp,
          discountPercent: pi.discountPercent,
          total: Math.round((pi.quantity || 0) * (pi.cost || 0) * 100) / 100,
        })),
      };
    }
  }

  return json({
    transaction: {
      id: txn.id,
      type: txn.type,
      amount: Number(txn.amount) || 0,
      note: txn.note || '',
      billNumber: txn.billNumber || '',
      date: txn.createdAt,
      dueDate,
    },
    supplier: { id: supplier.id, name: supplier.name },
    invoice,
  });
});

/**
 * PATCH /api/v1/suppliers/[id]/transactions/[transactionId]
 * Body: { amount?, note?, billNumber? }
 *
 * Correct the amount (or note/bill number) of an existing purchase/payment —
 * e.g. an imported bill whose total was off because some rows were skipped, so
 * the shopkeeper re-opens it and types the real amount. The supplier's
 * outstanding balance is adjusted by the delta (a purchase contributes +amount,
 * a payment −amount), so Purchased / Remaining stay correct, and any linked
 * PurchaseInvoice total is kept in sync so the Purchases module matches too.
 */
export const PATCH = handle(async (req, ctx: any) => {
  const { id, transactionId } = await ctx.params;
  const { shop } = await requireShop(req);

  const supplier = await prisma.supplier.findFirst({ where: { id, shopId: shop.id } });
  if (!supplier) throw new ApiError(404, 'Supplier not found');
  const txn = await prisma.supplierTransaction.findFirst({ where: { id: transactionId, supplierId: id } });
  if (!txn) throw new ApiError(404, 'Transaction not found');

  const body = await readBody<{ amount?: number | string; note?: string; billNumber?: string }>(req);
  const newAmount = parseFloat(String(body.amount ?? ''));
  if (!isFinite(newAmount) || newAmount <= 0) throw new ApiError(400, 'A positive amount is required');

  const oldAmount = Number(txn.amount) || 0;
  // Purchase adds to what's owed (+), payment/purchase_return reduces it
  // (−) — see lib/server/ledgerClassification.ts. Adjust the balance by the
  // signed change so Remaining reflects the corrected amount.
  const sign = isSupplierCredit(txn.type) ? -1 : 1;
  const balanceDelta = sign * (newAmount - oldAmount);
  const nextBillNumber = body.billNumber !== undefined ? (String(body.billNumber).trim() || null) : txn.billNumber;

  const result = await prisma.$transaction(async (tx) => {
    const updatedTxn = await tx.supplierTransaction.update({
      where: { id: transactionId },
      data: {
        amount: newAmount,
        ...(body.note !== undefined ? { note: String(body.note).trim() || txn.note } : {}),
        ...(body.billNumber !== undefined ? { billNumber: nextBillNumber } : {}),
      },
    });
    const updatedSupplier = await tx.supplier.update({
      where: { id },
      data: { balance: { increment: balanceDelta } },
    });
    // Best-effort: keep a linked PurchaseInvoice's total in step (matched by
    // the bill number the importer / Purchases module stamped on both).
    if (txn.type !== 'payment' && nextBillNumber) {
      await tx.purchaseInvoice.updateMany({
        where: { supplierId: id, invoiceNumber: nextBillNumber },
        data: { totalCost: newAmount },
      });
    }
    await tx.activityLog.create({
      data: {
        shopId: shop.id,
        action: 'supplier_txn_amount_edited',
        entityId: transactionId,
        details: { entityType: 'supplier', name: supplier.name, oldAmount, newAmount },
      },
    }).catch(() => {});
    return { transaction: { id: updatedTxn.id, amount: newAmount }, remaining: Number(updatedSupplier.balance) || 0 };
  });

  return json(result);
});
