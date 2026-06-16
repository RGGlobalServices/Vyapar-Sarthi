import { config } from './config';

/**
 * Send a WhatsApp message via Twilio REST API (no SDK needed).
 * Supports text + optional media (PDF) attachment.
 */
export async function sendWhatsApp({
  to,
  body,
  mediaUrl = null,
}: {
  to: string | number;
  body: string;
  mediaUrl?: string | null;
}): Promise<{ success: boolean; sid?: string; reason?: string; error?: string }> {
  if (!config.twilioAccountSid || !config.twilioAuthToken) {
    console.log(`[WHATSAPP] Not configured — skipping. Would send to ${to}: ${body.slice(0, 80)}...`);
    return { success: false, reason: 'not_configured' };
  }

  // Normalize phone number → whatsapp:+91XXXXXXXXXX
  let phone = String(to).replace(/\D/g, '');
  if (phone.length === 10) phone = `91${phone}`;
  else if (phone.startsWith('0') && phone.length === 11) phone = `91${phone.slice(1)}`;
  const toFormatted = `whatsapp:+${phone}`;

  const params = new URLSearchParams({
    From: config.twilioWhatsAppFrom,
    To: toFormatted,
    Body: body,
  });
  if (mediaUrl) params.append('MediaUrl', mediaUrl);

  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`;
  const auth = Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString('base64');

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('[WHATSAPP] Twilio error:', data);
      return { success: false, error: data.message };
    }
    console.log(`[WHATSAPP] Sent to ${toFormatted} sid=${data.sid}`);
    return { success: true, sid: data.sid };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[WHATSAPP] Network error:', message);
    return { success: false, error: message };
  }
}

/**
 * Build the WhatsApp bill message text.
 */
export function buildBillMessage({
  storeName,
  billNumber,
  customerName,
  total,
  pdfUrl,
}: {
  storeName?: string;
  billNumber: string | number;
  customerName?: string;
  total: number;
  pdfUrl?: string;
}): string {
  const name = customerName ? `Hello ${customerName},\n\n` : '';
  const lines = [
    `${name}🧾 *Bill from ${storeName || 'Store'}*`,
    `Bill No: *${billNumber}*`,
    `Total: *₹${Number(total).toLocaleString('en-IN')}*`,
  ];
  if (pdfUrl) lines.push(`\n📄 Download bill: ${pdfUrl}`);
  lines.push('\nThank you for shopping with us! 🙏');
  return lines.join('\n');
}
