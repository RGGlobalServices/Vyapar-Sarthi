import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// PATCH /calendar/:id — update fields or mark done
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const existing = await prisma.calendarEvent.findFirst({ where: { id, shopId: shop.id } });
  if (!existing) throw new ApiError(404, 'Event not found');

  const b = await readBody(req);
  const data: Record<string, unknown> = {};
  if (b.title !== undefined) data.title = b.title.trim();
  if (b.description !== undefined) data.description = b.description?.trim() || null;
  if (b.eventDate !== undefined) {
    const d = new Date(b.eventDate);
    if (isNaN(d.getTime())) throw new ApiError(400, 'Invalid eventDate');
    data.eventDate = d;
  }
  if (b.eventType !== undefined) data.eventType = b.eventType;
  if (b.amount !== undefined) data.amount = b.amount != null && b.amount !== '' ? parseFloat(b.amount) : null;
  if (b.customerName !== undefined) data.customerName = b.customerName?.trim() || null;
  if (b.status !== undefined) data.status = b.status;
  if (b.reminderDays !== undefined) data.reminderDays = parseInt(b.reminderDays);
  if (b.notified !== undefined) data.notified = !!b.notified;

  const event = await prisma.calendarEvent.update({ where: { id }, data });
  return json(event);
});

// DELETE /calendar/:id
export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const existing = await prisma.calendarEvent.findFirst({ where: { id, shopId: shop.id } });
  if (!existing) throw new ApiError(404, 'Event not found');
  await prisma.calendarEvent.delete({ where: { id } });
  return json({ detail: 'Event deleted' });
});
