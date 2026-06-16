import crypto from 'crypto';
import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { sendTicketConfirmationUser, sendTicketNotificationTeam } from '@/lib/server/email';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function shortTicketId() {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
}

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const { type, subject, message, priority, refundAmount, refundReason, txnId } = await readBody(req);

  if (!type || !message) throw new ApiError(400, 'Type and message are required');

  const shop = await prisma.shop.findFirst({ where: { ownerId: user.uuid! } });
  const ticketId = shortTicketId();

  const ticket = await prisma.supportTicket.create({
    data: {
      displayId: ticketId,
      userId: user.uuid,
      name: user.name || user.email,
      email: user.email,
      phone: user.mobile || null,
      shopName: shop?.name || null,
      type,
      priority: priority || 'normal',
      subject: subject || null,
      message,
      refundAmount: refundAmount?.toString() || null,
      refundReason: refundReason || null,
      txnId: txnId || null,
    },
  });

  await sendTicketConfirmationUser(user.name || user.email, user.email, ticketId, type, subject, message);
  await sendTicketNotificationTeam(
    user.name || user.email,
    user.email,
    user.mobile || '',
    shop?.name || '',
    ticketId,
    type,
    subject,
    message,
    priority || 'normal',
  );

  return json(ticket);
});

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const tickets = await prisma.supportTicket.findMany({
    where: { userId: user.uuid! },
    orderBy: { createdAt: 'desc' },
  });
  return json(tickets);
});
