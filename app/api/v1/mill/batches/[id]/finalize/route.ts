import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { checkBalance, kgToProductUnit, parseLossKg, parseOutputs, round3 } from '@/lib/server/millProduction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const MOVEMENT_TYPE: Record<string, string> = {
  finished_good: 'production_output',
  by_product: 'production_byproduct',
  rejection: 'production_rejection',
};

/**
 * POST /api/v1/mill/batches/[id]/finalize
 *
 * Closes a production run: consumes the raw material and books every output, in ONE transaction.
 *
 *   body: { outputs: [{ productId?, name?, outputType: finished_good|by_product|rejection, quantity, unit, outputLotNumber?, notes? }],
 *           lossKg?, notes? }
 *
 * Everything that matters is decided here, never by the client:
 *  - the input weight is the batch's own stored input, and the raw lot's remaining stock is re-read under the lock;
 *  - the run must balance:  input = Σ outputs + loss  (an unexplained difference is rejected — it must be entered as loss or
 *    a rejection);
 *  - the batch row is locked FOR UPDATE, so a double submit cannot finalize twice, and the lot is decremented with a
 *    conditional UPDATE, so two runs can never consume the same kilos;
 *  - outputs are only linked to products the user picked — a product is never created from free text here.
 * If any step fails nothing is written.
 */
export const POST = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);

  const outputs = parseOutputs(body.outputs);
  const lossKg = parseLossKg(body.lossKg);
  const allowNegativeStock = Boolean((shop as any).allowNegativeStock);

  // The batch must be this shop's before anything else about the request is examined.
  const owned = await prisma.productionBatch.findFirst({ where: { id, shopId: shop.id }, select: { id: true } });
  if (!owned) throw new ApiError(404, 'Production batch not found');

  // Products the outputs are linked to must belong to this shop; their base unit decides how the stock credit is expressed.
  const productIds = [...new Set(outputs.map((o) => o.productId).filter(Boolean) as string[])];
  const products = productIds.length
    ? await prisma.product.findMany({ where: { id: { in: productIds }, shopId: shop.id }, select: { id: true, name: true, baseUnit: true } })
    : [];
  const productById = new Map(products.map((p) => [p.id, p]));
  for (const pid of productIds) if (!productById.has(pid)) throw new ApiError(400, 'A selected output product was not found in this shop.', 'PRODUCT_NOT_FOUND');
  const credits = outputs.map((o) => {
    const p = o.productId ? productById.get(o.productId)! : null;
    return { ...o, name: o.name || p?.name || '', stockQty: p ? kgToProductUnit(o.quantityKg, p.baseUnit, p.name ?? '') : null };
  });

  const finalized = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<any[]>`
      SELECT id, batch_number, status, input_kg, raw_lot_id FROM production_batches
      WHERE id = ${id}::uuid AND shop_id = ${shop.id}::uuid FOR UPDATE`;
    const batch = rows[0];
    if (!batch) throw new ApiError(404, 'Production batch not found');
    if (batch.status === 'closed') throw new ApiError(409, 'This batch is already finalized.', 'BATCH_ALREADY_FINALIZED');

    const inputKg = Number(batch.input_kg) || 0;
    if (inputKg <= 0) throw new ApiError(400, 'This batch has no input weight.', 'NO_INPUT');

    const outputsKg = credits.reduce((s, o) => s + o.quantityKg, 0);
    const bal = checkBalance(inputKg, outputsKg, lossKg);
    if (!bal.ok) {
      throw new ApiError(
        400,
        bal.differenceKg < 0
          ? `Outputs (${bal.outputsKg} kg) plus loss (${bal.lossKg} kg) exceed the ${bal.inputKg} kg input by ${Math.abs(bal.differenceKg)} kg.`
          : `${bal.differenceKg} kg of the ${bal.inputKg} kg input is unaccounted for — enter it as an output, a rejection or loss.`,
        'MASS_BALANCE_MISMATCH',
      );
    }

    // Batches started under this workflow carry a `production_start` marker and consume their input here. A batch started
    // by the older flow already took its kilos out of the lot when it was created, so it is not charged a second time.
    const marker = await tx.stockMovement.findFirst({ where: { shopId: shop.id, type: 'production_start', referenceId: id }, select: { id: true } });
    const consume = !!marker;

    if (consume) {
      if (!batch.raw_lot_id) throw new ApiError(400, 'This batch has no raw material lot to consume.', 'RAW_LOT_REQUIRED');
      const took = await tx.$executeRaw`
        UPDATE raw_material_lots SET remaining_kg = remaining_kg - ${inputKg}
        WHERE id = ${batch.raw_lot_id}::uuid AND shop_id = ${shop.id}::uuid AND COALESCE(remaining_kg, 0) >= ${inputKg}`;
      if (took === 0) {
        const lot = await tx.$queryRaw<any[]>`SELECT remaining_kg FROM raw_material_lots WHERE id = ${batch.raw_lot_id}::uuid AND shop_id = ${shop.id}::uuid`;
        throw new ApiError(409, `Only ${round3(Number(lot[0]?.remaining_kg) || 0)} kg is left in the raw material lot — this batch needs ${inputKg} kg.`, 'INSUFFICIENT_RAW_STOCK');
      }
      // The raw material's own product stock goes down by the same weight (floored at zero unless the shop allows negative stock,
      // since lots created by some intake paths never credited the product stock in the first place).
      const lotRow = await tx.$queryRaw<any[]>`SELECT product_id FROM raw_material_lots WHERE id = ${batch.raw_lot_id}::uuid`;
      const rawProductId: string | null = lotRow[0]?.product_id ?? null;
      if (rawProductId) {
        if (allowNegativeStock) {
          await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) - ${inputKg} WHERE id = ${rawProductId}::uuid AND shop_id = ${shop.id}::uuid`;
        } else {
          await tx.$executeRaw`UPDATE products SET current_stock = GREATEST(COALESCE(current_stock, 0) - ${inputKg}, 0) WHERE id = ${rawProductId}::uuid AND shop_id = ${shop.id}::uuid`;
        }
        await tx.stockMovement.create({ data: { shopId: shop.id, productId: rawProductId, type: 'production_consume', quantity: -inputKg, referenceId: id } });
      }
    }

    // Outputs: the traceable record, the product stock, the per-lot batch stock and (for by-products) the by-product ledger.
    const lotDefault = String(batch.batch_number);
    await tx.productionOutput.createMany({
      data: credits.map((o) => ({
        shopId: shop.id, batchId: id, productId: o.productId, name: o.name, outputType: o.outputType,
        quantity: o.quantity, unit: o.unit, quantityKg: o.quantityKg, outputLotNumber: o.outputLotNumber || lotDefault, notes: o.notes,
      })),
    });

    const perProduct = new Map<string, number>();
    for (const o of credits) if (o.productId && o.stockQty) perProduct.set(o.productId, round3((perProduct.get(o.productId) || 0) + o.stockQty));
    for (const [pid, qty] of perProduct) {
      await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) + ${qty} WHERE id = ${pid}::uuid AND shop_id = ${shop.id}::uuid`;
    }
    const tracked = credits.filter((o) => o.productId && o.stockQty);
    if (tracked.length) {
      await tx.stockMovement.createMany({
        data: tracked.map((o) => ({ shopId: shop.id, productId: o.productId!, type: MOVEMENT_TYPE[o.outputType], quantity: o.stockQty!, referenceId: id })),
      });
      // Batch-wise stock: each tracked output becomes a lot of that product carrying the production batch number.
      await tx.batch.createMany({
        data: tracked.map((o) => ({
          shopId: shop.id, productId: o.productId!, batchNumber: o.outputLotNumber || lotDefault,
          quantity: o.stockQty!, initialQuantity: o.stockQty!, mfgDate: new Date(), purchaseDate: new Date(),
        })),
      });
    }
    const byProducts = credits.filter((o) => o.outputType === 'by_product');
    if (byProducts.length) {
      await tx.byProduct.createMany({
        data: byProducts.map((o) => ({ shopId: shop.id, batchId: id, productId: o.productId, name: o.name, quantityKg: o.quantityKg, notes: o.notes })),
      });
    }

    const finishedKg = credits.filter((o) => o.outputType === 'finished_good').reduce((s, o) => s + o.quantityKg, 0);
    const lastStage = await tx.batchStage.findFirst({ where: { batchId: id }, orderBy: { sequence: 'desc' }, select: { stageName: true } });
    await tx.productionBatch.update({
      where: { id },
      data: {
        status: 'closed', closedAt: new Date(),
        outputKg: round3(finishedKg), wastageKg: lossKg,
        recoveryPct: Math.round((finishedKg / inputKg) * 10000) / 100,
        ...(lastStage ? { currentStage: lastStage.stageName } : {}),
        ...(body.notes ? { notes: String(body.notes).trim().slice(0, 250) } : {}),
      },
    });
    return { balance: bal, consumed: consume ? inputKg : 0 };
  }, { timeout: 30000, maxWait: 10000 });

  const batch = await prisma.productionBatch.findFirst({
    where: { id, shopId: shop.id },
    include: {
      rawLot: { select: { id: true, lotNumber: true, product: { select: { id: true, name: true } } } },
      stages: { orderBy: { sequence: 'asc' } },
      outputs: { orderBy: { createdAt: 'asc' } },
      byProducts: true,
    },
  });
  return json({ ...finalized, batch });
});
