import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { applyCustomerPayment } from '@/lib/server/customerPayment';
import { round3, kgToProductUnit, BALANCE_TOLERANCE_KG } from '@/lib/server/millProduction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const INCLUDE = {
  customer: { select: { id: true, name: true, mobile: true } },
  gateEntry: { select: { id: true, entryNumber: true } },
};

/** The fee the server would charge: rate × (input or output weight, by the order's basis). Never taken from the client. */
function computeFee(order: { feeBasis: string; inputWeightKg: number; ratePerUnit: number }, outputWeightKg: number | null): number | null {
  const basisWeight = order.feeBasis === 'output' ? outputWeightKg : order.inputWeightKg;
  return basisWeight == null ? null : Math.round(basisWeight * order.ratePerUnit * 100) / 100;
}

/**
 * GET /api/v1/mill/job-work/[id] — one order with its server-calculated fee (final once completed, otherwise a preview) and the
 * by-products the mill kept from it.
 *
 * PATCH /api/v1/mill/job-work/[id] — advance the order: received → processing (`start`) → completed (`complete`).
 * The customer's grain is never the mill's stock: nothing here touches Product stock or Raw Material lots for the input or the main
 * output. Completing is the only step that moves money: it charges feeAmount to the customer (a customer_transactions row + balance),
 * exactly once — the status change is a conditional update, so two simultaneous completions cannot both charge.
 * If the mill keeps the husk/bran (`byproductRetainedByMill`) the by-products given on completion become the mill's By-Products (and
 * credit a linked product's stock); otherwise they go back to the customer and are only noted on the order.
 */
export const GET = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const order = await (prisma as any).jobWorkOrder.findFirst({ where: { id, shopId: shop.id }, include: INCLUDE });
  if (!order) throw new ApiError(404, 'Job work order not found');
  const kept = await (prisma as any).byProduct.findMany({
    where: { shopId: shop.id, notes: { startsWith: `Job work ${order.orderNumber}` } },
    select: { id: true, name: true, quantityKg: true, productId: true },
  });
  return json({ ...order, feeCalculated: order.feeAmount ?? computeFee(order, order.outputWeightKg), byProductsKept: kept });
});

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const existing = await (prisma as any).jobWorkOrder.findFirst({ where: { id, shopId: shop.id } });
  if (!existing) throw new ApiError(404, 'Job work order not found');

  const body = await readBody<any>(req);
  const action = body.action;

  if (action === 'start') {
    const moved = await (prisma as any).jobWorkOrder.updateMany({ where: { id, shopId: shop.id, status: 'received' }, data: { status: 'processing' } });
    if (moved.count === 0) throw new ApiError(409, 'Only a received order can start processing', 'INVALID_STATUS');
    return json(await (prisma as any).jobWorkOrder.findFirst({ where: { id, shopId: shop.id }, include: INCLUDE }));
  }

  if (action === 'complete') {
    if (existing.status === 'completed') throw new ApiError(409, 'Order is already completed', 'ALREADY_COMPLETED');
    if (existing.status !== 'processing') throw new ApiError(409, 'Start processing before completing the order', 'INVALID_STATUS');

    const outputWeightKg = round3(Number(body.outputWeightKg));
    if (!isFinite(outputWeightKg) || outputWeightKg <= 0) throw new ApiError(400, 'outputWeightKg must be a positive number', 'INVALID_QUANTITY');

    // By-products of the job (husk / bran …): user-named rows.
    const rawBp: any[] = Array.isArray(body.byProducts) ? body.byProducts : [];
    if (rawBp.length > 20) throw new ApiError(400, 'Too many by-product rows', 'INVALID_BYPRODUCTS');
    const bps = rawBp.map((b, i) => {
      const name = String(b?.name ?? '').trim().slice(0, 80);
      const kg = round3(Number(b?.quantityKg));
      if (!name) throw new ApiError(400, `By-product ${i + 1} needs a name`, 'INVALID_BYPRODUCTS');
      if (!isFinite(kg) || kg <= 0) throw new ApiError(400, `By-product "${name}" must be a positive number of kg`, 'INVALID_BYPRODUCTS');
      return { name, kg, productId: b?.productId ? String(b.productId) : null };
    });
    const bpTotal = bps.reduce((a, b) => a + b.kg, 0);
    // Mass balance: what comes out cannot exceed what went in.
    if (round3(outputWeightKg + bpTotal) > existing.inputWeightKg + BALANCE_TOLERANCE_KG) {
      throw new ApiError(400, `Output (${outputWeightKg} kg) plus by-products (${round3(bpTotal)} kg) exceed the ${existing.inputWeightKg} kg received.`, 'MASS_BALANCE_MISMATCH');
    }
    const productIds = [...new Set(bps.map((b) => b.productId).filter(Boolean) as string[])];
    const products = productIds.length ? await prisma.product.findMany({ where: { id: { in: productIds }, shopId: shop.id }, select: { id: true, name: true, baseUnit: true } }) : [];
    for (const pid of productIds) if (!products.some((p) => p.id === pid)) throw new ApiError(404, 'A by-product product was not found for this shop', 'PRODUCT_NOT_FOUND');

    const feeAmount = computeFee(existing, outputWeightKg) as number;
    const amountPaid = body.amountPaid != null && body.amountPaid !== '' ? Number(body.amountPaid) : 0;
    if (!isFinite(amountPaid) || amountPaid < 0 || amountPaid > feeAmount) throw new ApiError(400, 'amountPaid must be between 0 and the fee amount', 'INVALID_AMOUNT');

    const retained = existing.byproductRetainedByMill !== false;
    const tag = `Job work ${existing.orderNumber}`;
    const returnedNote = !retained && bps.length ? `\nReturned to customer: ${bps.map((b) => `${b.name} ${b.kg} kg`).join(', ')}` : '';

    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await (tx as any).jobWorkOrder.updateMany({
        where: { id, shopId: shop.id, status: 'processing' },
        data: { outputWeightKg, feeAmount, status: 'completed', completedAt: new Date(), ...(returnedNote ? { notes: `${existing.notes || ''}${returnedNote}`.trim() } : {}) },
      });
      if (claimed.count === 0) throw new ApiError(409, 'Order is already completed', 'ALREADY_COMPLETED');
      await tx.customer.update({ where: { id: existing.customerId }, data: { totalDue: { increment: feeAmount } } });
      await tx.customer_transactions.create({
        data: { customer_id: existing.customerId, type: 'job_work', amount: feeAmount, note: `Job work milling charge: ${existing.orderNumber}`, bill_number: existing.orderNumber },
      });
      // Only what the mill KEEPS becomes the mill's own by-product (and stock). The customer's grain and main output never do.
      if (retained) {
        for (const b of bps) {
          const p = b.productId ? products.find((x) => x.id === b.productId)! : null;
          const row = await (tx as any).byProduct.create({
            data: { shopId: shop.id, productId: b.productId, name: b.name, quantityKg: b.kg, notes: `${tag} — kept by the mill` },
          });
          if (p) {
            const qty = kgToProductUnit(b.kg, p.baseUnit, p.name ?? '');
            await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) + ${qty} WHERE id = ${p.id}::uuid AND shop_id = ${shop.id}::uuid`;
            await tx.stockMovement.create({ data: { shopId: shop.id, productId: p.id, type: 'byproduct_jobwork', quantity: qty, referenceId: row.id } });
          }
        }
      }
      return (tx as any).jobWorkOrder.findFirst({ where: { id }, include: INCLUDE });
    }, { timeout: 20000, maxWait: 10000 });

    // The payment is a separate, best-effort step AFTER the charge committed (same reasoning as before: it must never undo the completion).
    let paymentApplied = amountPaid <= 0;
    if (amountPaid > 0) {
      try {
        await prisma.$transaction(async (tx) => {
          await applyCustomerPayment(tx, { shopId: shop.id, customerId: existing.customerId, amount: amountPaid, paymentMode: body.paymentMode || 'Cash', note: `Job work ${existing.orderNumber}` });
        }, { timeout: 20000 });
        paymentApplied = true;
      } catch (e) {
        console.error('[job-work complete] payment application failed (order still marked completed):', e);
      }
    }
    return json({ ...updated, paymentApplied });
  }

  if (action === 'deliver') {
    if (existing.status !== 'completed') {
      throw new ApiError(400, 'Order must be completed before it can be marked as delivered/returned', 'INVALID_STATUS');
    }
    const delivered = await (prisma as any).jobWorkOrder.update({
      where: { id },
      data: { status: 'delivered', deliveredAt: new Date() },
      include: INCLUDE,
    });
    return json(delivered);
  }

  throw new ApiError(400, 'Unknown action — expected "start", "complete", or "deliver"');
});
