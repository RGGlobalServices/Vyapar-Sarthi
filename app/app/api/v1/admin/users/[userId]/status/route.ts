import prisma from '@/lib/server/prisma';
import { requireAdmin } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ userId: string }> };

export const PATCH = handle<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const userId = parseInt((await params).userId);
  const { isActive } = await readBody(req);
  if (typeof isActive !== 'boolean') throw new ApiError(400, 'isActive boolean required');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, 'User not found');

  await prisma.user.update({ where: { id: userId }, data: { isActive: isActive ? 1 : 0 } });
  return json({ detail: `User ${isActive ? 'activated' : 'blocked'} successfully` });
});
