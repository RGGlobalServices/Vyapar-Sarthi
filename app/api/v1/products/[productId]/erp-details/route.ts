import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ productId: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  const { productId } = await params;
  const { shop } = await requireShop(req);

  if (!productId) throw new ApiError(400, 'Product ID required');

  const product = await prisma.product.findUnique({
    where: { id: productId, shopId: shop.id }
  });

  if (!product) throw new ApiError(404, 'Product not found');

  const isMill = shop.businessType === 'millprocessing';

  // Run queries sequentially in two phases to avoid exhausting PgBouncer's
  // connection pool (connection_limit=6). A Promise.all with 4-6 concurrent
  // queries against PgBouncer's transaction-mode pool causes queuing that
  // pushes the total time past the 12s AbortSignal timeout.

  // Phase 1: lightweight indexed lookups
  const batches = await prisma.batch.findMany({
    where: { productId, shopId: shop.id },
    orderBy: { createdAt: 'desc' }
  });

  const godownRaw = await prisma.godownProduct.findMany({
    where: { productId, godown: { shopId: shop.id }, quantity: { gt: 0 } },
    include: { godown: { select: { id: true, name: true } } }
  });
  const godownProducts = godownRaw.map(gp => ({
    quantity: gp.quantity,
    name: gp.godown.name,
    id: gp.godown.id
  }));

  // Phase 2: movements (may need a secondary warehouse-name lookup)
  const rawMovements = await prisma.stockMovement.findMany({
    where: { productId, shopId: shop.id },
    orderBy: { createdAt: 'desc' },
    take: 20
  });
  const warehouseIds = [...new Set(rawMovements.map(m => m.warehouseId).filter(Boolean))] as string[];
  let warehouseNames: Record<string, string> = {};
  if (warehouseIds.length > 0) {
    const gods = await prisma.godown.findMany({ where: { id: { in: warehouseIds }, shopId: shop.id } });
    warehouseNames = gods.reduce((acc: any, g: any) => ({ ...acc, [g.id]: g.name }), {});
  }
  const movements = rawMovements.map(m => ({
    id: m.id,
    type: m.type,
    quantity: m.quantity,
    created_at: m.createdAt,
    warehouse_name: m.warehouseId ? warehouseNames[m.warehouseId] || null : null
  }));

  // Phase 3 (mill only): production batches + FG lots
  let millData: { productionBatches: any[]; fgLots: any[] } | null = null;
  if (isMill) {
    const productionBatches = await prisma.productionBatch.findMany({
      where: { outputProductId: productId, shopId: shop.id },
      include: {
        rawLot: { include: { supplier: true } },
        inputLots: { include: { rawMaterialLot: { include: { supplier: true } } } },
        finishedGoodsLots: {
          where: { productId },
          include: { godown: { select: { id: true, name: true } } }
        },
        byProducts: { select: { id: true, name: true, quantityKg: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    const fgLots = await prisma.finishedGoodsLot.findMany({
      where: { productId, shopId: shop.id },
      include: {
        godown: { select: { id: true, name: true } },
        batch: {
          select: {
            id: true, batchNumber: true, inputKg: true, outputKg: true,
            startedAt: true, closedAt: true, status: true,
            rawLot: { include: { supplier: true } }
          }
        },
        challanItems: {
          include: {
            challan: {
              select: {
                id: true, challanNumber: true, customerName: true,
                customerId: true, createdAt: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    millData = { productionBatches, fgLots };
  }

  const totalStock = product.currentStock || 0;
  const stockValue = totalStock * (product.wholesaleCost || product.sellingPrice || 0);

  return json({
    product,
    totalStock,
    stockValue,
    batches,
    warehouses: godownProducts,
    movements,
    mill: millData
  });
});
