import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { parseStageExtras, round3, BALANCE_TOLERANCE_KG } from '@/lib/server/millProduction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; stageId: string }> };

/**
 * PATCH /api/v1/mill/batches/[id]/stages/[stageId]
 *
 * Updates a single stage row (input/output/wastage/operator/notes). When the
 * client marks a stage completed (sends `completed: true`), the parent
 * batch's currentStage is auto-advanced to the next stage in the sequence,
 * and the batch flips to 'in_progress' if it was 'open'. When ALL stages
 * are complete, the batch is left in 'in_progress' — the operator still has
 * to finalize it (POST /finalize) with its outputs and loss.
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
  if (batch.status === 'closed') throw new ApiError(409, 'This batch is finalized.', 'BATCH_FINALIZED');

  const body = await readBody<any>(req);

  const patch: any = {};
  if (body.inputKg !== undefined)      patch.inputKg      = body.inputKg === null || body.inputKg === '' ? null : Number(body.inputKg);
  if (body.outputKg !== undefined)     patch.outputKg     = body.outputKg === null || body.outputKg === '' ? null : Number(body.outputKg);
  if (body.wastageKg !== undefined)    patch.wastageKg    = body.wastageKg === null || body.wastageKg === '' ? null : Number(body.wastageKg);
  if (body.operatorName !== undefined) patch.operatorName = body.operatorName == null ? null : String(body.operatorName).trim() || null;
  if (body.notes !== undefined)        patch.notes        = body.notes == null ? null : String(body.notes).trim() || null;

  // Extra results of this stage (tukada, kani, bhusa … whatever the mill calls them). Informational: stock moves only at finalize.
  if (body.extras !== undefined) {
    const extras = parseStageExtras(body.extras);
    const inKg = patch.inputKg !== undefined ? patch.inputKg : stage.inputKg;
    const outKg = patch.outputKg !== undefined ? patch.outputKg : stage.outputKg;
    const waste = patch.wastageKg !== undefined ? patch.wastageKg : stage.wastageKg;
    const total = round3((outKg || 0) + (waste || 0) + extras.reduce((a, e) => a + e.kg, 0));
    if (inKg != null && total > inKg + BALANCE_TOLERANCE_KG) {
      throw new ApiError(400, `Output + wastage + extras (${total} kg) exceed this stage's input of ${inKg} kg.`, 'STAGE_BALANCE');
    }
    patch.extras = extras.length ? extras : null;
  }

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
      const order: string[] = batch.stages.map((s: any) => s.stageName);
      const idx = order.indexOf(stage.stageName);
      const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : stage.stageName;
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
