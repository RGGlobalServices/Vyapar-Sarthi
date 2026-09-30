/**
 * Sharp bill PDFs. The bill is photographed off-screen with html2canvas and placed in the PDF as an image, so the
 * result is only as sharp as that photo: the old 2.2x JPEG (quality 0.82) looked soft and showed compression fuzz
 * around every letter as soon as the PDF was zoomed. Now: as many pixels per CSS pixel as the browser can safely
 * hold (up to 4x, about 400 dpi on an A4 bill) and lossless PNG, which keeps black text on white perfectly crisp
 * and, for a page that is mostly white, stays a modest file size.
 */

const MAX_SCALE = 4;
// Mobile browsers refuse canvases beyond ~16.7 million pixels (iOS Safari) and PNG encoding of a huge canvas is slow on
// budget phones — 9 MP keeps an A4 bill at 3x (about 300 dpi) and a thermal slip at the full 4x.
const MAX_PIXELS = 9_000_000;

export function pickCaptureScale(widthPx: number, heightPx: number): number {
  const w = Math.max(1, Math.round(widthPx || 1));
  const h = Math.max(1, Math.round(heightPx || 1));
  const byArea = Math.sqrt(MAX_PIXELS / (w * h));
  // Never below 2 (still sharper than before) unless the bill is enormous; never above MAX_SCALE.
  return Math.max(1.5, Math.min(MAX_SCALE, byArea));
}
