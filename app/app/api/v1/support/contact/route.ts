import crypto from 'crypto';
import {
  sendTicketConfirmationUser,
  sendTicketNotificationTeam,
  sendRefundRequestTeam,
} from '@/lib/server/email';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function shortTicketId() {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
}

export const POST = handle(async (req) => {
  const { name, email, phone, shopName, type, subject, message, refundAmount, refundReason, txnId } =
    await readBody(req);

  if (!name || !email || !type || !message) {
    throw new ApiError(400, 'Name, email, type, and message are required');
  }

  const ticketId = shortTicketId();

  await sendTicketConfirmationUser(name, email, ticketId, type, subject, message);

  if (type === 'refund_request' && refundAmount) {
    await sendRefundRequestTeam(name, email, phone, shopName, ticketId, refundAmount, refundReason, txnId, message);
  } else {
    await sendTicketNotificationTeam(name, email, phone, shopName, ticketId, type, subject, message, 'normal');
  }

  return json({ status: 'success', message: 'Your ticket has been submitted successfully', ticketId });
});
