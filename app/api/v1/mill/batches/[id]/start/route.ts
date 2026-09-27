import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';
import { lotSource, canonicalReceivedDate, computeLotQuantities } from '@/lib/server/millProduction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/mill/batches/[id]/start — hand a batch over to Production: open → in_progress.
 *
 * Starting consumes NOTHING: raw material is still taken, atomically and re-validated, when the batch is finalized.
 * Returns the full batch (with rawLot) so the client can do an optimistic SWR cache patch without a round-trip refetch.
 */
export const POST = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) throw new ApiError(404, 'Production batch not found');

  const { shop } = await requireShop(req);

  // Conditional update — concurrent starts get exactly one 200 and one 409.
  const moved = await (prisma as any).productionBatch.updateMany({
    where: { id, shopId: shop.id, status: 'open' },
    data: { status: 'in_progress' },
  });
  if (moved.count === 0) {
    const b = await (prisma as any).productionBatch.findFirst({ where: { id, shopId: shop.id }, select: { status: true } });
    if (!b) throw new ApiError(404, 'Production batch not found');
    throw new ApiError(
      409,
      b.status === 'closed' ? 'This batch is already finalized.' : 'This batch is already in production.',
      b.status === 'closed' ? 'BATCH_FINALIZED' : 'BATCH_ALREADY_STARTED',
    );
  }

  // Return the full batch with rawLot so the client can patch its SWR cache immediately.
  const batch = await (prisma as any).productionBatch.findFirst({
    where: { id, shopId: shop.id },
    include: {
      stages: { orderBy: { sequence: 'asc' } },
      rawLot: {
        select: {
          id: true, lotNumber: true, quantity: true, remainingQuantity: true,
          farmerName: true, moisturePct: true, ratePerUnit: true,
          purchaseDate: true, createdAt: true,
          product: { select: { id: true, name: true } },
          weighbridgeEntries: { select: { slipNumber: true } },
          batches: { select: { inputKg: true, status: true } },
        },
      },
    },
  });

  if (batch?.rawLot) {
    const { weighbridgeEntries, batches: rawBatches, ...lot } = batch.rawLot;
    const src = lotSource(batch.rawLot);
    const recDate = canonicalReceivedDate(batch.rawLot);
    const qty = computeLotQuantities(batch.rawLot);
    batch.rawLot = {
      ...lot,
      ...src,
      receivedDate: recDate.toISOString(),
      receivedKg: qty.quantity,
      allocatedKg: qty.allocatedKg,
      consumedKg: qty.consumedKg,
      availableKg: qty.availableKg,
      operationalStatus: qty.operationalStatus,
    };
  }

  return json(batch);
});
