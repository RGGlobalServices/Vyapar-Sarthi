/**
 * Barcode symbology auto-detection.
 *
 * This app hard-coded CODE128 everywhere, even for a real 12/13-digit
 * manufacturer EAN/UPC value — this app's own scanners don't care (the
 * keyboard-wedge hook is symbology-agnostic and the camera scanners accept
 * both), but a separate EAN/UPC-only scanner elsewhere (a supplier's, or a
 * fixed retail POS) would reject a CODE128 rendering of what is otherwise
 * "the right barcode." Detect and use the real symbology when the value
 * actually is one — checksum-validated so a bad/incomplete value never gets
 * force-fit into a format JsBarcode would reject at render time.
 */

export type BarcodeFormat = 'EAN13' | 'UPC' | 'CODE128';

// Mirrors JsBarcode's own EAN13 checksum exactly (src/barcodes/EAN_UPC/EAN13.js)
// so a value this function accepts as EAN13 is guaranteed to also pass
// JsBarcode's internal `valid()` check, not just look plausible.
function ean13CheckDigit(first12: string): number {
  const sum = first12
    .split('')
    .reduce((acc, ch, idx) => acc + Number(ch) * (idx % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

// Mirrors JsBarcode's own UPC-A checksum exactly (src/barcodes/EAN_UPC/UPC.js).
function upcCheckDigit(first11: string): number {
  let sum = 0;
  for (let i = 1; i < 11; i += 2) sum += Number(first11[i]);
  for (let i = 0; i < 11; i += 2) sum += Number(first11[i]) * 3;
  return (10 - (sum % 10)) % 10;
}

/** Detect the real symbology for a stored barcode value, falling back to
 *  CODE128 (which can encode any alphanumeric string) for anything that
 *  isn't a checksum-valid EAN13/UPC-A — including the app's own auto-
 *  generated `PRD-XXXXXXXX` placeholders. */
export function detectBarcodeFormat(value: string): BarcodeFormat {
  const v = String(value || '').trim();
  if (/^\d{13}$/.test(v) && Number(v[12]) === ean13CheckDigit(v.slice(0, 12))) return 'EAN13';
  if (/^\d{12}$/.test(v) && Number(v[11]) === upcCheckDigit(v.slice(0, 11))) return 'UPC';
  return 'CODE128';
}
