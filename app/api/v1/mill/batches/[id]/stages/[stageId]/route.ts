import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; stageId: string }> };

const STAGES = ['cleaning', 'drying', 'shelling', 'polishing', 'packing'] as const;

/**
 * PATCH /api/v1/mill/batches/[id]/stages/[stageId]
 *
 * Updates a single stage row (input/output/wastage/operator/notes). When the
 * client marks a stage completed (sends `completed: true`), the parent
 * batch's currentStage is auto-advanced to the next stage in the sequence,
 * and the batch flips to 'in_progress' if it was 'open'. When ALL stages
 * are complete, the batch is left in 'in_progress' — the operator still has
 * to hit "Close Batch" and enter final by-product qty on the batch-level
 * endpoint so recovery % is measured against explicit output.
 */
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id, stageId } = await params;
  const { shop } = await requireShop(req);

  const batch = await (prisma as any).productionBatch.findFirst({
    where: { id, shopId: shop.id },
    include: { stages: { orderBy: { sequence: 'asc' } } },
  });
  if (!batch) throw new ApiError(404, 'Batch not found');
  const stage = batch.stages.find((s: any) => s.id === stageId);
  if (!stage) throw new ApiError(404, 'Stage not found on this batch');

  const body = await readBody<any>(req);

  const patch: any = {};
  if (body.inputKg !== undefined)      patch.inputKg      = body.inputKg === null || body.inputKg === '' ? null : Number(body.inputKg);
  if (body.outputKg !== undefined)     patch.outputKg     = body.outputKg === null || body.outputKg === '' ? null : Number(body.outputKg);
  if (body.wastageKg !== undefined)    patch.wastageKg    = body.wastageKg === null || body.wastageKg === '' ? null : Number(body.wastageKg);
  if (body.operatorName !== undefined) patch.operatorName = String(body.operatorName).trim() || null;
  if (body.notes !== undefined)        patch.notes        = String(body.notes).trim() || null;

  const nowCompleting = body.completed === true && !stage.completedAt;
  const uncompleting  = body.completed === false && stage.completedAt;
  if (nowCompleting) patch.completedAt = new Date();
  if (uncompleting)  patch.completedAt = null;

  const updatedStage = await (prisma as any).batchStage.update({
    where: { id: stageId },
    data: patch,
  });

  // Auto-advance the batch's currentStage when the completed stage was the
  // active one — otherwise leave currentStage alone (operator might be
  // filling in a past stage retroactively).
  const batchPatch: any = {};
  if (nowCompleting) {
    if (batch.status === 'open') batchPatch.status = 'in_progress';
    if (batch.currentStage === stage.stageName) {
      const idx = STAGES.indexOf(stage.stageName as any);
      const next = idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1] : stage.stageName;
      batchPatch.currentStage = next;
      // Auto-seed the next stage's inputKg with this stage's outputKg so the
      // operator doesn't retype it — the whole pipeline is "output of stage N
      // becomes input of stage N+1", minus wastage.
      if (next !== stage.stageName && updatedStage.outputKg != null) {
        const nextStage = batch.stages.find((s: any) => s.stageName === next);
        if (nextStage && nextStage.inputKg == null) {
          await (prisma as any).batchStage.update({
            where: { id: nextStage.id },
            data: { inputKg: updatedStage.outputKg },
          });
        }
      }
    }
  }
  if (Object.keys(batchPatch).length > 0) {
    await (prisma as any).productionBatch.update({ where: { id }, data: batchPatch });
  }

  const refreshed = await (prisma as any).productionBatch.findFirst({
    where: { id },
    include: {
      rawLot: {
        include: {
          product: { select: { name: true, baseUnit: true } },
          supplier: { select: { name: true } },
        },
      },
      stages: { orderBy: { sequence: 'asc' } },
      byProducts: true,
    },
  });
  return json(refreshed);
});
