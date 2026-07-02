import prisma from '@/lib/server/prisma';
import { requireUser, requireShop } from '@/lib/server/auth';
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

  // We want this reminder to show up in the calendar and notification bell on/before the date.
  const { shop } = await requireShop(req);

  await prisma.calendarEvent.create({
    data: {
      shopId: shop.id,
      ownerId: user.uuid,
      title: `Udhar Payment - ${customerName}`,
      description: message || `Reminder: ₹${dueAmount?.toLocaleString('en-IN')} is due from ${customerName}`,
      eventDate: scheduledAt,
      eventType: 'udhar_reminder',
      amount: dueAmount ? parseFloat(dueAmount.toString()) : null,
      customerName: customerName,
      status: 'pending',
      reminderDays: 1, // Will notify 1 day before and on the day
    },
  });

  return json({ detail: 'Reminder scheduled', scheduledAt, channel, customerName, mobile, dueAmount });
});
