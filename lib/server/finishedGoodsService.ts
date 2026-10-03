import prisma from '@/lib/server/prisma';
import { packSummaryForLots } from '@/lib/server/packing';
import { ApiError } from '@/lib/server/http';
import { round3, toKg } from '@/lib/server/millProduction';
import { recordStageAuditEvent } from '@/lib/server/audit';

export type CreateFinishedGoodsLotInput = {
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

/**
 * Generate generic, tenant-aware, unique Finished Goods lot number.
 * Format: FG-YYYYMMDD-###
 */
export async function generateFinishedGoodsLotNumber(shopId: string, client: any = prisma): Promise<string> {
  const now = new Date();
  const dateStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');

  const prefix = `FG-${dateStr}-`;

  const existingCount = await client.finishedGoodsLot.count({
    where: {
      shopId,
      lotNumber: { startsWith: prefix },
    },
  });

  let seq = existingCount + 1;
  let candidate = `${prefix}${String(seq).padStart(3, '0')}`;

  let attempt = 0;
  while (attempt < 10) {
    const found = await client.finishedGoodsLot.findFirst({
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
 * Create a Finished Goods Lot from a stage output and credit godown & product stock (Idempotent)
 */
export async function createFinishedGoodsLot(
  input: CreateFinishedGoodsLotInput,
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
    throw new ApiError(400, 'Finished Goods quantity must be greater than zero', 'INVALID_FG_QUANTITY');
  }

  // 1. Idempotency Check: If linking to sourceOutputId and FG Lot already exists, return it
  if (sourceOutputId) {
    const existing = await client.finishedGoodsLot.findFirst({
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
    throw new ApiError(404, 'Product not found for Finished Goods lot creation', 'PRODUCT_NOT_FOUND');
  }

  // 3. Determine target Godown (Explicit godownId, or shop's first default godown)
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

  // 4. Generate FG Lot Number
  const lotNumber = await generateFinishedGoodsLotNumber(shopId, client);
  const qtyNum = round3(quantity);

  // 5. Create FinishedGoodsLot record
  const fgLot = await client.finishedGoodsLot.create({
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
      notes: notes || null,
      lotNumber,
    },
    include: {
      product: { select: { id: true, name: true, sku: true } },
      batch: { select: { id: true, batchNumber: true } },
      godown: { select: { id: true, name: true } },
    },
  });

  // 6. Credit Product Stock
  await client.product.update({
    where: { id: productId },
    data: { currentStock: { increment: qtyNum } },
  });

  // 7. Credit Godown Product Stock (if godown assigned)
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

  // 8. Record audit log events
  await recordStageAuditEvent({
    shopId,
    action: 'FINISHED_GOOD_LOT_CREATED',
    entityId: fgLot.id,
    details: { lotNumber, quantity: qtyNum, unit, productId, batchId, godownId: targetGodownId },
  });

  await recordStageAuditEvent({
    shopId,
    action: 'FINISHED_GOOD_STOCK_CREDITED',
    entityId: fgLot.id,
    details: { lotNumber, quantity: qtyNum, unit, productId, godownId: targetGodownId },
  });

  return fgLot;
}

/**
 * Get Paginated Finished Goods inventory list for shop
 */
export async function getFinishedGoodsLotsService(
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
    prisma.finishedGoodsLot.findMany({
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
    prisma.finishedGoodsLot.count({ where }),
  ]);

  // how each lot was packed (empty until packing is recorded in Milling -> Not packed)
  let packMap = new Map<string, Array<{ packKg: number; packs: number; packType: string }>>();
  try { packMap = await packSummaryForLots(prisma, shopId, items.map((i: any) => ({ batchId: i.batchId, productId: i.productId }))); } catch { /* packing is optional */ }

  return {
    items: items.map((i: any) => ({ ...i, packs: packMap.get(`${i.batchId}:${i.productId}`) ?? [] })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get single Finished Goods lot details
 */
export async function getFinishedGoodsLotByIdService(shopId: string, id: string) {
  const fgLot = await prisma.finishedGoodsLot.findFirst({
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

  if (!fgLot) {
    throw new ApiError(404, 'Finished Goods Lot not found', 'NOT_FOUND');
  }

  return fgLot;
}

/**
 * Get forward and reverse material traceability for a Finished Goods Lot
 */
export async function getFinishedGoodsTraceabilityService(shopId: string, id: string) {
  const fgLot = await getFinishedGoodsLotByIdService(shopId, id);

  // Origin raw material lots
  const rawMaterialLots = fgLot.batch.inputLots
    .filter((il) => !!il.rawMaterialLot)
    .map((il) => ({
      id: il.rawMaterialLot!.id,
      lotNumber: il.rawMaterialLot!.lotNumber,
      productName: il.rawMaterialLot!.product?.name || 'Raw Grain',
      farmerName: il.rawMaterialLot!.farmerName,
      quantityConsumed: il.quantity,
      unit: il.unit,
    }));

  // Intermediate WIP Lots produced during batch run
  const wipLots = fgLot.batch.wipLots.map((wip) => ({
    id: wip.id,
    lotNumber: wip.lotNumber,
    productName: wip.product?.name || 'WIP Material',
    sourceStageName: wip.sourceBatchStage?.stageName || 'Stage Output',
    quantity: wip.quantity,
    unit: wip.unit,
    status: wip.status,
  }));

  return {
    finishedGoodsLot: {
      id: fgLot.id,
      lotNumber: fgLot.lotNumber,
      productName: fgLot.product.name,
      originalQuantity: fgLot.quantity,
      availableQuantity: fgLot.availableQuantity,
      unit: fgLot.unit,
      godownName: fgLot.godown?.name || 'Default Stock',
      status: fgLot.status,
      createdAt: fgLot.createdAt,
    },
    origin: {
      batchId: fgLot.batch.id,
      batchNumber: fgLot.batch.batchNumber,
      sourceStageName: fgLot.sourceBatchStage?.stageName || 'Final Stage',
      rawMaterialLots,
      wipLots,
    },
  };
}
