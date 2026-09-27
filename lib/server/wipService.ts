import prisma from '@/lib/server/prisma';
import { ApiError } from '@/lib/server/http';
import { round3, toKg } from '@/lib/server/millProduction';
import { recordStageAuditEvent } from '@/lib/server/audit';

export type CreateWipLotInput = {
  shopId: string;
  batchId: string;
  sourceBatchStageId?: string | null;
  sourceOutputId?: string | null;
  productId: string;
  quantity: number;
  unit?: string;
  godownId?: string | null;
  notes?: string | null;
};

export type ValidatedWipInput = {
  wipLotId: string;
  lotNumber: string;
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  quantityKg: number;
  availableKg: number;
  sourceBatchId: string;
  sourceBatchNumber: string;
};

/**
 * Generate generic, unique, tenant-aware WIP lot number.
 * Format: WIP-YYYYMMDD-###
 */
export async function generateWipLotNumber(shopId: string, client: any = prisma): Promise<string> {
  const now = new Date();
  const dateStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');

  const prefix = `WIP-${dateStr}-`;

  // Count existing WIP lots for today
  const existingCount = await client.wipLot.count({
    where: {
      shopId,
      lotNumber: { startsWith: prefix },
    },
  });

  let seq = existingCount + 1;
  let candidate = `${prefix}${String(seq).padStart(3, '0')}`;

  // Ensure uniqueness in case of concurrent creations or deleted records
  let attempt = 0;
  while (attempt < 10) {
    const found = await client.wipLot.findFirst({
      where: { shopId, lotNumber: candidate },
      select: { id: true },
    });
    if (!found) break;
    seq++;
    candidate = `${prefix}${String(seq).padStart(3, '0')}`;
    attempt++;
  }

  return candidate;
}

/**
 * Create a WIP Lot automatically from a stage output (Idempotent by sourceOutputId)
 */
export async function createWipLotFromStageOutput(
  input: CreateWipLotInput,
  client: any = prisma
) {
  const {
    shopId,
    batchId,
    sourceBatchStageId,
    sourceOutputId,
    productId,
    quantity,
    unit = 'kg',
    godownId,
    notes,
  } = input;

  if (quantity <= 0) {
    throw new ApiError(400, 'WIP quantity must be greater than zero', 'INVALID_WIP_QUANTITY');
  }

  // 1. Idempotency Check: If linking to sourceOutputId and WIP Lot already exists, return it
  if (sourceOutputId) {
    const existing = await client.wipLot.findFirst({
      where: { shopId, sourceOutputId },
    });
    if (existing) {
      return existing;
    }
  }

  // 2. Validate Product & Shop
  const product = await client.product.findFirst({
    where: { id: productId, shopId },
    select: { id: true, name: true },
  });
  if (!product) {
    throw new ApiError(404, 'Product not found for WIP lot creation', 'PRODUCT_NOT_FOUND');
  }

  // 3. Generate Lot Number
  const lotNumber = await generateWipLotNumber(shopId, client);
  const qtyNum = round3(quantity);

  // 4. Create WipLot
  const wipLot = await client.wipLot.create({
    data: {
      shopId,
      batchId,
      sourceBatchStageId: sourceBatchStageId || null,
      sourceOutputId: sourceOutputId || null,
      productId,
      quantity: qtyNum,
      availableQuantity: qtyNum,
      unit: unit.trim().toLowerCase(),
      godownId: godownId || null,
      status: 'AVAILABLE',
      notes: notes || null,
      lotNumber,
    },
    include: {
      product: { select: { id: true, name: true, sku: true } },
      batch: { select: { id: true, batchNumber: true } },
      godown: { select: { id: true, name: true } },
    },
  });

  // Audit event
  await recordStageAuditEvent({
    shopId,
    action: 'WIP_LOT_CREATED',
    entityId: wipLot.id,
    details: { lotNumber, quantity: qtyNum, unit, productId, sourceBatchStageId },
  });

  return wipLot;
}

/**
 * Validate WIP inputs before stage consumption
 */
export async function validateWipInputs(
  shopId: string,
  wipInputs: Array<{ wipLotId: string; quantity: number; unit?: string }>,
  targetProductId?: string | null,
  client: any = prisma
): Promise<ValidatedWipInput[]> {
  if (!Array.isArray(wipInputs) || wipInputs.length === 0) {
    return [];
  }

  const seenWipIds = new Set<string>();
  const validated: ValidatedWipInput[] = [];

  for (const item of wipInputs) {
    if (!item.wipLotId) {
      throw new ApiError(400, 'Invalid WIP Lot ID', 'INVALID_WIP_LOT_ID');
    }

    if (seenWipIds.has(item.wipLotId)) {
      throw new ApiError(400, 'Duplicate WIP lot selected in stage inputs', 'DUPLICATE_WIP_INPUT');
    }
    seenWipIds.add(item.wipLotId);

    const qty = Number(item.quantity);
    if (isNaN(qty) || qty <= 0) {
      throw new ApiError(400, 'WIP consumption quantity must be greater than zero', 'INVALID_QUANTITY');
    }

    const unit = (item.unit || 'kg').trim().toLowerCase();
    const qtyKg = round3(toKg(qty, unit));

    // Fetch WIP lot with tenant isolation
    const wipLot = await client.wipLot.findFirst({
      where: { id: item.wipLotId, shopId },
      include: {
        product: { select: { id: true, name: true } },
        batch: { select: { id: true, batchNumber: true } },
      },
    });

    if (!wipLot) {
      throw new ApiError(404, 'WIP Lot not found for this shop', 'WIP_LOT_NOT_FOUND');
    }

    if (wipLot.status === 'BLOCKED' || wipLot.status === 'FULLY_CONSUMED') {
      throw new ApiError(
        400,
        `WIP Lot #${wipLot.lotNumber} is ${wipLot.status.toLowerCase().replace('_', ' ')} and cannot be consumed.`,
        'WIP_LOT_UNAVAILABLE'
      );
    }

    // Product compatibility check (if target product specified)
    if (targetProductId && wipLot.productId !== targetProductId) {
      throw new ApiError(
        400,
        `WIP Lot #${wipLot.lotNumber} (${wipLot.product.name}) does not match required stage input product`,
        'PRODUCT_LOT_MISMATCH'
      );
    }

    // Check available stock
    const availKg = round3(toKg(wipLot.availableQuantity, wipLot.unit));
    if (availKg < qtyKg) {
      throw new ApiError(
        400,
        `Insufficient available quantity in WIP Lot #${wipLot.lotNumber}. Available: ${wipLot.availableQuantity} ${wipLot.unit}, requested: ${qty} ${unit}`,
        'INSUFFICIENT_WIP_STOCK'
      );
    }

    validated.push({
      wipLotId: wipLot.id,
      lotNumber: wipLot.lotNumber,
      productId: wipLot.productId,
      productName: wipLot.product.name,
      quantity: qty,
      unit,
      quantityKg: qtyKg,
      availableKg: availKg,
      sourceBatchId: wipLot.batchId,
      sourceBatchNumber: wipLot.batch.batchNumber,
    });
  }

  return validated;
}

/**
 * Deduct WIP stock and update status transactionally
 */
export async function consumeWipLots(
  shopId: string,
  stageSnapshotId: string,
  wipInputs: Array<{ wipLotId: string; quantity: number; unit?: string; notes?: string }>,
  client: any = prisma
) {
  if (!wipInputs || wipInputs.length === 0) return [];

  const results = [];

  for (const input of wipInputs) {
    const qtyKg = round3(toKg(input.quantity, input.unit || 'kg'));

    // Lock and fetch current WIP lot
    const wipLot = await client.wipLot.findFirst({
      where: { id: input.wipLotId, shopId },
      include: { product: true },
    });

    if (!wipLot) {
      throw new ApiError(404, `WIP Lot not found (${input.wipLotId})`, 'WIP_LOT_NOT_FOUND');
    }

    const currentAvail = round3(Number(wipLot.availableQuantity));
    if (currentAvail < input.quantity) {
      throw new ApiError(
        400,
        `Concurrent over-consumption prevented: WIP Lot #${wipLot.lotNumber} only has ${currentAvail} ${wipLot.unit} remaining.`,
        'CONCURRENT_STOCK_EXHAUSTED'
      );
    }

    const newAvailable = round3(currentAvail - input.quantity);
    const newStatus =
      newAvailable <= 0 ? 'FULLY_CONSUMED' : 'PARTIALLY_CONSUMED';

    // Update WIP lot available quantity and status
    const updated = await client.wipLot.update({
      where: { id: wipLot.id },
      data: {
        availableQuantity: newAvailable,
        status: newStatus,
      },
    });

    // Audit event
    await recordStageAuditEvent({
      shopId,
      action: 'WIP_LOT_CONSUMED',
      entityId: wipLot.id,
      details: { consumedQuantity: input.quantity, remainingQuantity: newAvailable, newStatus, lotNumber: wipLot.lotNumber },
    });

    results.push(updated);
  }

  return results;
}

/**
 * Get Paginated WIP inventory list for shop
 */
export async function getWipLotsService(
  shopId: string,
  filters: {
    productId?: string;
    status?: string;
    search?: string;
    batchId?: string;
    page?: number;
    limit?: number;
  }
) {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, Math.max(1, filters.limit || 20));
  const skip = (page - 1) * limit;

  const where: any = { shopId };

  if (filters.productId) {
    where.productId = filters.productId;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.batchId) {
    where.batchId = filters.batchId;
  }

  if (filters.search) {
    const term = filters.search.trim();
    where.OR = [
      { lotNumber: { contains: term, mode: 'insensitive' } },
      { product: { name: { contains: term, mode: 'insensitive' } } },
      { batch: { batchNumber: { contains: term, mode: 'insensitive' } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.wipLot.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true, baseUnit: true } },
        batch: { select: { id: true, batchNumber: true, currentStage: true } },
        sourceBatchStage: { select: { id: true, stageName: true } },
        godown: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.wipLot.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get single WIP lot details with consumption history
 */
export async function getWipLotByIdService(shopId: string, id: string) {
  const wipLot = await prisma.wipLot.findFirst({
    where: { id, shopId },
    include: {
      product: { select: { id: true, name: true, sku: true, baseUnit: true } },
      batch: {
        select: {
          id: true,
          batchNumber: true,
          status: true,
          inputLots: {
            include: {
              rawMaterialLot: {
                select: { id: true, lotNumber: true, farmerName: true, product: { select: { name: true } } },
              },
            },
          },
        },
      },
      sourceBatchStage: { select: { id: true, stageName: true, operatorName: true, completedAt: true } },
      godown: { select: { id: true, name: true } },
      stageInputs: {
        include: {
          stageSnapshot: {
            include: {
              snapshot: {
                include: {
                  batch: { select: { id: true, batchNumber: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!wipLot) {
    throw new ApiError(404, 'WIP Lot not found', 'NOT_FOUND');
  }

  return wipLot;
}

/**
 * Get forward and reverse material traceability for a WIP Lot
 */
export async function getWipTraceabilityService(shopId: string, id: string) {
  const wipLot = await getWipLotByIdService(shopId, id);

  // Origin raw material lots that contributed to this batch
  const rawMaterialLots = wipLot.batch.inputLots
    .filter((il) => !!il.rawMaterialLot)
    .map((il) => ({
      id: il.rawMaterialLot!.id,
      lotNumber: il.rawMaterialLot!.lotNumber,
      productName: il.rawMaterialLot!.product?.name || 'Raw Grain',
      farmerName: il.rawMaterialLot!.farmerName,
      quantityConsumed: il.quantity,
      unit: il.unit,
    }));

  // Stages that consumed this WIP Lot
  const consumptionHistory = wipLot.stageInputs.map((si) => ({
    inputRecordId: si.id,
    consumedBatchId: si.stageSnapshot?.snapshot?.batch?.id || null,
    consumedBatchNumber: si.stageSnapshot?.snapshot?.batch?.batchNumber || null,
    consumedStageName: si.stageSnapshot?.stageName || 'Stage Execution',
    actualQuantity: Number(si.actualQuantity ?? 0),
    actualUnit: si.actualUnit || si.unit,
    consumedAt: si.createdAt,
  }));

  return {
    wipLot: {
      id: wipLot.id,
      lotNumber: wipLot.lotNumber,
      productName: wipLot.product.name,
      originalQuantity: wipLot.quantity,
      availableQuantity: wipLot.availableQuantity,
      consumedQuantity: round3(wipLot.quantity - wipLot.availableQuantity),
      unit: wipLot.unit,
      status: wipLot.status,
      createdAt: wipLot.createdAt,
    },
    origin: {
      batchId: wipLot.batch.id,
      batchNumber: wipLot.batch.batchNumber,
      sourceStageName: wipLot.sourceBatchStage?.stageName || 'Initial Output',
      rawMaterialLots,
    },
    consumptionHistory,
  };
}
