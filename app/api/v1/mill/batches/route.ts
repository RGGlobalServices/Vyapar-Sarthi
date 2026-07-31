import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAGES = ['cleaning', 'drying', 'shelling', 'polishing', 'packing'] as const;

/**
 * Production batches — one run of the mill pipeline consuming a raw lot and
 * producing finished grain + by-products. Phase 2 exposes list + create; the
 * Phase 3 workflow UI will advance stages and enter output quantities through
 * a dedicated /mill/batches/[id]/stages endpoint.
 *
 * GET  /api/v1/mill/batches — list with rawLot + stages, newest first
 * POST /api/v1/mill/batches — create; auto-numbers B-YYYYMMDD-NNN if not given,
 *                              decrements RawMaterialLot.remainingKg by inputKg,
 *                              and seeds the 5 canonical BatchStages so the UI
 *                              can render a progress bar from day one.
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
      rawLot: { select: { id: true, lotNumber: true, weightKg: true, farmerName: true, product: { select: { name: true } } } },
      stages: { orderBy: { sequence: 'asc' } },
      byProducts: { select: { id: true, name: true, quantityKg: true, soldKg: true } },
    },
    orderBy: { startedAt: 'desc' },
    take: 200,
  });

  return json(rows);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);

  const inputKg = Number(body.inputKg);
  if (!isFinite(inputKg) || inputKg <= 0) {
    throw new ApiError(400, 'inputKg must be a positive number');
  }

  const rawLotId: string | null = body.rawLotId || null;
  // If a source lot is specified, hard-fail when it doesn't belong to this
  // shop OR when the input exceeds its remaining weight. Silently proceeding
  // with a stale rawLotId would leave the batch orphaned from raw-material
  // accounting and break the recovery %.
  let rawLot: any = null;
  if (rawLotId) {
    rawLot = await (prisma as any).rawMaterialLot.findFirst({
      where: { id: rawLotId, shopId: shop.id },
    });
    if (!rawLot) throw new ApiError(400, 'Source raw material lot not found for this shop');
    if ((rawLot.remainingKg ?? rawLot.weightKg ?? 0) < inputKg) {
      throw new ApiError(400, `Only ${rawLot.remainingKg ?? rawLot.weightKg ?? 0} kg remaining in that lot — cannot start a ${inputKg} kg batch`);
    }
  }

  const batchNumber = (body.batchNumber || '').toString().trim()
    || await nextBatchNumber(shop.id);

  const startedAt = body.startedAt ? new Date(body.startedAt) : new Date();

  // Two writes in a transaction so we never charge a lot without a batch or
  // create a batch that references an unchanged lot.
  const result = await prisma.$transaction(async (tx) => {
    const created = await (tx as any).productionBatch.create({
      data: {
        shopId: shop.id,
        batchNumber,
        rawLotId,
        inputKg,
        status: 'open',
        currentStage: 'cleaning',
        startedAt,
        notes: (body.notes || '').trim() || null,
      },
    });

    // Seed the five canonical stages upfront (each in "pending" state — no
    // startedAt except the first). The Phase 3 workflow just PATCHes these.
    await (tx as any).batchStage.createMany({
      data: STAGES.map((name, i) => ({
        batchId: created.id,
        stageName: name,
        sequence: i + 1,
        inputKg: i === 0 ? inputKg : null,
      })),
    });

    if (rawLot) {
      await (tx as any).rawMaterialLot.update({
        where: { id: rawLot.id },
        data: { remainingKg: Math.max(0, (rawLot.remainingKg ?? rawLot.weightKg ?? 0) - inputKg) },
      });
    }

    return created;
  });

  // Return with the seeded stages so the caller can render the progress bar
  // immediately without another round-trip.
  const full = await (prisma as any).productionBatch.findUnique({
    where: { id: result.id },
    include: { stages: { orderBy: { sequence: 'asc' } }, rawLot: { select: { lotNumber: true, farmerName: true } } },
  });

  return json(full, 201);
});
