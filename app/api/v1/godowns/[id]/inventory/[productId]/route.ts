import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; productId: string }> };

// DELETE /godowns/:id/inventory/:productId
export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id, productId } = await params;
  const { shop } = await requireShop(req);
  if (shop.subscriptionPlan !== 'wholesale') {
    throw new ApiError(403, 'This feature is only available on the Udyog plan.');
  }
  await prisma.$executeRaw`DELETE FROM godown_products WHERE godown_id = ${id}::uuid AND product_id = ${productId}::uuid`;
  return json({ detail: 'Product removed from godown' });
});
