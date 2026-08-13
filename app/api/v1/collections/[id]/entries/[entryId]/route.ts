import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { isWholesaleTierPackage } from '@/lib/config/packageConfig';
import { applyCustomerPayment, reverseCustomerPayment } from '@/lib/server/customerPayment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; entryId: string }> };

const PAYMENT_MODES = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque'];

// PATCH /collections/:id/entries/:entryId { amount?, paymentMode?, note? }
// The party a row belongs to is immutable — reassigning it is a delete +
// add, not an edit (matches "delete party, Add party" from the request).
// Correcting the amount/method after the fact reverses whatever payment
// this row already posted, then re-applies fresh with the new values, so
// the party's balance is always exactly what the current row says.
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id, entryId } = await params;
  const { shop } = await requireShop(req);
  if (!isWholesaleTierPackage(shop.packageType)) throw new ApiError(403, 'Udyog package required');

  const sheet = await prisma.collectionSheet.findFirst({ where: { id, shopId: shop.id } });
  if (!sheet) throw new ApiError(404, 'Collection not found');

  const entry = await prisma.collectionEntry.findFirst({ where: { id: entryId, sheetId: id } });
  if (!entry) throw new ApiError(404, 'Entry not found');

  const data = await readBody(req);
  const amount = data.amount !== undefined ? Number(data.amount) : entry.amount;
  const paymentMode = data.paymentMode !== undefined ? String(data.paymentMode) : entry.paymentMode;
  const note = data.note !== undefined ? String(data.note).trim() || undefined : entry.note ?? undefined;

  if (!amount || amount <= 0) throw new ApiError(400, 'Amount must be greater than 0');
  if (!PAYMENT_MODES.includes(paymentMode)) throw new ApiError(400, 'Invalid payment method');

  if (entry.customerTransactionId) {
    await reverseCustomerPayment({
      shopId: shop.id,
      customerId: entry.customerId,
      customerTransactionId: entry.customerTransactionId,
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const { customerTransactionId } = await applyCustomerPayment(tx, {
      shopId: shop.id,
      customerId: entry.customerId,
      amount,
      paymentMode,
      note,
    });
    return tx.collectionEntry.update({
      where: { id: entryId },
      data: { amount, paymentMode, note, customerTransactionId },
      include: { customer: { select: { id: true, name: true, mobile: true, totalDue: true } } },
    });
  }, { timeout: 15000, maxWait: 10000 });

  return json(updated);
});

// DELETE /collections/:id/entries/:entryId — reverses the payment this row
// posted (if any), then removes the row.
export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id, entryId } = await params;
  const { user, shop } = await requireShop(req);
  if (!isWholesaleTierPackage(shop.packageType)) throw new ApiError(403, 'Udyog package required');

  const sheet = await prisma.collectionSheet.findFirst({ where: { id, shopId: shop.id } });
  if (!sheet) throw new ApiError(404, 'Collection not found');

  const entry = await prisma.collectionEntry.findFirst({ where: { id: entryId, sheetId: id } });
  if (!entry) throw new ApiError(404, 'Entry not found');

  if (entry.customerTransactionId) {
    await reverseCustomerPayment({
      shopId: shop.id,
      customerId: entry.customerId,
      customerTransactionId: entry.customerTransactionId,
      deletedBy: user.email,
    });
  }

  await prisma.collectionEntry.delete({ where: { id: entryId } });

  return json({ detail: 'Entry deleted' });
});
