import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  await prisma.userNotification.updateMany({
    where: { userId: user.uuid!, isRead: false },
    data: { isRead: true },
  });
  return json({ detail: 'All notifications marked as read' });
});
