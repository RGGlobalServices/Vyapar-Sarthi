import prisma from '@/lib/server/prisma';
import { requireAdmin } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const admin = await requireAdmin(req);
  const { title, message, type, target, targetPlan } = await readBody(req);
  if (!title || !message) throw new ApiError(400, 'Title and message required');

  const adminNotification = await prisma.adminNotification.create({
    data: {
      adminId: admin.id,
      title,
      message,
      notificationType: type || 'broadcast',
      targetAudience: target || 'all',
      targetPlan: targetPlan || null,
    },
  });

  let users: Array<{ uuid: string | null }> = [];
  if (targetPlan) {
    const shops = await prisma.shop.findMany({
      where: { subscriptionPlan: targetPlan },
      select: { ownerId: true },
    });
    const userIds = [...new Set(shops.map((s) => s.ownerId).filter(Boolean) as string[])];
    if (userIds.length > 0) {
      users = await prisma.user.findMany({ where: { uuid: { in: userIds } } });
    }
  } else if (target && target !== 'all') {
    throw new ApiError(400, 'Invalid target');
  } else {
    users = await prisma.user.findMany();
  }

  const recipients = users.filter((u) => u.uuid) as Array<{ uuid: string }>;
  if (recipients.length > 0) {
    await prisma.userNotification.createMany({
      data: recipients.map((u) => ({
        userId: u.uuid,
        adminNotificationId: adminNotification.id,
        title,
        message,
        notificationType: type || 'broadcast',
      })),
    });
  }

  return json({
    detail: `Notification sent to ${recipients.length} users`,
    recipientCount: recipients.length,
  });
});
