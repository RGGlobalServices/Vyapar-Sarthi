import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = handle(async (req, ctx: any) => {
  const params = await ctx.params;
  const { shop } = await requireShop(req);
  const { id, stageId, inputId } = await params;
  const body = await readBody<any>(req);

  const stageInput = await prisma.batchStageInput.findFirst({
    where: {
      id: inputId,
      stageSnapshot: {
        id: stageId,
        snapshot: { productionBatchId: id, batch: { shopId: shop.id } }
      }
    },
    include: {
      stageSnapshot: true
    }
  });

  if (!stageInput) throw new ApiError(404, 'Input not found', 'INPUT_NOT_FOUND');
  if (stageInput.stageSnapshot.status !== 'IN_PROGRESS') {
    throw new ApiError(400, 'Stage must be IN_PROGRESS to record inputs', 'INVALID_STATUS');
  }

  const { actualQuantity, actualUnit, sourceLotId, wipLotId, batchInputLotId, notes } = body;

  let validatedLotId = stageInput.sourceLotId;
  if (sourceLotId) {
    const lot = await prisma.rawMaterialLot.findFirst({
      where: { id: sourceLotId, shopId: shop.id }
    });
    if (!lot) throw new ApiError(404, 'Source lot not found', 'LOT_NOT_FOUND');
    if (lot.productId !== stageInput.productId) {
      throw new ApiError(400, 'Source lot product does not match configured product', 'PRODUCT_MISMATCH');
    }
    validatedLotId = lot.id;
  }

  let validatedWipLotId = stageInput.wipLotId;
  if (wipLotId) {
    const wip = await prisma.wipLot.findFirst({
      where: { id: wipLotId, shopId: shop.id }
    });
    if (!wip) throw new ApiError(404, 'WIP Lot not found', 'WIP_LOT_NOT_FOUND');
    if (wip.status === 'FULLY_CONSUMED' || wip.status === 'BLOCKED') {
      throw new ApiError(400, `WIP Lot #${wip.lotNumber} is ${wip.status.toLowerCase().replace('_', ' ')}`, 'WIP_UNAVAILABLE');
    }
    validatedWipLotId = wip.id;
  }

  const updated = await prisma.batchStageInput.update({
    where: { id: inputId },
    data: {
      actualQuantity: actualQuantity !== undefined ? actualQuantity : stageInput.actualQuantity,
      actualUnit: actualUnit !== undefined ? actualUnit : stageInput.actualUnit,
      sourceLotId: validatedLotId,
      wipLotId: validatedWipLotId,
      batchInputLotId: batchInputLotId !== undefined ? batchInputLotId : stageInput.batchInputLotId,
      notes: notes !== undefined ? notes : stageInput.notes,
    }
  });

  return json(updated);
});
