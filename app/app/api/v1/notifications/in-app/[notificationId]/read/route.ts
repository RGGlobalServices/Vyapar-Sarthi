import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ notificationId: string }> };

export const POST = handle<Ctx>(async (req, { params }) => {
  const { notificationId } = await params;
  const user = await requireUser(req);
  const notification = await prisma.userNotification.findFirst({
    where: { id: notificationId, userId: user.uuid! },
  });
  if (!notification) throw new ApiError(404, 'Notification not found');
  await prisma.userNotification.update({ where: { id: notificationId }, data: { isRead: true } });
  return json({ detail: 'Marked as read' });
});
