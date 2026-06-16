import nodemailer from 'nodemailer';
import { config } from './config';

let transporter: nodemailer.Transporter | null = null;

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

export function sendEmail(to: string, subject: string, html: string) {
  const t = getTransporter();
  if (!t) {
    console.log(`[EMAIL] To: ${to}`);
    console.log(`[EMAIL] Subject: ${subject}`);
    console.log(`[EMAIL] Body: ${html.slice(0, 500)}`);
    return;
  }
  return t.sendMail({ from: config.smtpUser, to, subject, html });
}

export function sendTicketConfirmationUser(
  name: string,
  userEmail: string,
  ticketId: string,
  ticketType: string,
  subject: string,
  message: string,
) {
  const html = `Ticket #${ticketId.slice(0, 8)} confirmation for ${name}: ${ticketType} — ${subject} — ${message}`;
  return sendEmail(userEmail, `Ticket #${ticketId.slice(0, 8)} — Confirmation`, html);
}

export function sendTicketNotificationTeam(
  name: string,
  email: string,
  phone: string,
  shopName: string,
  ticketId: string,
  ticketType: string,
  subject: string,
  message: string,
  priority: string,
  refundDetails = '',
) {
  const html = `New ticket from ${name} (${email}, ${phone}, ${shopName}): [${priority}] ${ticketType} — ${subject} — ${message} ${refundDetails}`;
  return sendEmail(
    config.supportEmail,
    `[Ticket #${ticketId.slice(0, 8)}] ${ticketType}: ${subject || name}`,
    html,
  );
}

export function sendRefundRequestTeam(
  name: string,
  email: string,
  phone: string,
  shopName: string,
  ticketId: string,
  refundAmount: number | string,
  refundReason: string,
  txnId: string,
  message: string,
) {
  const html = `Refund request from ${name} (${email}, ${phone}, ${shopName}): ₹${refundAmount} — reason: ${refundReason} — txn: ${txnId} — ${message}`;
  return sendEmail(
    config.supportEmail,
    `[REFUND] #${ticketId.slice(0, 8)} — ₹${refundAmount} — ${name}`,
    html,
  );
}

export function sendPasswordResetOTP(to: string, otp: string, name: string) {
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Arial,sans-serif;color:#e2e8f0;">
  <div style="max-width:480px;margin:32px auto;background:#1e293b;border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#10b981,#059669);padding:28px 32px;">
      <h1 style="margin:0;font-size:20px;color:#fff;">🔐 Password Reset — Vyapar Sarthi</h1>
      <p style="margin:6px 0 0;color:#d1fae5;font-size:14px;">Use the code below to reset your password</p>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 8px;color:#94a3b8;font-size:14px;">Hi <strong style="color:#e2e8f0;">${name}</strong>,</p>
      <p style="margin:0 0 24px;color:#94a3b8;font-size:14px;">We received a request to reset your password. Enter this 6-digit OTP:</p>
      <div style="background:#0f172a;border:2px dashed #334155;border-radius:12px;padding:20px;text-align:center;margin:0 0 24px;">
        <span style="font-size:40px;font-weight:900;letter-spacing:12px;color:#10b981;font-family:monospace;">${otp}</span>
      </div>
      <p style="margin:0 0 8px;color:#64748b;font-size:13px;">⏱ This code expires in <strong style="color:#e2e8f0;">10 minutes</strong>.</p>
      <p style="margin:0;color:#64748b;font-size:13px;">If you did not request a password reset, ignore this email — your account is safe.</p>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #0f172a;text-align:center;">
      <p style="margin:0;color:#475569;font-size:12px;">Powered by Vyapar Sarthi · Do not reply to this email</p>
    </div>
  </div>
</body>
</html>`;
  return sendEmail(to, 'Your Password Reset OTP — Vyapar Sarthi', html);
}

export function sendBillEmail({
  to,
  customerName,
  storeName,
  billNumber,
  total,
  items = [],
  pdfUrl,
}: {
  to?: string;
  customerName?: string;
  storeName?: string;
  billNumber: string | number;
  total: number;
  items?: Array<{ name: string; quantity: number; unit?: string; price: number }>;
  pdfUrl?: string;
}) {
  if (!to) return Promise.resolve();

  const itemRows = items
    .map(
      (item) =>
        `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #1e293b;">${item.name}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #1e293b;text-align:center;">${item.quantity} ${item.unit || ''}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #1e293b;text-align:right;">₹${Number(item.price * item.quantity).toLocaleString('en-IN')}</td>
    </tr>`,
    )
    .join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Arial,sans-serif;color:#e2e8f0;">
  <div style="max-width:520px;margin:32px auto;background:#1e293b;border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#10b981,#059669);padding:28px 32px;">
      <h1 style="margin:0;font-size:22px;color:#fff;">🧾 Your Bill from ${storeName || 'Store'}</h1>
      <p style="margin:6px 0 0;color:#d1fae5;font-size:14px;">Bill No: <strong>${billNumber}</strong></p>
    </div>
    <div style="padding:24px 32px;">
      ${customerName ? `<p style="margin:0 0 16px;color:#94a3b8;">Hi <strong style="color:#e2e8f0;">${customerName}</strong>, here is your bill summary.</p>` : ''}
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#0f172a;">
            <th style="padding:8px;text-align:left;color:#64748b;">Item</th>
            <th style="padding:8px;text-align:center;color:#64748b;">Qty</th>
            <th style="padding:8px;text-align:right;color:#64748b;">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div style="margin-top:16px;padding:12px 16px;background:#0f172a;border-radius:10px;display:flex;justify-content:space-between;">
        <span style="color:#94a3b8;font-size:15px;">Total</span>
        <span style="color:#10b981;font-size:18px;font-weight:bold;">₹${Number(total).toLocaleString('en-IN')}</span>
      </div>
      ${
        pdfUrl
          ? `
      <div style="margin-top:20px;text-align:center;">
        <a href="${pdfUrl}" style="display:inline-block;padding:12px 28px;background:#10b981;color:#fff;border-radius:10px;text-decoration:none;font-weight:bold;">
          📄 Download PDF Bill
        </a>
      </div>`
          : ''
      }
      <p style="margin-top:24px;color:#64748b;font-size:13px;text-align:center;">
        Thank you for shopping at ${storeName || 'our store'}! 🙏<br>
        Powered by Vyapar Sarthi
      </p>
    </div>
  </div>
</body>
</html>`;

  return sendEmail(
    to,
    `Your Bill #${billNumber} from ${storeName || 'Store'} — ₹${Number(total).toLocaleString('en-IN')}`,
    html,
  );
}
