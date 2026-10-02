import prisma from '@/lib/server/prisma';
import { ApiError } from '@/lib/server/http';
import { round3, toKg } from '@/lib/server/millProduction';
import { recordStageAuditEvent } from '@/lib/server/audit';
import { allocatedByLot } from '@/lib/server/lotAllocation';

export type InputLotInput = {
  rawMaterialLotId: string;
  quantity: number;
  unit?: string;
  notes?: string;
};

export type ValidatedInputLot = {
  rawMaterialLotId: string;
  quantity: number;
  unit: string;
  quantityKg: number;
  productName: string;
  lotNumber: string;
  farmerName?: string | null;
  supplierName?: string | null;
  availableKg: number;
};

/**
  * Centralized Raw Material Consumption Service for Production Batches
  * Validates lot ownership, stock availability, product compatibility, unit conversions,
  * and prevents double deduction while maintaining backward compatibility with legacy rawLotId.
  */

export async function validateInputLots(
  shopId: string,
  inputLots: InputLotInput[],
  targetProductId?: string | null
): Promise<ValidatedInputLot[]> {
  if (!Array.isArray(inputLots) || inputLots.length === 0) {
    throw new ApiError(400, 'At least one raw material lot must be selected', 'INPUT_LOTS_REQUIRED');
  }

  const seenLotIds = new Set<string>();
  const validated: ValidatedInputLot[] = [];

  for (const item of inputLots) {
    if (!item.rawMaterialLotId) {
      throw new ApiError(400, 'Invalid raw material lot ID', 'INVALID_LOT_ID');
    }

    if (seenLotIds.has(item.rawMaterialLotId)) {
      throw new ApiError(400, 'Duplicate raw material lot selected in batch input list', 'DUPLICATE_INPUT_LOT');
    }
    seenLotIds.add(item.rawMaterialLotId);

    const qty = Number(item.quantity);
    if (isNaN(qty) || qty <= 0) {
      throw new ApiError(400, 'Lot quantity must be greater than zero', 'INVALID_QUANTITY');
    }

    const unit = (item.unit || 'kg').trim().toLowerCase();

    // 1. Fetch raw material lot with shop isolation
    const lot = await prisma.rawMaterialLot.findFirst({
      where: { id: item.rawMaterialLotId, shopId },
      include: {
        product: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        batches: {
          where: { status: { in: ['open', 'in_progress'] } },
          select: { inputKg: true },
        },
      },
    });

    if (!lot) {
      throw new ApiError(404, `Raw material lot not found for this shop`, 'LOT_NOT_FOUND');
    }

    if (!lot.productId) {
      throw new ApiError(
        400,
        `Raw material lot #${lot.lotNumber} is not linked to a raw material product. Link it before processing.`,
        'RAW_PRODUCT_REQUIRED'
      );
    }

    // 2. Product compatibility check (if target product specified)
    if (targetProductId && lot.productId !== targetProductId) {
      throw new ApiError(
        400,
        `Raw material lot #${lot.lotNumber} (${lot.product?.name || 'Raw'}) is not compatible with batch input product`,
        'PRODUCT_LOT_MISMATCH'
      );
    }

    // 3. Stock availability check
    const unconsumedKg = round3(Number(lot.remainingQuantity ?? lot.quantity ?? 0));
    if (unconsumedKg <= 0) {
      throw new ApiError(400, `Raw material lot #${lot.lotNumber} is fully consumed.`, 'LOT_UNAVAILABLE');
    }

    const activeAllocatedKg = (await allocatedByLot(prisma as any, shopId, [lot.id])).get(lot.id)?.kg ?? 0;
    const availableKg = round3(Math.max(0, unconsumedKg - activeAllocatedKg));

    const qtyKg = round3(toKg(qty, unit));

    if (availableKg < qtyKg) {
      throw new ApiError(
        400,
        `Only ${availableKg} kg available in Lot #${lot.lotNumber} (requested ${qtyKg} kg)`,
        'INSUFFICIENT_RAW_STOCK'
      );
    }

    validated.push({
      rawMaterialLotId: lot.id,
      quantity: qty,
      unit,
      quantityKg: qtyKg,
      productName: lot.product?.name || 'Raw Material',
      lotNumber: lot.lotNumber || '—',
      farmerName: lot.farmerName,
      supplierName: lot.supplier?.name,
      availableKg,
    });
  }

  return validated;
}

/**
 * Fetch all input lots for a batch. Fallback to legacy batch.rawLotId if batchInputLots is empty.
 */
export async function getBatchInputLotsService(shopId: string, batchId: string) {
  const batch = await prisma.productionBatch.findFirst({
    where: { id: batchId, shopId },
    include: {
      rawLot: {
        include: {
          product: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
        },
      },
      inputLots: {
        include: {
          rawMaterialLot: {
            include: {
              product: { select: { id: true, name: true } },
              supplier: { select: { id: true, name: true } },
            },
          },
          rejectionLot: {
            include: {
              product: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { sequence: 'asc' },
      },
    },
  });

  if (!batch) {
    throw new ApiError(404, 'Production batch not found', 'BATCH_NOT_FOUND');
  }

  // If new multi-lot architecture exists, return it
  if (batch.inputLots && batch.inputLots.length > 0) {
    return {
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      isLegacy: false,
      totalInputKg: batch.inputKg || batch.inputLots.reduce((acc, item) => acc + item.quantity, 0),
      lots: batch.inputLots.map((item) => ({
        id: item.id,
        rawMaterialLotId: item.rawMaterialLotId,
        rejectionLotId: item.rejectionLotId,
        lotNumber: item.rawMaterialLot?.lotNumber || item.rejectionLot?.lotNumber || 'INPUT',
        productName: item.rawMaterialLot?.product?.name || item.rejectionLot?.product?.name || 'Input Material',
        supplierName: item.rawMaterialLot?.supplier?.name || null,
        farmerName: item.rawMaterialLot?.farmerName || null,
        quantity: item.quantity,
        unit: item.unit,
        sequence: item.sequence,
        notes: item.notes,
        createdAt: item.createdAt,
      })),
    };
  }

  // Fallback to legacy single rawLotId
  if (batch.rawLot) {
    return {
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      isLegacy: true,
      totalInputKg: batch.inputKg || Number(batch.rawLot.quantity || 0),
      lots: [
        {
          id: `legacy-${batch.rawLot.id}`,
          rawMaterialLotId: batch.rawLot.id,
          lotNumber: batch.rawLot.lotNumber,
          productName: batch.rawLot.product?.name || 'Raw Material',
          supplierName: batch.rawLot.supplier?.name || null,
          farmerName: batch.rawLot.farmerName || null,
          quantity: batch.inputKg || Number(batch.rawLot.quantity || 0),
          unit: 'kg',
          sequence: 1,
          notes: 'Legacy Batch Raw Lot',
          createdAt: batch.createdAt,
        },
      ],
    };
  }

  return {
    batchId: batch.id,
    batchNumber: batch.batchNumber,
    isLegacy: false,
    totalInputKg: batch.inputKg || 0,
    lots: [],
  };
}

/**
 * Add a new input lot to an active batch
 */
export async function addBatchInputLotService(
  shopId: string,
  userId: string,
  batchId: string,
  data: InputLotInput
) {
  const batch = await prisma.productionBatch.findFirst({
    where: { id: batchId, shopId },
    select: { id: true, status: true, inputKg: true },
  });

  if (!batch) {
    throw new ApiError(404, 'Production batch not found', 'BATCH_NOT_FOUND');
  }

  if (batch.status === 'closed') {
    throw new ApiError(400, 'Cannot add input lots to a closed production batch', 'BATCH_CLOSED');
  }

  const [validated] = await validateInputLots(shopId, [data]);

  const newLot = await prisma.batchInputLot.create({
    data: {
      shopId,
      batchId,
      rawMaterialLotId: validated.rawMaterialLotId,
      quantity: validated.quantity,
      unit: validated.unit,
      notes: data.notes || null,
    },
    include: {
      rawMaterialLot: {
        include: {
          product: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
        },
      },
    },
  });

  // Recalculate batch inputKg
  const allLots = await prisma.batchInputLot.findMany({ where: { batchId } });
  const newTotalInputKg = round3(allLots.reduce((acc, item) => acc + toKg(item.quantity, item.unit), 0));

  await prisma.productionBatch.update({
    where: { id: batchId },
    data: { inputKg: newTotalInputKg },
  });

  await recordStageAuditEvent({
    shopId,
    userId,
    action: 'BATCH_INPUT_LOT_ADDED',
    entityId: newLot.id,
    details: {
      entityType: 'BatchInputLot',
      batchId,
      lotNumber: validated.lotNumber,
      quantity: validated.quantity,
      unit: validated.unit,
      newTotalInputKg,
    },
  });

  return newLot;
}

/**
 * Remove an input lot from an active batch
 */
export async function deleteBatchInputLotService(
  shopId: string,
  userId: string,
  batchId: string,
  inputLotId: string
) {
  const batch = await prisma.productionBatch.findFirst({
    where: { id: batchId, shopId },
    select: { id: true, status: true },
  });

  if (!batch) {
    throw new ApiError(404, 'Production batch not found', 'BATCH_NOT_FOUND');
  }

  if (batch.status === 'closed') {
    throw new ApiError(400, 'Cannot modify input lots of a closed batch', 'BATCH_CLOSED');
  }

  const item = await prisma.batchInputLot.findFirst({
    where: { id: inputLotId, batchId, shopId },
  });

  if (!item) {
    throw new ApiError(404, 'Batch input lot record not found', 'INPUT_LOT_NOT_FOUND');
  }

  await prisma.batchInputLot.delete({
    where: { id: item.id },
  });

  // Recalculate batch inputKg
  const remainingLots = await prisma.batchInputLot.findMany({ where: { batchId } });
  const newTotalInputKg = round3(remainingLots.reduce((acc, l) => acc + toKg(l.quantity, l.unit), 0));

  await prisma.productionBatch.update({
    where: { id: batchId },
    data: { inputKg: newTotalInputKg },
  });

  await recordStageAuditEvent({
    shopId,
    userId,
    action: 'BATCH_INPUT_LOT_REMOVED',
    entityId: item.id,
    details: { entityType: 'BatchInputLot', batchId, rawMaterialLotId: item.rawMaterialLotId, newTotalInputKg },
  });

  return { success: true, newTotalInputKg };
}
