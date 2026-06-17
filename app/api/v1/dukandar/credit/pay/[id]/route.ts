import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const user = await requireUser(req);
  const credit = await prisma.dukandarCredit.findUnique({ where: { id } });
  if (!credit) throw new ApiError(404, 'Credit not found');
  if (credit.wholesalerId !== user.uuid) throw new ApiError(403, 'Unauthorized');

  await prisma.dukandarCredit.update({ where: { id }, data: { status: 'paid', paidAt: new Date() } });

  return json({ detail: 'Credit marked as paid' });
});
