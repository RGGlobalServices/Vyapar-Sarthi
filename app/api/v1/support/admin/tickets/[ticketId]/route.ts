import prisma from '@/lib/server/prisma';
import { requireAdmin } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ ticketId: string }> };

export const PATCH = handle<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const { ticketId } = await params;
  const { status, adminNotes } = await readBody(req);

  const updateData: Record<string, unknown> = {};
  if (status) updateData.status = status;
  if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
  if (status === 'resolved' || status === 'closed') updateData.resolvedAt = new Date();

  // displayId is not a unique column — locate the ticket then update by id.
  const existing = await prisma.supportTicket.findFirst({ where: { displayId: ticketId } });
  if (!existing) throw new ApiError(404, 'Ticket not found');

  const ticket = await prisma.supportTicket.update({ where: { id: existing.id }, data: updateData });
  return json(ticket);
});
