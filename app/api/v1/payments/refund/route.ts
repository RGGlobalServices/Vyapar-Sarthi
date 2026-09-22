import { initiateRefund } from '@/lib/server/payu';
import { requireAdmin } from '@/lib/server/auth';
import prisma from '@/lib/server/prisma';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Manual PayU refund. No screen in the app calls this — subscription
// cancellation refunds go through initiateRefund() directly inside
// payments/cancel-subscription — so it is a back-office tool and is restricted
// to platform admins. It previously had no authentication at all, so anyone who
// knew a PayU transaction id could trigger a refund with the merchant salt.
export const POST = handle(async (req) => {
  await requireAdmin(req);

  const { mihpayid, amount } = await readBody(req);
  if (!mihpayid || !amount) throw new ApiError(400, 'mihpayid and amount are required');

  const value = Number(amount);
  if (!isFinite(value) || value <= 0) throw new ApiError(400, 'amount must be a positive number');

  // Only refund a charge we actually recorded, and never more than was paid.
  const txn = await prisma.paymentTransaction.findFirst({ where: { mihpayid: String(mihpayid) } });
  if (!txn) throw new ApiError(404, 'Payment transaction not found');
  if (value > Number(txn.amount)) throw new ApiError(400, 'Refund amount exceeds the amount paid');

  const result = await initiateRefund(String(mihpayid), value);
  return json(result);
});
