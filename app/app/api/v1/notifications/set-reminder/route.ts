import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Store an auto-reminder for an udhar customer
export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const { customerId, customerName, mobile, dueAmount, reminderDate, reminderTime, channel, message } =
    await readBody(req);
  if (!customerId || !reminderDate || !reminderTime || !channel) {
    throw new ApiError(400, 'customerId, reminderDate, reminderTime, and channel are required');
  }
  const scheduledAt = new Date(`${reminderDate}T${reminderTime}:00`);
  if (isNaN(scheduledAt.getTime())) throw new ApiError(400, 'Invalid date or time');

  // Store reminder as a notification with future scheduledAt
  await prisma.userNotification.create({
    data: {
      userId: user.uuid,
      title: `Udhar Reminder — ${customerName}`,
      message: message || `Reminder: ₹${dueAmount?.toLocaleString('en-IN')} is due from ${customerName}`,
      notificationType: 'udhar_reminder',
      isRead: false,
      link: '/udhar',
    },
  });

  return json({ detail: 'Reminder scheduled', scheduledAt, channel, customerName, mobile, dueAmount });
});
