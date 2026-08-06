// UPI deep-link URI for a "Scan & Pay" QR code on printed/PDF bills.
// Spec: upi://pay?pa=<vpa>&pn=<payee name>&am=<amount>&cu=INR&tn=<note>

export function buildUpiPaymentUri(params: {
  upiId: string;
  payeeName?: string;
  amount?: number;
  note?: string;
}): string {
  const { upiId, payeeName, amount, note } = params;
  const q = new URLSearchParams();
  q.set('pa', upiId);
  if (payeeName) q.set('pn', payeeName);
  if (amount && amount > 0) q.set('am', amount.toFixed(2));
  q.set('cu', 'INR');
  if (note) q.set('tn', note);
  return `upi://pay?${q.toString()}`;
}

/**
 * Generates the QR as a data URL up front (awaited at checkout time), rather
 * than leaving it to render reactively inside the invoice component. The
 * reactive version raced the PDF/print capture: cloneNode() only clones
 * whatever's in the DOM *right now*, so a click landing before the async
 * `import('qrcode') + toDataURL()` finished captured the placeholder — not
 * the QR. Awaiting it before the bill is even shown removes that race
 * entirely instead of trying to out-poll it.
 */
export async function generateUpiQrDataUrl(params: {
  upiId: string;
  payeeName?: string;
  amount?: number;
  note?: string;
  size?: number;
}): Promise<string | null> {
  try {
    const QRCode = await import('qrcode');
    const uri = buildUpiPaymentUri(params);
    return await QRCode.default.toDataURL(uri, {
      width: params.size ?? 180,
      margin: 1,
      errorCorrectionLevel: 'M',
    });
  } catch {
    return null;
  }
}

/**
 * Same UPI QR, but as an inline SVG string instead of a raster data URL.
 *
 * This is the form actually rendered on bills. A raster <img> (data URL)
 * repeatedly captured BLANK in the PDF/print snapshot: html2canvas loads
 * each <img> asynchronously and, if the generated QR hadn't finished
 * loading/decoding at snapshot time, it drew nothing — a race no amount of
 * pre-waiting reliably closed. Inline SVG is real DOM (path/rect elements)
 * that html2canvas rasterises synchronously with no separate image load, so
 * the QR is always present in the output. It's also vector-sharp at any zoom.
 *
 * The width/height attributes are stripped so the SVG scales to fill its
 * (CSS-sized) container via its viewBox instead of a hard-coded pixel size.
 */
export async function generateUpiQrSvg(params: {
  upiId: string;
  payeeName?: string;
  amount?: number;
  note?: string;
}): Promise<string | null> {
  try {
    const QRCode = await import('qrcode');
    const uri = buildUpiPaymentUri(params);
    const svg = await QRCode.default.toString(uri, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
    });
    return svg.replace(/\s(width|height)="[^"]*"/g, '');
  } catch {
    return null;
  }
}
