import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';
import { validateBalance } from '@/lib/server/productionExecution';
import { recordStageAuditEvent } from '@/lib/server/audit';
import { createWipLotFromStageOutput, consumeWipLots } from '@/lib/server/wipService';
import { createFinishedGoodsLot } from '@/lib/server/finishedGoodsService';
import { createByProductLot } from '@/lib/server/byProductService';
import { createRejectionLot } from '@/lib/server/rejectionService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req, ctx: any) => {
  const params = await ctx.params;
  const { shop, user } = await requireShop(req);
  const { id, stageId } = await params;

  const stage = await prisma.batchStageSnapshot.findFirst({
    where: {
      id: stageId,
      snapshot: { productionBatchId: id, batch: { shopId: shop.id } }
    },
    include: {
      inputs: {
        include: { wipLot: true }
      },
      outputs: true,
      qualityParameters: true,
      snapshot: {
        include: { stages: { orderBy: { sequence: 'asc' } } }
      }
    }
  });

  if (!stage) throw new ApiError(404, 'Stage not found', 'STAGE_NOT_FOUND');
  if (stage.status !== 'IN_PROGRESS') {
    throw new ApiError(400, 'Stage must be IN_PROGRESS to complete', 'INVALID_STATUS');
  }

  // Check blocking HOLD
  if (stage.qualityParameters.some(q => (q.result === 'HOLD' || q.result === 'REJECT') && q.isCritical)) {
    throw new ApiError(400, 'Cannot complete stage: critical quality parameters have failed (HOLD/REJECT)', 'QUALITY_HOLD');
  }

  // Check required inputs
  const missingInputs = stage.inputs.filter(i => i.isRequired && (i.actualQuantity === null || i.actualQuantity === undefined));
  if (missingInputs.length > 0) {
    throw new ApiError(400, 'All required inputs must have an actual quantity recorded', 'MISSING_INPUTS');
  }

  // Check required outputs
  const missingOutputs = stage.outputs.filter(o => o.isRequired && (o.actualQuantity === null || o.actualQuantity === undefined));
  if (missingOutputs.length > 0) {
    throw new ApiError(400, 'All required outputs must have an actual quantity recorded', 'MISSING_OUTPUTS');
  }

  // Check required quality parameters
  const missingQuality = stage.qualityParameters.filter(q => q.isRequired && (q.actualValue === null || q.actualValue === undefined));
  if (missingQuality.length > 0) {
    throw new ApiError(400, 'All required quality checks must be completed', 'MISSING_QUALITY');
  }

  // Check required execution details fields
  const batchStage = await prisma.batchStage.findFirst({
    where: { batchId: id, sequence: stage.sequence },
    include: { executionFields: true }
  });
  if (batchStage && batchStage.executionFields.length > 0) {
    const missingExec = batchStage.executionFields.filter(f => f.isRequired && (f.actualValue === null || f.actualValue === undefined || String(f.actualValue).trim() === ''));
    if (missingExec.length > 0) {
      throw new ApiError(400, `Required execution details field '${missingExec[0].fieldName}' must be completed`, 'MISSING_EXECUTION_FIELDS');
    }
  }

  // Validate mass balance
  const inputsForBalance = stage.inputs.filter(i => i.actualQuantity !== null).map(i => ({ qty: Number(i.actualQuantity), unit: String(i.actualUnit || i.unit) }));
  const outputsForBalance = stage.outputs.filter(o => o.actualQuantity !== null).map(o => ({ qty: Number(o.actualQuantity), unit: String(o.actualUnit || o.unit) }));
  
  let maxTolerance = 0;
  for (const o of stage.outputs) {
    if (o.tolerancePercent) {
      maxTolerance = Math.max(maxTolerance, Number(o.tolerancePercent));
    }
  }
  
  if (inputsForBalance.length > 0 || outputsForBalance.length > 0) {
    validateBalance(inputsForBalance, outputsForBalance, maxTolerance);
  }

  // Process transactionALLY
  await prisma.$transaction(async (tx) => {
    // 1. Decrement raw material lots for inputs
    for (const input of stage.inputs) {
      if (input.actualQuantity && input.sourceLotId) {
        const lot = await tx.rawMaterialLot.findUnique({ where: { id: input.sourceLotId } });
        if (!lot || Number(lot.remainingQuantity) < Number(input.actualQuantity)) {
          throw new ApiError(400, 'Insufficient remaining quantity in source raw material lot', 'INSUFFICIENT_STOCK');
        }
        await tx.rawMaterialLot.update({
          where: { id: input.sourceLotId },
          data: { remainingQuantity: { decrement: Number(input.actualQuantity) } }
        });
      }

      // 2. Consume WIP Lots if input references a WIP Lot
      if (input.actualQuantity && input.wipLotId) {
        await consumeWipLots(
          shop.id,
          stage.id,
          [{ wipLotId: input.wipLotId, quantity: Number(input.actualQuantity), unit: String(input.actualUnit || input.unit) }],
          tx
        );
      }
    }

    // 3. Mark stage completed
    await tx.batchStageSnapshot.update({
      where: { id: stage.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date()
      }
    });

    // 4. Legacy sync
    const legacyStage = await tx.batchStage.findFirst({
      where: { batchId: id, sequence: stage.sequence }
    });
    if (legacyStage) {
      const totalInput = inputsForBalance.reduce((sum, x) => sum + x.qty, 0);
      const totalOutput = outputsForBalance.reduce((sum, x) => sum + x.qty, 0);
      await tx.batchStage.update({
        where: { id: legacyStage.id },
        data: {
          completedAt: new Date(),
          inputKg: totalInput,
          outputKg: totalOutput
        }
      });
    }

    // 5. Create Lots for Outputs according to outputType
    for (const output of stage.outputs) {
      if (output.actualQuantity && Number(output.actualQuantity) > 0) {
        const typeNorm = String(output.outputType).toUpperCase().replace('-', '_');
        if (typeNorm === 'WIP') {
          await createWipLotFromStageOutput(
            {
              shopId: shop.id,
              batchId: id,
              sourceBatchStageId: legacyStage?.id || null,
              sourceOutputId: output.id,
              productId: output.productId,
              quantity: Number(output.actualQuantity),
              unit: String(output.actualUnit || output.unit),
              notes: output.notes
            },
            tx
          );
        } else if (typeNorm === 'FINISHED_GOOD' || typeNorm === 'FINISHED') {
          await createFinishedGoodsLot(
            {
              shopId: shop.id,
              batchId: id,
              sourceBatchStageId: legacyStage?.id || null,
              sourceOutputId: output.id,
              productId: output.productId,
              quantity: Number(output.actualQuantity),
              unit: String(output.actualUnit || output.unit),
              notes: output.notes
            },
            tx
          );
        } else if (typeNorm === 'BY_PRODUCT' || typeNorm === 'BYPRODUCT') {
          await createByProductLot(
            {
              shopId: shop.id,
              batchId: id,
              sourceBatchStageId: legacyStage?.id || null,
              sourceOutputId: output.id,
              productId: output.productId,
              quantity: Number(output.actualQuantity),
              unit: String(output.actualUnit || output.unit),
              notes: output.notes,
              isStockable: true
            },
            tx
          );
        } else if (typeNorm === 'REJECTION' || typeNorm === 'REJECT') {
          await createRejectionLot(
            {
              shopId: shop.id,
              batchId: id,
              sourceBatchStageId: legacyStage?.id || null,
              sourceOutputId: output.id,
              productId: output.productId,
              quantity: Number(output.actualQuantity),
              unit: String(output.actualUnit || output.unit),
              notes: output.notes,
              rejectionReason: output.notes || 'Stage Output Rejection'
            },
            tx
          );
        } else if (typeNorm === 'WASTE') {
          // WASTE outputs are recorded directly on the output & logged to audit
          await recordStageAuditEvent({
            shopId: shop.id,
            userId: user?.id,
            action: 'WASTE_RECORDED',
            entityId: output.id,
            details: { batchId: id, stageId: stage.id, quantity: Number(output.actualQuantity), unit: String(output.actualUnit || output.unit), notes: output.notes }
          });
        }
      }
    }

    // 6. Batch finalization check: if all stages in workflow are COMPLETED, close batch
    const allStages = stage.snapshot.stages;
    const otherPending = allStages.filter(s => s.id !== stage.id && s.status !== 'COMPLETED');
    if (otherPending.length === 0) {
      await tx.productionBatch.update({
        where: { id },
        data: {
          status: 'closed',
          closedAt: new Date(),
        },
      });

      await recordStageAuditEvent({
        shopId: shop.id,
        userId: user?.id,
        action: 'BATCH_FINALIZED',
        entityId: id,
        details: { batchId: id, finalStageId: stage.id },
      });
    }
  });

  await recordStageAuditEvent({
    shopId: shop.id,
    userId: user?.id,
    action: 'STAGE_COMPLETED',
    entityId: stage.id,
    details: { batchId: id, stageName: stage.stageName, sequence: stage.sequence },
  });

  return json({ success: true, status: 'COMPLETED' });
});
