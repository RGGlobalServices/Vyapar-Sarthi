import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { toKg, lotSource } from '@/lib/server/millProduction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Neutral default only — a mill names its own stages (rice, wheat, millet … differ), see `stages` in the POST body.
const DEFAULT_STAGES = ['cleaning', 'processing', 'packing'];

function parseStages(raw: any): string[] {
  if (raw === undefined || raw === null) return DEFAULT_STAGES;
  if (!Array.isArray(raw)) throw new ApiError(400, 'stages must be a list of stage names', 'INVALID_STAGES');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    const name = String(x ?? '').trim().slice(0, 40);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  if (out.length === 0) return DEFAULT_STAGES;
  if (out.length > 20) throw new ApiError(400, 'At most 20 stages per batch', 'INVALID_STAGES');
  return out;
}

/**
 * Production batches — one run of the mill pipeline consuming a raw lot and
 * producing user-defined outputs. Stages are advanced through /mill/batches/[id]/stages, and the run is closed — raw material
 * consumed, outputs booked, balance enforced — through /mill/batches/[id]/finalize.
 *
 * GET  /api/v1/mill/batches — list with rawLot + stages, newest first
 * POST /api/v1/mill/batches — create; auto-numbers B-YYYYMMDD-NNN if not given, requires a raw material lot with enough
 *                              stock, seeds the (user-defined) stages. The raw material is NOT consumed here — it is consumed,
 *                              atomically and re-validated, when the batch is finalized.
 */

async function nextBatchNumber(shopId: string): Promise<string> {
  const d = new Date();
  const prefix = `B-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  // Small race window here — two concurrent creates on the same day could both
  // land on -001; the (shop_id, batch_number) UNIQUE index will reject the
  // loser, and the caller can retry. Good enough for a mill-floor workload.
  const same = await (prisma as any).productionBatch.count({
    where: { shopId, batchNumber: { startsWith: prefix } },
  });
  return `${prefix}-${String(same + 1).padStart(3, '0')}`;
}

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const url = new URL(req.url);
  const status = url.searchParams.get('status'); // 'open' | 'in_progress' | 'closed'

  const where: any = { shopId: shop.id };
  if (status) where.status = status;

  const rows = await (prisma as any).productionBatch.findMany({
    where,
    include: {
      rawLot: { select: { id: true, lotNumber: true, weightKg: true, remainingKg: true, farmerName: true, moisturePct: true, ratePerKg: true, notes: true, purchaseDate: true, product: { select: { id: true, name: true } }, weighbridgeEntries: { select: { slipNumber: true } } } },
      stages: { orderBy: { sequence: 'asc' } },
      byProducts: { select: { id: true, name: true, quantityKg: true, soldKg: true } },
      outputs: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { startedAt: 'desc' },
    take: 200,
  });

  return json(rows.map((b: any) => {
    if (!b.rawLot) return b;
    const { weighbridgeEntries, notes, ...lot } = b.rawLot;
    return { ...b, rawLot: { ...lot, ...lotSource(b.rawLot) } };
  }));
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);

  // The input is entered in a weight unit (kg / quintal / ton / g) and always stored in kg — converted here, never by the client.
  const enteredQty = Number(body.inputQuantity ?? body.inputKg);
  if (!isFinite(enteredQty) || enteredQty <= 0) {
    throw new ApiError(400, 'Input quantity must be a positive number', 'INVALID_QUANTITY');
  }
  const inputKg = toKg(enteredQty, body.unit ?? 'kg');
  if (inputKg <= 0) throw new ApiError(400, 'Input quantity must be a positive number', 'INVALID_QUANTITY');

  if (body.productId) {
    const own = await prisma.product.findFirst({ where: { id: String(body.productId), shopId: shop.id }, select: { id: true } });
    if (!own) throw new ApiError(404, 'Product not found for this shop', 'PRODUCT_NOT_FOUND');
  }
  const rawLotId: string | null = body.rawLotId || null;
  if (!rawLotId) throw new ApiError(400, 'Select the raw material lot this batch will consume.', 'RAW_LOT_REQUIRED');
  const stageNames = parseStages(body.stages);
  // If a source lot is specified, hard-fail when it doesn't belong to this
  // shop OR when the input exceeds its remaining weight. Silently proceeding
  // with a stale rawLotId would leave the batch orphaned from raw-material
  // accounting and break the recovery %.
  let rawLot: any = null;
  if (rawLotId) {
    rawLot = await (prisma as any).rawMaterialLot.findFirst({
      where: { id: rawLotId, shopId: shop.id },
    });
    if (!rawLot) throw new ApiError(404, 'Source raw material lot not found for this shop', 'LOT_NOT_FOUND');
    if (!rawLot.productId) throw new ApiError(400, 'Link this raw material lot to its raw material product (Raw Material screen) before producing from it — that is the stock the run consumes.', 'RAW_PRODUCT_REQUIRED');
    if ((Number(rawLot.remainingKg) || 0) <= 0) throw new ApiError(400, 'That raw material lot is fully consumed — choose an available lot.', 'LOT_UNAVAILABLE');
    if (body.productId && rawLot.productId && body.productId !== rawLot.productId) throw new ApiError(400, 'The selected raw material does not match that lot.', 'PRODUCT_LOT_MISMATCH');
    if ((rawLot.remainingKg ?? rawLot.weightKg ?? 0) < inputKg) {
      throw new ApiError(400, `Only ${rawLot.remainingKg ?? rawLot.weightKg ?? 0} kg remaining in that lot — cannot start a ${inputKg} kg batch`, 'INSUFFICIENT_RAW_STOCK');
    }
  }

  const batchNumber = (body.batchNumber || '').toString().trim()
    || await nextBatchNumber(shop.id);

  const startedAt = body.startedAt ? new Date(body.startedAt) : new Date();

  // Optional up-front pick of which finished-good Product this batch will
  // produce (e.g. "Rice" from a "Paddy" lot) — closing the batch later
  // credits this product's stock automatically. Left null, closing the
  // batch just records weights/recovery% same as before this field existed.
  let outputProductId: string | null = body.outputProductId || null;
  if (outputProductId) {
    const product = await prisma.product.findFirst({ where: { id: outputProductId, shopId: shop.id } });
    if (!product) throw new ApiError(400, 'Output product not found for this shop');
  }

  const plannedOutputKg = body.plannedOutputKg !== undefined && body.plannedOutputKg !== ''
    ? Number(body.plannedOutputKg) : null;

  // Two writes in a transaction so we never charge a lot without a batch or
  // create a batch that references an unchanged lot.
  const result = await prisma.$transaction(async (tx) => {
    const created = await (tx as any).productionBatch.create({
      data: {
        shopId: shop.id,
        batchNumber,
        rawLotId,
        outputProductId,
        plannedOutputKg,
        inputKg,
        status: 'open',
        currentStage: stageNames[0],
        startedAt,
        notes: (body.notes || '').trim() || null,
      },
    });

    // Seed the stages upfront (each "pending"); the workflow PATCHes them.
    await (tx as any).batchStage.createMany({
      data: stageNames.map((name, i) => ({
        batchId: created.id,
        stageName: name,
        sequence: i + 1,
        inputKg: i === 0 ? inputKg : null,
      })),
    });

    // Marks a batch started under this workflow: its raw material is consumed at finalization (older batches, which took their
    // kilos out of the lot right here, have no marker and are not charged twice).
    await tx.stockMovement.create({ data: { shopId: shop.id, productId: rawLot.productId, type: 'production_start', quantity: 0, referenceId: created.id } });

    return created;
  }, { timeout: 15000, maxWait: 10000 }).catch((e: any) => {
    if (e?.code === 'P2002') throw new ApiError(409, `Batch number ${batchNumber} already exists.`, 'BATCH_NUMBER_EXISTS');
    throw e;
  });

  // Return with the seeded stages so the caller can render the progress bar
  // immediately without another round-trip.
  const full = await (prisma as any).productionBatch.findUnique({
    where: { id: result.id },
    include: { stages: { orderBy: { sequence: 'asc' } }, rawLot: { select: { lotNumber: true, farmerName: true } } },
  });

  return json(full, 201);
});
