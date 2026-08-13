import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { isWholesaleTierPackage } from '@/lib/config/packageConfig';
import { applyCustomerPayment } from '@/lib/server/customerPayment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// Same option set PaymentCollectionModal already offers — keep them in sync.
const PAYMENT_MODES = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque'];

// POST /collections/:id/entries { customerId, amount, paymentMode, note? }
// Adds one party row and posts it as a real payment immediately — a
// Collection sheet's draft/finalized status never gates whether a row's
// payment has applied, only whether the sheet itself is still open for
// bookkeeping edits (see the plan's Context section).
export const POST = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  if (!isWholesaleTierPackage(shop.packageType)) throw new ApiError(403, 'Udyog package required');

  const sheet = await prisma.collectionSheet.findFirst({ where: { id, shopId: shop.id } });
  if (!sheet) throw new ApiError(404, 'Collection not found');

  const data = await readBody(req);
  const customerId = data.customerId as string | undefined;
  const amount = Number(data.amount);
  const paymentMode = String(data.paymentMode || 'Cash');
  const note = data.note ? String(data.note).trim() : undefined;

  if (!customerId) throw new ApiError(400, 'Party is required');
  if (!amount || amount <= 0) throw new ApiError(400, 'Amount must be greater than 0');
  if (!PAYMENT_MODES.includes(paymentMode)) throw new ApiError(400, 'Invalid payment method');

  const customer = await prisma.customer.findFirst({ where: { id: customerId, shopId: shop.id } });
  if (!customer) throw new ApiError(404, 'Party not found');
  if (customer.customerType !== 'party') throw new ApiError(400, 'Selected customer is not a party');

  const entry = await prisma.$transaction(async (tx) => {
    const { customerTransactionId } = await applyCustomerPayment(tx, {
      shopId: shop.id,
      customerId,
      amount,
      paymentMode,
      note,
    });
    return tx.collectionEntry.create({
      data: { sheetId: id, customerId, amount, paymentMode, note, customerTransactionId },
      include: { customer: { select: { id: true, name: true, mobile: true, totalDue: true } } },
    });
  }, { timeout: 15000, maxWait: 10000 });

  return json(entry, 201);
});
