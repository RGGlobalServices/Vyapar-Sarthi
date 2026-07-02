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

  const [batches, godownProducts, movements] = await Promise.all([
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
          where: { id: { in: warehouseIds } } 
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
    })
  ]);

  const totalStock = product.currentStock || 0;
  const stockValue = totalStock * (product.wholesaleCost || product.sellingPrice || 0);

  return json({
    product,
    totalStock,
    stockValue,
    batches,
    warehouses: godownProducts,
    movements
  });
});
