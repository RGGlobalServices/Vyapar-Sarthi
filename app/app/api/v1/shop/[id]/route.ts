import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// DELETE /shop/:id — delete a non-primary shop
export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const user = await requireUser(req);
  const shop = await prisma.shop.findFirst({ where: { id, ownerId: user.uuid! } });
  if (!shop) throw new ApiError(404, 'Shop not found');

  // Prevent deleting the only/primary shop
  const total = await prisma.shop.count({ where: { ownerId: user.uuid! } });
  if (total <= 1) throw new ApiError(400, 'Cannot delete your only shop');

  await prisma.shop.delete({ where: { id } });
  return json({ detail: 'Shop deleted' });
});
