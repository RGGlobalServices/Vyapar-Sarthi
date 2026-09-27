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

  const [batches, godownProducts, movements, millData] = await Promise.all([
    // Batches
    prisma.batch.findMany({
      where: { productId, shopId: shop.id },
      orderBy: { createdAt: 'desc' }
    }),

    // Warehouses
    prisma.godownProduct.findMany({
      where: { productId, godown: { shopId: shop.id }, quantity: { gt: 0 } },
      include: { godown: { select: { id: true, name: true } } }
    }).then(res => res.map(gp => ({
      quantity: gp.quantity,
      name: gp.godown.name,
      id: gp.godown.id
    }))),

    // Movements
    prisma.stockMovement.findMany({
      where: { productId, shopId: shop.id },
      orderBy: { createdAt: 'desc' },
      take: 20
    }).then(async (movements) => {
      const warehouseIds = [...new Set(movements.map(m => m.warehouseId).filter(Boolean))] as string[];
      let warehouses: Record<string, string> = {};
      if (warehouseIds.length > 0) {
        const gods = await prisma.godown.findMany({
          where: { id: { in: warehouseIds }, shopId: shop.id }
        });
        warehouses = gods.reduce((acc: any, g: any) => ({ ...acc, [g.id]: g.name }), {});
      }
      return movements.map(m => ({
        id: m.id,
        type: m.type,
        quantity: m.quantity,
        created_at: m.createdAt,
        warehouse_name: m.warehouseId ? warehouses[m.warehouseId] || null : null
      }));
    }),

    // Mill-specific: production batches + FG lots
    isMill ? Promise.all([
      // Production batches where this product is the output
      prisma.productionBatch.findMany({
        where: { outputProductId: productId, shopId: shop.id },
        include: {
          rawLot: { include: { supplier: true } },
          inputLots: {
            include: {
              rawMaterialLot: {
                include: { supplier: true }
              }
            }
          },
          finishedGoodsLots: {
            where: { productId },
            include: { godown: { select: { id: true, name: true } } }
          },
          byProducts: { select: { id: true, name: true, quantityKg: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 20
      }),
      // FG lots for this product
      prisma.finishedGoodsLot.findMany({
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
      })
    ]).then(([productionBatches, fgLots]) => ({ productionBatches, fgLots }))
    : Promise.resolve(null)
  ]);

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
