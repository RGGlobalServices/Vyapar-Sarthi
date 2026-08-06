import { useEffect, useState } from 'react';
import { buildUpiPaymentUri } from '@/lib/upi';

/** Renders a UPI "Scan & Pay" QR as a data URL. Null while upiId is unset. */
export function useUpiQrCode(params: {
  upiId?: string;
  payeeName?: string;
  amount?: number;
  note?: string;
  size?: number;
}): string | null {
  const { upiId, payeeName, amount, note, size = 160 } = params;
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!upiId) { setDataUrl(null); return; }
    let cancelled = false;
    const uri = buildUpiPaymentUri({ upiId, payeeName, amount, note });
    import('qrcode').then((QRCode) => {
      QRCode.default
        .toDataURL(uri, { width: size, margin: 1, errorCorrectionLevel: 'M' })
        .then((url) => { if (!cancelled) setDataUrl(url); })
        .catch(() => { if (!cancelled) setDataUrl(null); });
    });
    return () => { cancelled = true; };
  }, [upiId, payeeName, amount, note, size]);

  return dataUrl;
}
