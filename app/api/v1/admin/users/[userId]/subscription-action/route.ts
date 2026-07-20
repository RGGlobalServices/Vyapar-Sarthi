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

  const shops = await prisma.shop.findMany({ where: { ownerId: user.uuid! } });
  if (shops.length === 0) throw new ApiError(404, 'No shops found for this user');

  const updateData: any = {
    subscriptionStatus: action === 'barrier' ? 'barrier' : 'active',
  };

  if (action === 'activate') {
    let maxExpiry = Date.now();
    for (const s of shops) {
      if (s.subscriptionExpiry && s.subscriptionExpiry.getTime() > maxExpiry) {
        maxExpiry = s.subscriptionExpiry.getTime();
      }
    }
    // Extend by 30 days
    updateData.subscriptionExpiry = new Date(Math.max(Date.now(), maxExpiry) + 30 * 86400000);
  }

  await prisma.shop.updateMany({
    where: { ownerId: user.uuid! },
    data: updateData,
  });

  return json({ detail: `Subscription ${action === 'barrier' ? 'barrier set' : 'activated'} successfully` });
});
