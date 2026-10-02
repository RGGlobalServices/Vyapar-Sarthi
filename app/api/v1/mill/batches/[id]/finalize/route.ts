import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { parseLossKg, parseOutputs } from '@/lib/server/millProduction';
import { prepareOutputCredits, finalizeBatchTx, afterBatchFinalized } from '@/lib/server/productionFinalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

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
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) throw new ApiError(404, 'Production batch not found');

  const owned = await prisma.productionBatch.findFirst({ where: { id, shopId: shop.id }, select: { id: true } });
  if (!owned) throw new ApiError(404, 'Production batch not found');

  const credits = await prepareOutputCredits(shop.id, outputs);

  const finalized = await prisma.$transaction(
    (tx) => finalizeBatchTx(tx, { shopId: shop.id, batchId: id, credits, lossKg, notes: body.notes, allowNegativeStock, jwOrder: null }),
    { timeout: 90000, maxWait: 15000 },
  );

  afterBatchFinalized({ shopId: shop.id, batchId: id, finishedKg: finalized.finishedKg, lossKg, isJobWork: finalized.isJobWork, events: finalized.events });

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
