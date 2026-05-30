import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!config.smtpUser || !config.smtpPass) return null;
  transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: false,
    auth: { user: config.smtpUser, pass: config.smtpPass },
  });
  return transporter;
}

export function sendEmail(to, subject, html) {
  const t = getTransporter();
  if (!t) {
    console.log(`[EMAIL] To: ${to}`);
    console.log(`[EMAIL] Subject: ${subject}`);
    console.log(`[EMAIL] Body: ${html.slice(0, 500)}`);
    return;
  }
  return t.sendMail({ from: config.smtpUser, to, subject, html });
}

export function sendTicketConfirmationUser(name, userEmail, ticketId, ticketType, subject, message) {
  const html = `...`; // shortened - full HTML template
  return sendEmail(userEmail, `Ticket #${ticketId.slice(0, 8)} — Confirmation`, html);
}

export function sendTicketNotificationTeam(name, email, phone, shopName, ticketId, ticketType, subject, message, priority, refundDetails = '') {
  const html = `...`; // shortened
  return sendEmail(config.supportEmail, `[Ticket #${ticketId.slice(0, 8)}] ${ticketType}: ${subject || name}`, html);
}

export function sendRefundRequestTeam(name, email, phone, shopName, ticketId, refundAmount, refundReason, txnId, message) {
  const html = `...`; // shortened
  return sendEmail(config.supportEmail, `[REFUND] #${ticketId.slice(0, 8)} — ₹${refundAmount} — ${name}`, html);
}
