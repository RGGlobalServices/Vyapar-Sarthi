import { requireShop } from '@/lib/server/auth';
import { sendWhatsApp, buildBillMessage } from '@/lib/server/whatsapp';
import { sendBillEmail } from '@/lib/server/email';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /billing/send-bill — auto-send bill PDF via WhatsApp + email
export const POST = handle(async (req) => {
  await requireShop(req);
  const { phone, email, pdfUrl, billNumber, customerName, storeName, total, items } =
    await readBody(req);

  if (!phone && !email) throw new ApiError(400, 'phone or email required');

  const results: { whatsapp: unknown; email: unknown } = { whatsapp: null, email: null };

  if (phone) {
    const message = buildBillMessage({ storeName, billNumber, customerName, total, pdfUrl });
    sendWhatsApp({ to: phone, body: message, mediaUrl: pdfUrl || null }).catch(err => {
      console.error('WhatsApp send error:', err);
    });
    results.whatsapp = { success: true, note: 'Sending in background' };
  }

  if (email) {
    sendBillEmail({ to: email, customerName, storeName, billNumber, total, items: items || [], pdfUrl }).catch(err => {
      const msg = err instanceof Error ? err.message : 'unknown';
      console.error('Bill email error:', msg);
    });
    results.email = { success: true, note: 'Sending in background' };
  }

  return json({ detail: 'Bill send attempted', results });
});
