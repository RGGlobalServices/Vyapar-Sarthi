import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';

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
