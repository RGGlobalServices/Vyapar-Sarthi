import { Router } from 'express';
import crypto from 'crypto';
import { authenticateUser, getCurrentUser } from '../middleware/auth.js';
import prisma from '../db.js';
import { sendTicketConfirmationUser, sendTicketNotificationTeam, sendRefundRequestTeam } from '../utils/email.js';

const router = Router();

function shortTicketId() {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
}

router.post('/contact', async (req, res) => {
  try {
    const { name, email, phone, shopName, type, subject, message, refundAmount, refundReason, txnId } = req.body;

    if (!name || !email || !type || !message) {
      return res.status(400).json({ detail: 'Name, email, type, and message are required' });
    }

    const ticketId = shortTicketId();

    await sendTicketConfirmationUser(name, email, ticketId, type, subject, message);

    if (type === 'refund_request' && refundAmount) {
      await sendRefundRequestTeam(name, email, phone, shopName, ticketId, refundAmount, refundReason, txnId, message);
    } else {
      await sendTicketNotificationTeam(name, email, phone, shopName, ticketId, type, subject, message, 'normal');
    }

    return res.json({ status: 'success', message: 'Your ticket has been submitted successfully', ticketId });
  } catch (err) {
    console.error('Contact error:', err);
    return res.status(500).json({ detail: 'Internal server error' });
  }
});

router.post('/tickets', authenticateUser, getCurrentUser, async (req, res) => {
  try {
    const user = req.user;
    const { type, subject, message, priority, refundAmount, refundReason, txnId } = req.body;

    if (!type || !message) {
      return res.status(400).json({ detail: 'Type and message are required' });
    }

    const shop = await prisma.shop.findFirst({ where: { ownerId: user.uuid } });
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
      priority || 'normal'
    );

    return res.json(ticket);
  } catch (err) {
    console.error('Create ticket error:', err);
    return res.status(500).json({ detail: 'Internal server error' });
  }
});

router.get('/tickets', authenticateUser, getCurrentUser, async (req, res) => {
  try {
    const user = req.user;
    const tickets = await prisma.supportTicket.findMany({
      where: { userId: user.uuid },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(tickets);
  } catch (err) {
    console.error('Get tickets error:', err);
    return res.status(500).json({ detail: 'Internal server error' });
  }
});

router.get('/admin/tickets', async (req, res) => {
  try {
    const tickets = await prisma.supportTicket.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return res.json(tickets);
  } catch (err) {
    console.error('Admin get tickets error:', err);
    return res.status(500).json({ detail: 'Internal server error' });
  }
});

router.patch('/admin/tickets/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status, adminNotes } = req.body;

    const updateData = {};
    if (status) updateData.status = status;
    if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
    if (status === 'resolved' || status === 'closed') {
      updateData.resolvedAt = new Date();
    }

    const ticket = await prisma.supportTicket.update({
      where: { displayId: ticketId },
      data: updateData,
    });

    return res.json(ticket);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ detail: 'Ticket not found' });
    }
    console.error('Admin update ticket error:', err);
    return res.status(500).json({ detail: 'Internal server error' });
  }
});

export default router;
