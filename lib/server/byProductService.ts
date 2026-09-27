import prisma from '@/lib/server/prisma';
import { ApiError } from '@/lib/server/http';
import { round3 } from '@/lib/server/millProduction';
import { recordStageAuditEvent } from '@/lib/server/audit';

export type CreateByProductLotInput = {
  shopId: string;
  batchId: string;
  sourceBatchStageId?: string | null;
  sourceOutputId?: string | null;
  productId: string;
  quantity: number;
  unit?: string;
  godownId?: string | null;
  isStockable?: boolean;
  notes?: string | null;
};

/**
 * Generate generic, tenant-aware, unique By-Product lot number.
 * Format: BP-YYYYMMDD-###
 */
export async function generateByProductLotNumber(shopId: string, client: any = prisma): Promise<string> {
  const now = new Date();
  const dateStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');

  const prefix = `BP-${dateStr}-`;

  const existingCount = await client.byProductLot.count({
    where: {
      shopId,
      lotNumber: { startsWith: prefix },
    },
  });

  let seq = existingCount + 1;
  let candidate = `${prefix}${String(seq).padStart(3, '0')}`;

  let attempt = 0;
  while (attempt < 10) {
    const found = await client.byProductLot.findFirst({
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
 * Create a ByProductLot from a stage output (Idempotent by sourceOutputId)
 */
export async function createByProductLot(
  input: CreateByProductLotInput,
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
    isStockable = true,
    notes,
  } = input;

  if (quantity <= 0) {
    throw new ApiError(400, 'By-Product quantity must be greater than zero', 'INVALID_BY_PRODUCT_QUANTITY');
  }

  // 1. Idempotency Check: If linking to sourceOutputId and ByProductLot already exists, return it
  if (sourceOutputId) {
    const existing = await client.byProductLot.findFirst({
      where: { shopId, sourceOutputId },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        batch: { select: { id: true, batchNumber: true } },
        godown: { select: { id: true, name: true } },
      },
    });
    if (existing) {
      return existing;
    }
  }

  // 2. Validate Product & Shop
  const product = await client.product.findFirst({
    where: { id: productId, shopId },
    select: { id: true, name: true, sku: true, baseUnit: true },
  });
  if (!product) {
    throw new ApiError(404, 'Product not found for By-Product lot creation', 'PRODUCT_NOT_FOUND');
  }

  // 3. Determine target Godown
  let targetGodownId: string | null = godownId || null;
  if (!targetGodownId) {
    const defaultGodown = await client.godown.findFirst({
      where: { shopId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (defaultGodown) {
      targetGodownId = defaultGodown.id;
    }
  }

  // 4. Generate Lot Number
  const lotNumber = await generateByProductLotNumber(shopId, client);
  const qtyNum = round3(quantity);

  // 5. Create ByProductLot record
  const bpLot = await client.byProductLot.create({
    data: {
      shopId,
      batchId,
      sourceBatchStageId: sourceBatchStageId || null,
      sourceOutputId: sourceOutputId || null,
      productId,
      quantity: qtyNum,
      availableQuantity: qtyNum,
      unit: unit.trim().toLowerCase(),
      godownId: targetGodownId,
      status: 'AVAILABLE',
      isStockable,
      notes: notes || null,
      lotNumber,
    },
    include: {
      product: { select: { id: true, name: true, sku: true } },
      batch: { select: { id: true, batchNumber: true } },
      godown: { select: { id: true, name: true } },
    },
  });

  // 6. Credit Product & Godown Stock if marked stockable
  if (isStockable) {
    await client.product.update({
      where: { id: productId },
      data: { currentStock: { increment: qtyNum } },
    });

    if (targetGodownId) {
      await client.godownProduct.upsert({
        where: {
          godownId_productId: { godownId: targetGodownId, productId },
        },
        update: {
          quantity: { increment: qtyNum },
        },
        create: {
          godownId: targetGodownId,
          productId,
          quantity: qtyNum,
        },
      });
    }

    await recordStageAuditEvent({
      shopId,
      action: 'BY_PRODUCT_STOCK_CREDITED',
      entityId: bpLot.id,
      details: { lotNumber, quantity: qtyNum, unit, productId, godownId: targetGodownId },
    });
  }

  // 7. Audit log event
  await recordStageAuditEvent({
    shopId,
    action: 'BY_PRODUCT_LOT_CREATED',
    entityId: bpLot.id,
    details: { lotNumber, quantity: qtyNum, unit, productId, batchId, godownId: targetGodownId, isStockable },
  });

  return bpLot;
}

/**
 * Get Paginated By-Products inventory list for shop
 */
export async function getByProductLotsService(
  shopId: string,
  filters: {
    productId?: string;
    godownId?: string;
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

  if (filters.godownId) {
    where.godownId = filters.godownId;
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
    prisma.byProductLot.findMany({
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
    prisma.byProductLot.count({ where }),
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
 * Get single By-Product lot details
 */
export async function getByProductLotByIdService(shopId: string, id: string) {
  const bpLot = await prisma.byProductLot.findFirst({
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
          wipLots: {
            include: {
              product: { select: { name: true } },
              sourceBatchStage: { select: { stageName: true } },
            },
          },
        },
      },
      sourceBatchStage: { select: { id: true, stageName: true, operatorName: true, completedAt: true } },
      godown: { select: { id: true, name: true } },
    },
  });

  if (!bpLot) {
    throw new ApiError(404, 'By-Product Lot not found', 'NOT_FOUND');
  }

  return bpLot;
}

/**
 * Get forward and reverse material traceability for a By-Product Lot
 */
export async function getByProductTraceabilityService(shopId: string, id: string) {
  const bpLot = await getByProductLotByIdService(shopId, id);

  const rawMaterialLots = bpLot.batch.inputLots
    .filter((il) => !!il.rawMaterialLot)
    .map((il) => ({
      id: il.rawMaterialLot!.id,
      lotNumber: il.rawMaterialLot!.lotNumber,
      productName: il.rawMaterialLot!.product?.name || 'Raw Grain',
      farmerName: il.rawMaterialLot!.farmerName,
      quantityConsumed: il.quantity,
      unit: il.unit,
    }));

  const wipLots = bpLot.batch.wipLots.map((wip) => ({
    id: wip.id,
    lotNumber: wip.lotNumber,
    productName: wip.product?.name || 'WIP Material',
    sourceStageName: wip.sourceBatchStage?.stageName || 'Stage Output',
    quantity: wip.quantity,
    unit: wip.unit,
    status: wip.status,
  }));

  return {
    byProductLot: {
      id: bpLot.id,
      lotNumber: bpLot.lotNumber,
      productName: bpLot.product.name,
      originalQuantity: bpLot.quantity,
      availableQuantity: bpLot.availableQuantity,
      unit: bpLot.unit,
      godownName: bpLot.godown?.name || 'Default Stock',
      status: bpLot.status,
      isStockable: bpLot.isStockable,
      createdAt: bpLot.createdAt,
    },
    origin: {
      batchId: bpLot.batch.id,
      batchNumber: bpLot.batch.batchNumber,
      sourceStageName: bpLot.sourceBatchStage?.stageName || 'Stage Output',
      rawMaterialLots,
      wipLots,
    },
  };
}
