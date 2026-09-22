import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { assertOwned } from '@/lib/server/ownership';
import { handle, json, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; productId: string }> };

// DELETE /godowns/:id/inventory/:productId
export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id, productId } = await params;
  const { shop } = await requireShop(req);

  // Previously `shop` was fetched but never used, so any authenticated user
  // could delete inventory rows from another shop's godown by id.
  await assertOwned(shop.id, { godownId: id, productId });

  await prisma.$executeRaw`DELETE FROM godown_products WHERE godown_id = ${id}::uuid AND product_id = ${productId}::uuid AND godown_id IN (SELECT id FROM godowns WHERE shop_id = ${shop.id}::uuid)`;
  return json({ detail: 'Product removed from godown' });
});
