import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const limit = parseInt(query(req).limit) || 5;
  const lowStock = await prisma.$queryRaw<any[]>`
    SELECT id, name, category, current_stock, min_stock
    FROM products 
    WHERE shop_id = ${shop.id}::uuid 
      AND current_stock <= min_stock
      AND min_stock > 0
    ORDER BY (current_stock / min_stock) ASC
    LIMIT ${Number(limit)}
  `;
  return json(
    lowStock.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      current_stock: p.current_stock,
      min_stock: p.min_stock,
    })),
  );
});
