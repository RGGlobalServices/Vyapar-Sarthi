import prisma from '@/lib/server/prisma';
import { requireAdmin } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ userId: string }> };

export const POST = handle<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const userId = parseInt((await params).userId);
  const { action } = await readBody(req);
  if (!['barrier', 'activate'].includes(action)) {
    throw new ApiError(400, "Action must be 'barrier' or 'activate'");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, 'User not found');

  const shop = await prisma.shop.findFirst({ where: { ownerId: user.uuid! } });
  if (!shop) throw new ApiError(404, 'Shop not found for this user');

  await prisma.shop.update({
    where: { id: shop.id },
    data: { subscriptionStatus: action === 'barrier' ? 'barrier' : 'active' },
  });

  return json({ detail: `Subscription ${action === 'barrier' ? 'barrier set' : 'activated'} successfully` });
});
