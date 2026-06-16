import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, query, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /calendar
//   ?month=YYYY-MM   → all events in that month
//   ?upcoming=N      → pending events from now through the next N days
//   (no params)      → all events, soonest first
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);

  const where: Record<string, unknown> = { shopId: shop.id };

  if (q.month && /^\d{4}-\d{2}$/.test(q.month)) {
    const [y, m] = q.month.split('-').map(Number);
    const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const end = new Date(y, m, 0, 23, 59, 59, 999);
    where.eventDate = { gte: start, lte: end };
  } else if (q.upcoming) {
    const days = parseInt(q.upcoming) || 7;
    // From the start of today (events are stored at midnight) through N days out.
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setDate(end.getDate() + days);
    end.setHours(23, 59, 59, 999);
    where.eventDate = { gte: start, lte: end };
    where.status = 'pending';
    // The notification bell passes hideNotified=1 so dismissed events disappear
    // from the bell (but still show on the calendar and dashboard).
    if (q.hideNotified) where.notified = false;
  }

  const events = await prisma.calendarEvent.findMany({
    where,
    orderBy: { eventDate: q.upcoming ? 'asc' : 'asc' },
  });
  return json(events);
});

// POST /calendar — create an event
export const POST = handle(async (req) => {
  const { user, shop } = await requireShop(req);
  const b = await readBody(req);
  if (!b.title?.trim()) throw new ApiError(400, 'Title is required');
  if (!b.eventDate) throw new ApiError(400, 'eventDate is required');

  const eventDate = new Date(b.eventDate);
  if (isNaN(eventDate.getTime())) throw new ApiError(400, 'Invalid eventDate');

  const event = await prisma.calendarEvent.create({
    data: {
      shopId: shop.id,
      ownerId: user.uuid,
      title: b.title.trim(),
      description: b.description?.trim() || null,
      eventDate,
      eventType: b.eventType || 'event',
      amount: b.amount != null && b.amount !== '' ? parseFloat(b.amount) : null,
      customerName: b.customerName?.trim() || null,
      status: b.status || 'pending',
      reminderDays: b.reminderDays != null ? parseInt(b.reminderDays) : 1,
    },
  });
  return json(event, 201);
});
