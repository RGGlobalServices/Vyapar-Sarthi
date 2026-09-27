import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';
import { getRejectionTraceabilityService } from '@/lib/server/rejectionService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  const { shop } = await requireShop(req);
  const { id } = await params;

  const batch = await prisma.productionBatch.findFirst({
    where: { id: id, shopId: shop.id },
    select: { id: true, batchNumber: true, batchType: true, rejectionLotId: true },
  });

  if (!batch) {
    throw new ApiError(404, 'Production Batch not found', 'NOT_FOUND');
  }

  if (!batch.rejectionLotId) {
    return json({ isReprocessingBatch: false, sourceRejection: null });
  }

  const traceability = await getRejectionTraceabilityService(shop.id, batch.rejectionLotId);

  return json({
    isReprocessingBatch: true,
    batchId: batch.id,
    batchNumber: batch.batchNumber,
    batchType: batch.batchType,
    sourceRejection: traceability.rejectionLot,
    originGenealogy: traceability.origin,
  });
});
