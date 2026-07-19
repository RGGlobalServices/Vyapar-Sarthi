import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);

  const movements = (await prisma.$queryRaw`
    SELECT m.id, m.type, m.quantity, m.created_at, 
           p.name as product_name, p.base_unit, p.category, p.brand,
           g.name as warehouse_name
    FROM stock_movements m
    JOIN products p ON p.id = m.product_id
    LEFT JOIN godowns g ON g.id = m.warehouse_id
    WHERE m.shop_id = ${shop.id}::uuid AND m.warehouse_id = ${id}::uuid
    ORDER BY m.created_at DESC
    LIMIT 50
  `) as any[];

  return json(movements);
});
