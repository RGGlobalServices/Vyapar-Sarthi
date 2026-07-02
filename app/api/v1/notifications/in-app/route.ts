import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const user = await requireUser(req);

  // Strictly fetch only notifications addressed to THIS user.
  // Dukandar stock alerts and quotation notifications are created
  // with userId = the specific recipient (retailer or wholesaler),
  // so this filter ensures no other user can see them.
  const notifications = await prisma.userNotification.findMany({
    where: {
      userId: user.uuid!,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  return json({ notifications, unreadCount });
});

