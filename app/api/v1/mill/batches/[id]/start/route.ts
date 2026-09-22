import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/mill/batches/[id]/start — hand a batch over to Production: open → in_progress.
 *
 * Starting consumes NOTHING: raw material is still taken, atomically and re-validated, when the batch is finalized. This is only the
 * lifecycle marker. It is a conditional update, so two people starting the same batch at once get exactly one 200 and one 409.
 */
export const POST = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const moved = await prisma.productionBatch.updateMany({
    where: { id, shopId: shop.id, status: 'open' },
    data: { status: 'in_progress' },
  });
  if (moved.count === 0) {
    const b = await prisma.productionBatch.findFirst({ where: { id, shopId: shop.id }, select: { status: true } });
    if (!b) throw new ApiError(404, 'Production batch not found');
    throw new ApiError(409, b.status === 'closed' ? 'This batch is already finalized.' : 'This batch is already in production.', b.status === 'closed' ? 'BATCH_FINALIZED' : 'BATCH_ALREADY_STARTED');
  }
  const batch = await prisma.productionBatch.findFirst({ where: { id, shopId: shop.id }, include: { stages: { orderBy: { sequence: 'asc' } } } });
  return json(batch);
});
