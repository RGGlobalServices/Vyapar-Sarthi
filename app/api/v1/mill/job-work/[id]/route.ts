import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { applyCustomerPayment } from '@/lib/server/customerPayment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/mill/job-work/[id] — advance a job-work order through its
 * lifecycle (received -> processing -> completed). The 'complete' action is
 * the only one that moves money: it computes feeAmount from the order's own
 * ratePerKg/feeBasis, posts a customer_transactions charge (mirrors how
 * Purchases posts a SupplierTransaction — same "charge now, pay now or
 * later" shape), and — if the shopkeeper collected payment on the spot —
 * immediately applies it via the same applyCustomerPayment() helper Receipts
 * and the Collection Register use, so the customer's running balance nets
 * out correctly either way.
 *
 * The charge and the payment are two SEPARATE short `$transaction()` calls,
 * not one combined one — this remote DB's interactive-transaction timeout is
 * only 5000ms (see feedback_prisma_interactive_transaction_latency), and a
 * first attempt that bundled the order update + charge + applyCustomerPayment
 * (up to 8 sequential round trips) hit exactly that: "Transaction already
 * closed... timeout for this transaction was 5000 ms". applyCustomerPayment's
 * own doc comment already says to give it its own transaction — this just
 * follows that instead of fighting it.
 */
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const existing = await (prisma as any).jobWorkOrder.findFirst({ where: { id, shopId: shop.id } });
  if (!existing) throw new ApiError(404, 'Job work order not found');

  const body = await readBody<any>(req);
  const action = body.action;

  if (action === 'start') {
    if (existing.status !== 'received') throw new ApiError(400, 'Only a received order can start processing');
    const updated = await (prisma as any).jobWorkOrder.update({
      where: { id },
      data: { status: 'processing' },
    });
    return json(updated);
  }

  if (action === 'complete') {
    if (existing.status === 'completed') throw new ApiError(400, 'Order is already completed');

    const outputWeightKg = Number(body.outputWeightKg);
    if (!isFinite(outputWeightKg) || outputWeightKg <= 0) throw new ApiError(400, 'outputWeightKg must be a positive number');

    const basisWeight = existing.feeBasis === 'output' ? outputWeightKg : existing.inputWeightKg;
    const feeAmount = Math.round(basisWeight * existing.ratePerKg * 100) / 100;

    const amountPaid = body.amountPaid != null && body.amountPaid !== '' ? Number(body.amountPaid) : 0;
    if (amountPaid < 0 || amountPaid > feeAmount) throw new ApiError(400, 'amountPaid must be between 0 and the fee amount');

    // Charge the full fee to the customer's running balance first (same
    // "udhar" shape Purchases/Billing already use for a bill on account) —
    // never skip the charge even when fully paid now, so the party ledger
    // shows the real transaction instead of nothing happening.
    const [updated] = await prisma.$transaction([
      (prisma as any).jobWorkOrder.update({
        where: { id },
        data: {
          outputWeightKg,
          feeAmount,
          status: 'completed',
          completedAt: new Date(),
        },
      }),
      prisma.customer.update({
        where: { id: existing.customerId },
        data: { totalDue: { increment: feeAmount } },
      }),
      prisma.customer_transactions.create({
        data: {
          customer_id: existing.customerId,
          type: 'job_work',
          amount: feeAmount,
          note: `Job work milling charge: ${existing.orderNumber}`,
          bill_number: existing.orderNumber,
        },
      }),
    ]);

    // Own short transaction, same as every other caller of this helper —
    // nets the balance back down when the shopkeeper collected cash on the
    // spot, best-effort AFTER the charge above has already committed. This
    // is genuinely best-effort, not just documentation: an interactive
    // `$transaction(async tx => ...)` needs session affinity across several
    // round trips, which this remote DB's transaction-pooling connection
    // (see schema.prisma's datasource comment) doesn't guarantee under load
    // — live-tested this and hit "Transaction not found... old closed
    // transaction" here even with a raised timeout, while the charge above
    // (a single-round-trip array transaction) committed reliably both
    // times. So: never let a payment-recording hiccup undo or block the
    // completion itself — worst case the shopkeeper records the payment
    // separately from Receipts afterward, same as any other bill collected
    // after the fact.
    let paymentApplied = amountPaid <= 0;
    if (amountPaid > 0) {
      try {
        await prisma.$transaction(async (tx) => {
          await applyCustomerPayment(tx, {
            shopId: shop.id,
            customerId: existing.customerId,
            amount: amountPaid,
            paymentMode: body.paymentMode || 'Cash',
            note: `Job work ${existing.orderNumber}`,
          });
        }, { timeout: 20000 });
        paymentApplied = true;
      } catch (e) {
        console.error('[job-work complete] payment application failed (order still marked completed):', e);
      }
    }

    return json({ ...updated, paymentApplied });
  }

  throw new ApiError(400, 'Unknown action — expected "start" or "complete"');
});
