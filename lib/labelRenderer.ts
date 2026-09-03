/**
 * Shared label layout engine + PDF renderer.
 *
 * SINGLE SOURCE OF TRUTH for label geometry — consumed by both the Live
 * Preview (LabelPreview in BarcodePrintSettings.tsx) and the actual PDF
 * output (generateLabelPdf below). Whatever the preview shows is exactly
 * what the printed PDF page contains, at exactly the same mm dimensions.
 *
 * Why direct PDF (jsPDF) instead of window.print() + HTML:
 *   window.print() delegates the page size to the OS printer driver. When
 *   the user's chosen printer is Chrome's virtual "Microsoft Print to PDF"
 *   (default A4 portrait), Chrome ignores the @page size we requested and
 *   the label ends up centered / rotated on A4. Real label printers
 *   configured for 60×30 mm stock work correctly, but the shopkeeper's
 *   sanity check via Save-as-PDF didn't, which broke trust in the feature.
 *
 *   jsPDF creates the PDF file itself at the exact requested page format.
 *   Chrome / Adobe / any viewer opens a PDF whose declared page IS 60×30
 *   mm — no auto-rotation, no A4 wrapping, no fit-to-page. Printing from
 *   Adobe / Chrome PDF viewer respects the PDF's declared page size (as
 *   long as "Actual Size" is chosen, which the modal already warns about).
 */

import type { PrinterProfile } from './printProfiles';
import { autoFitBarcode, mmToPx, ptToMm, computeSheetGeometry, DEFAULT_SHEET, formatPriceNumber } from './printProfiles';
import { autoDetectFormat } from './barcodeValidation';

export interface LabelRow {
  name: string;
  variantKey?: string;
  barcode: string;
  sellingPrice?: number;
  mrp?: number;
  copies?: number;
  /** Product's own SKU/stock-code. Only printed when profile.fields.sku is
   *  on AND the product actually has one set — see computeLabelLayout. */
  sku?: string;
  /** Free-text "Other Code" the shopkeeper writes once against the product
   *  (distinct from SKU/barcode — no scan/lookup meaning, purely a printable
   *  reference). Only printed when profile.fields.otherCode is on AND the
   *  product actually has one set — see computeLabelLayout. */
  otherCode?: string;
}

/**
 * Fully computed layout for one label — everything in millimetres,
 * anchored at the label's top-left corner (0,0). Both the preview and
 * the PDF renderer read from a LabelLayout, never the raw profile — so
 * any change to the layout math applies to both surfaces at once.
 */
export interface LabelLayout {
  widthMm: number;
  heightMm: number;
  isRollPaper: boolean;
  /** Text lines to draw, top to bottom. */
  lines: LabelTextLine[];
  barcode: {
    x: number; y: number; width: number; height: number;
    /** Wrapper INCLUDES the quiet-zone padding around the barcode SVG. */
    quietZoneMm: number;
    format: 'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'CODE39';
    /** Whether to render the digits below the bars (JsBarcode's own
     *  displayValue). Kept at the layout level so both preview and PDF
     *  agree. */
    displayValue: boolean;
  } | null;
}

export interface LabelTextLine {
  y: number;
  text: string;
  fontSizePt: number;
  fontWeight: 'normal' | 'medium' | 'bold';
  color: string;
  /** Emphasis / styling class — 'name' / 'variant' / 'price' etc. Kept
   *  loose so the preview can style with CSS while jsPDF can pick its
   *  own font weight/color. 'mrp' identifies the MRP line specifically
   *  (kept distinct from the generic 'note' emphasis so it can't be
   *  confused with the barcode-number or custom-text lines) — but whether
   *  it actually STRIKES THROUGH is controlled separately by `strikethrough`
   *  below, since that's a shopkeeper-configurable toggle, not a fixed
   *  property of "being the MRP line". */
  emphasis: 'name' | 'variant' | 'header1' | 'header2' | 'price' | 'note' | 'mrp';
  /** Draw a strikethrough through this line — set true only for MRP, and
   *  only when profile.mrpStrikethrough is on (default true). */
  strikethrough?: boolean;
  align: 'left' | 'center' | 'right';
  /** Reserve height for THIS line — includes the small line-height
   *  padding. Used by the caller to advance the y cursor. */
  heightMm: number;
}

/**
 * Compute the full layout for one label from a profile + row. Called
 * ONCE, consumed by both preview and PDF renderer. Guarantees they never
 * disagree.
 */
export function computeLabelLayout(profile: PrinterProfile, row: LabelRow, opts: { labelText?: string; labelLine1?: string; labelLine2?: string } = {}): LabelLayout {
  const widthMm = profile.labelWidthMm;
  const isRollPaper = profile.labelHeightMm <= 0;
  // Auto-fit resolves the barcode's mm dimensions from THIS row's own
  // barcode value (so a short code prints narrower and a long one prints
  // wider, instead of every row being stretched/squeezed to one constant
  // width); when off we take profile values literally.
  const barSize = profile.autoFit
    ? autoFitBarcode(profile, row.barcode)
    : { widthMm: profile.barcodeWidthMm, heightMm: profile.barcodeHeightMm };

  // Assemble text lines per the field flags. Line height is roughly 1.3×
  // font size so descenders don't collide. All measurements in mm.
  // Per-element font sizes: EVERY row on the label (shop, product name,
  // variant, barcode #, MRP, selling price, note) can be independently
  // sized so making one row bigger doesn't force every other row to match.
  // Undefined → derives from the base fontSizePt so old profiles render
  // exactly as before.
  const nameFontPt = Math.max(6, profile.productNameFontSizePt ?? profile.fontSizePt);
  const lineHeightMm = ptToMm(nameFontPt) * 1.3;
  const variantFontPt = Math.max(6, profile.variantFontSizePt ?? (profile.fontSizePt - 1));
  const smallLineMm = ptToMm(variantFontPt) * 1.3;
  const header1FontPt = Math.max(6, profile.headerFontSizePt ?? (profile.fontSizePt + 1));
  const headerLineMm = ptToMm(header1FontPt) * 1.3;
  const header2FontPt = Math.max(6, profile.fontSizePt - 1);
  const header2LineMm = ptToMm(header2FontPt) * 1.3;
  const barcodeNumFontPt = Math.max(6, profile.barcodeNumberFontSizePt ?? (profile.fontSizePt - 1));
  const barcodeNumLineMm = ptToMm(barcodeNumFontPt) * 1.3;
  const mrpFontPt = Math.max(6, profile.mrpFontSizePt ?? (profile.fontSizePt - 1));
  const mrpLineMm = ptToMm(mrpFontPt) * 1.3;
  const priceFontPt = Math.max(6, profile.priceFontSizePt ?? (profile.fontSizePt + 2));
  const priceLineMm = ptToMm(priceFontPt) * 1.3;
  const noteFontPt = Math.max(6, profile.customTextFontSizePt ?? profile.fontSizePt);
  const noteLineMm = ptToMm(noteFontPt) * 1.3;
  const skuFontPt = Math.max(6, profile.skuFontSizePt ?? (profile.fontSizePt - 1));
  const skuLineMm = ptToMm(skuFontPt) * 1.3;
  const otherCodeFontPt = Math.max(6, profile.otherCodeFontSizePt ?? (profile.fontSizePt - 1));
  const otherCodeLineMm = ptToMm(otherCodeFontPt) * 1.3;
  // Currency prefix — default empty. Past labels hard-coded "INR" (jsPDF's
  // Helvetica has no ₹ glyph) which the shopkeeper found unreadable/ugly;
  // now the number prints alone unless they opt into a prefix. Number
  // FORMAT (comma / plain / decimal) is separately shopkeeper-editable —
  // see PrinterProfile.priceNumberFormat.
  // The Settings UI still offers "₹" as a currency choice (and it renders
  // fine in that live HTML preview), but jsPDF's Helvetica/WinAnsiEncoding
  // has no glyph for U+20B9 — passed through as-is it silently truncates to
  // byte 0xB9 (prints as a stray superscript "1") AND corrupts the spacing
  // of the entire surrounding line. Swap it for the always-safe "Rs." only
  // at this final PDF-text boundary, so the real printed label can never
  // come out garbled no matter what a shopkeeper picks.
  const currency = (profile.currencyPrefix ?? '').trim().replace(/₹/g, 'Rs.');
  const money = (n: number) => {
    const formatted = formatPriceNumber(n, profile.priceNumberFormat);
    return currency ? `${currency} ${formatted}` : formatted;
  };

  // Build the ABOVE-barcode and BELOW-barcode line groups explicitly (instead
  // of one array + fragile count-slicing) so each element can independently
  // choose its side.
  const aboveLines: LabelTextLine[] = [];
  const belowLines: LabelTextLine[] = [];

  // Shop-name header always sits at the very top.
  if (profile.fields.shopName && opts.labelLine1?.trim())
    aboveLines.push({ y: 0, text: opts.labelLine1.trim(), fontSizePt: header1FontPt, fontWeight: 'bold', color: '#000000', emphasis: 'header1', align: profile.textAlign, heightMm: headerLineMm });
  if (profile.fields.shopName && opts.labelLine2?.trim())
    aboveLines.push({ y: 0, text: opts.labelLine2.trim(), fontSizePt: header2FontPt, fontWeight: 'medium', color: '#333333', emphasis: 'header2', align: profile.textAlign, heightMm: header2LineMm });

  const nameLine = profile.fields.productName ? row.name : '';
  const variantLine = ((profile.fields.variant || profile.fields.size || profile.fields.colour) && row.variantKey) ? row.variantKey : '';
  const noteLine = profile.fields.customText && opts.labelText?.trim() ? opts.labelText.trim() : '';
  // MRP and Selling can BOTH appear. MRP keeps the fixed "MRP" caption; the
  // selling line uses the editable caption (e.g. "Offer"). No currency prefix
  // by default — jsPDF's Helvetica has no ₹ glyph and the shopkeeper found
  // the old hard-coded "INR" unreadable; opt-in via profile.currencyPrefix.
  const sellingPrice = row.sellingPrice || 0;
  const mrp = row.mrp || 0;
  const sellCaption = (profile.sellingPriceLabel ?? 'Rate').trim();
  // Suffix (e.g. "/-") is appended exactly as saved — no space is inserted
  // automatically, so the shopkeeper's own typed spacing (or lack of it)
  // is preserved verbatim.
  const sellSuffix = profile.sellingPriceSuffix ?? '';
  const mrpTextLine = profile.fields.mrp && mrp > 0 ? `MRP ${money(mrp)}` : '';
  const sellTextLine = profile.fields.sellingPrice && sellingPrice > 0
    ? `${sellCaption ? sellCaption + ' ' : ''}${money(sellingPrice)}${sellSuffix}`
    : '';
  const barcodeNumberLine = profile.fields.barcodeNumber && row.barcode ? row.barcode : '';
  // SKU only prints when BOTH the toggle is on AND this product actually
  // has one set — flipping the toggle on a product with no SKU was
  // previously a silent no-op (nothing was ever wired to read it at all).
  const skuLine = profile.fields.sku && row.sku?.trim() ? `SKU: ${row.sku.trim()}` : '';
  // Other Code — same on/off + has-a-value gating as SKU, so an empty
  // toggle never prints a blank/empty-labelled line.
  const otherCodeLine = profile.fields.otherCode && row.otherCode?.trim() ? row.otherCode.trim() : '';

  // Name + variant follow the (existing) text position toggle.
  const nvTarget = profile.textPosition === 'above' ? aboveLines : belowLines;
  if (nameLine)    nvTarget.push({ y: 0, text: nameLine, fontSizePt: nameFontPt, fontWeight: profile.fontWeight, color: '#000000', emphasis: 'name', align: profile.textAlign, heightMm: lineHeightMm });
  if (variantLine) nvTarget.push({ y: 0, text: variantLine, fontSizePt: variantFontPt, fontWeight: 'bold', color: '#4338ca', emphasis: 'variant', align: profile.textAlign, heightMm: smallLineMm });
  if (skuLine)      nvTarget.push({ y: 0, text: skuLine, fontSizePt: skuFontPt, fontWeight: 'normal', color: '#334155', emphasis: 'note', align: profile.textAlign, heightMm: skuLineMm });
  if (otherCodeLine) nvTarget.push({ y: 0, text: otherCodeLine, fontSizePt: otherCodeFontPt, fontWeight: 'normal', color: '#334155', emphasis: 'note', align: profile.textAlign, heightMm: otherCodeLineMm });

  // Barcode digits: a single continuous line under the bars (not the EAN-split)
  // — always below the barcode.
  if (barcodeNumberLine) belowLines.push({ y: 0, text: barcodeNumberLine, fontSizePt: barcodeNumFontPt, fontWeight: 'normal', color: '#000000', emphasis: 'note', align: 'center', heightMm: barcodeNumLineMm });

  // Custom note — own position / size / weight / alignment.
  if (noteLine) {
    (profile.customTextPosition === 'above' ? aboveLines : belowLines).push({
      y: 0, text: noteLine, fontSizePt: noteFontPt,
      fontWeight: profile.customTextBold ? 'bold' : 'normal',
      color: '#334155', emphasis: 'note',
      align: profile.customTextAlign ?? profile.textAlign, heightMm: noteLineMm,
    });
  }

  // MRP + selling/offer — own position (default below). Selling uses the big
  // price font so the offer rate stands out.
  const priceTarget = profile.pricePosition === 'above' ? aboveLines : belowLines;
  if (mrpTextLine)  priceTarget.push({ y: 0, text: mrpTextLine, fontSizePt: mrpFontPt, fontWeight: 'normal', color: '#475569', emphasis: 'mrp', strikethrough: profile.mrpStrikethrough ?? true, align: profile.textAlign, heightMm: mrpLineMm });
  if (sellTextLine) priceTarget.push({ y: 0, text: sellTextLine, fontSizePt: priceFontPt, fontWeight: 'bold', color: '#000000', emphasis: 'price', align: profile.textAlign, heightMm: priceLineMm });

  const lines: LabelTextLine[] = [...aboveLines, ...belowLines];

  // Barcode horizontal anchor (centred, or nudged to the margin for left/right).
  const barcodeX = (widthMm - barSize.widthMm) / 2 + (profile.positionH === 'left' ? -(widthMm - barSize.widthMm) / 2 + profile.margins.left : profile.positionH === 'right' ? (widthMm - barSize.widthMm) / 2 - profile.margins.right : 0);

  const aboveHeightMm = aboveLines.reduce((s, l) => s + l.heightMm, 0);
  const belowHeightMm = belowLines.reduce((s, l) => s + l.heightMm, 0);

  // Belt-and-suspenders: even if autoFit is off (user pinned a big
  // barcode manually) or autoFit's estimate is a hair short, hard-clamp
  // the barcode height so the total content fits inside the physical
  // label. Client reported cropping on 58mm receipt + 70×40 mm labels —
  // the label declared 40mm tall but content wanted 44mm, so the bottom
  // 4mm (price line + a bit of the barcode number) fell off the page.
  // With this clamp, autoFit-off users still get a squeezed-but-visible
  // barcode instead of a silently-clipped label.
  let barcodeHeightMm = barSize.heightMm;
  if (!isRollPaper) {
    const availableForBarcode = profile.labelHeightMm
      - profile.margins.top - profile.margins.bottom
      - aboveHeightMm - belowHeightMm
      - 2 * profile.spacingMm
      - 2 * profile.quietZoneMm;
    // ALWAYS clamp, even when availableForBarcode is negative (too many text
    // rows enabled for this label size). The old `> 0` guard skipped the
    // clamp entirely in that case, leaving the un-clamped autoFit height in
    // place — which could push the barcode image past the label's bottom
    // edge and off the physical PDF page, making it look like "the barcode
    // doesn't print" once a shopkeeper enabled one more field (e.g. Sell
    // Price) than the label had room for. Flooring to 6mm guarantees a
    // visible (if tightly packed) barcode instead of one silently clipped
    // off-page.
    barcodeHeightMm = Math.max(6, Math.min(barcodeHeightMm, availableForBarcode));
  }
  const barcodeBlockMm = barcodeHeightMm + profile.quietZoneMm * 2;

  // Fixed-size labels (non-roll) have a page height that CANNOT grow — if
  // the shopkeeper enables enough fields that the text alone (plus the two
  // barcode-adjacent gaps) needs more room than the label has left after the
  // barcode, the extra rows previously got positioned past the label's
  // bottom edge and were silently cut off the printed PDF page (reported as
  // "the barcode/[a field] doesn't come in print" the moment one more field,
  // e.g. Sell Price, was switched on for a small label). Rather than let
  // that happen, shrink every text line's line-height + the two gaps
  // proportionally so the whole stack always fits — tighter spacing beats a
  // vanished row. The barcode itself is never shrunk further here; it was
  // already floored to a scannable minimum above.
  let effSpacingMm = profile.spacingMm;
  if (!isRollPaper) {
    const innerHForShrink = profile.labelHeightMm - profile.margins.top - profile.margins.bottom;
    const nonBarcodeMm = aboveHeightMm + belowHeightMm + 2 * profile.spacingMm;
    const availableForNonBarcode = Math.max(0, innerHForShrink - barcodeBlockMm);
    if (nonBarcodeMm > 0 && availableForNonBarcode < nonBarcodeMm) {
      const shrink = Math.max(0, Math.min(1, availableForNonBarcode / nonBarcodeMm));
      // Shrink the font size along with its line-height slot — otherwise the
      // slot gets tighter than the (unchanged) glyph height and adjacent
      // rows visually overlap instead of just sitting closer together.
      for (const l of lines) { l.heightMm *= shrink; l.fontSizePt = Math.max(5, l.fontSizePt * shrink); }
      effSpacingMm = profile.spacingMm * shrink;
    }
  }
  const aboveHeightMmFinal = aboveLines.reduce((s, l) => s + l.heightMm, 0);
  const belowHeightMmFinal = belowLines.reduce((s, l) => s + l.heightMm, 0);

  const totalContentMm = aboveHeightMmFinal + effSpacingMm + barcodeBlockMm + effSpacingMm + belowHeightMmFinal;
  const labelHeightMm = isRollPaper ? (totalContentMm + profile.margins.top + profile.margins.bottom) : profile.labelHeightMm;

  // Anchor to the vertical position choice. Available inner height is the
  // label height minus top/bottom margins minus the content block.
  const innerH = labelHeightMm - profile.margins.top - profile.margins.bottom;
  const freeSpaceMm = Math.max(0, innerH - totalContentMm);
  const startY = profile.margins.top + (
    profile.positionV === 'top' ? 0 :
    profile.positionV === 'bottom' ? freeSpaceMm :
    freeSpaceMm / 2
  );

  // Assign Y coordinates now.
  let y = startY;
  for (const l of aboveLines) { l.y = y; y += l.heightMm; }
  y += effSpacingMm;
  const barcodeY = y + profile.quietZoneMm;
  y += barcodeBlockMm + effSpacingMm;
  for (const l of belowLines) { l.y = y; y += l.heightMm; }

  return {
    widthMm,
    heightMm: labelHeightMm,
    isRollPaper,
    lines,
    barcode: row.barcode ? {
      x: Math.max(profile.margins.left + profile.quietZoneMm, barcodeX),
      y: barcodeY,
      width: barSize.widthMm,
      // Use the CLAMPED height computed above, not the raw autoFit / manual
      // value — that's the whole reason the label was overflowing. See the
      // `barcodeHeightMm` derivation block for the reasoning.
      height: barcodeHeightMm,
      quietZoneMm: profile.quietZoneMm,
      format: profile.barcodeType === 'auto'
        ? autoDetectFormat(row.barcode)
        : (profile.barcodeType === 'CODE39' ? 'CODE39' : profile.barcodeType) as LabelLayout['barcode'] extends null ? never : NonNullable<LabelLayout['barcode']>['format'],
      // Digits are drawn by our own text-line below (contiguous, not
      // EAN-split) — see barcodeNumberLine above. Set to false so
      // JsBarcode doesn't ALSO draw them inside the SVG.
      displayValue: false,
    } : null,
  };
}

/**
 * Render a JsBarcode SVG element for a given value at a given size in mm.
 * Kept as its own function so both the preview (SVG DOM node) and the PDF
 * renderer (SVG → PNG via canvas) share the exact same generation call.
 * Runs client-side only — dynamically imports jsbarcode.
 */
/**
 * Render a barcode DIRECTLY to a canvas and return the PNG data URL.
 * Preferred for PDF embedding — bypasses the SVG-serialise round-trip
 * that failed silently in Chrome (unattached SVG couldn't rasterise, PDF
 * came back with text but no barcode image). Sized in pixels — caller
 * converts mm → pixels using its target DPI.
 */
export async function renderBarcodePngDataUrl(
  value: string,
  format: NonNullable<LabelLayout['barcode']>['format'],
  widthPx: number,
  heightPx: number,
  displayValue: boolean,
  fontSizePt: number,
): Promise<string> {
  const { default: JsBarcode } = await import('jsbarcode');
  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const estimatedModules = (() => {
    switch (format) {
      case 'EAN13': case 'UPC': return 95;
      case 'EAN8': return 67;
      case 'CODE39': return Math.max(30, 13 * value.length + 16);
      default: return Math.max(30, 11 * value.length + 35);
    }
  })();
  JsBarcode(canvas, value, {
    format,
    // JsBarcode's `width` here is the module width IN PIXELS on the
    // target canvas. Choose it so `modules × width` ≈ our canvas width,
    // then JsBarcode fills the canvas cleanly.
    width: Math.max(1, widthPx / estimatedModules),
    height: heightPx,
    displayValue,
    fontSize: fontSizePt * (widthPx / (widthPx * 0.264583) * 0.264583) * (96 / 72), // conservative: scale font with pixel dimensions
    fontOptions: 'bold',
    margin: 0,
    background: '#ffffff',
    lineColor: '#000000',
  });
  return canvas.toDataURL('image/png');
}

/**
 * @deprecated — kept only because the earlier preview path referenced it.
 * New code should use `renderBarcodePngDataUrl` above (direct-to-canvas)
 * which avoids the SVG-rasterise-in-browser silent failure. The DOM
 * preview inside the settings modal draws its own visual approximation
 * of the barcode; it doesn't call this function.
 */
export async function renderBarcodeSvg(value: string, format: NonNullable<LabelLayout['barcode']>['format'], widthMm: number, heightMm: number, displayValue: boolean, fontSizePt: number): Promise<SVGSVGElement> {
  const { default: JsBarcode } = await import('jsbarcode');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  // JsBarcode's `width` is the module width in px. We size the SVG at
  // native px via CSS-mm (1mm ≈ 3.7795 CSS px) and then downstream the
  // PDF/preview scales it to real mm. This is the FIRST place any px
  // enters the pipeline — everything before/after is mm.
  const totalPx = widthMm * 3.7795;
  const estimatedModules = (() => {
    switch (format) {
      case 'EAN13': case 'UPC': return 95;
      case 'EAN8': return 67;
      case 'CODE39': return Math.max(30, 13 * value.length + 16);
      default: return Math.max(30, 11 * value.length + 35);
    }
  })();
  try {
    JsBarcode(svg, value, {
      format,
      width: Math.max(1, totalPx / estimatedModules),
      height: Math.max(20, heightMm * 3.7795),
      displayValue,
      fontSize: fontSizePt * (96 / 72), // pt→px at 96 DPI
      fontOptions: 'bold',
      margin: 0,
      background: '#ffffff',
      lineColor: '#000000',
    });
  } catch {
    /* unrenderable — svg stays empty; downstream skips it */
  }
  return svg;
}

// ─── PDF renderer ──────────────────────────────────────────────────────────

/**
 * Generate a PDF whose page IS exactly the label size — not A4, not
 * Letter. Uses jsPDF v4's [width, height] custom format so the file's
 * declared page dimensions equal the profile's labelWidthMm ×
 * labelHeightMm. Chrome/Adobe/any PDF viewer opens it at that exact size
 * with no auto-rotation.
 *
 * Multiple labels (bulk print) become multiple pages of the SAME size.
 * Roll paper (thermal58/thermal80) uses the content height per page.
 *
 * Returns a Blob URL (opens in a new tab), so the shopkeeper can inspect
 * the PDF and print/save from Adobe or Chrome's PDF viewer — those
 * viewers RESPECT the PDF's declared page size when printing, which is
 * exactly what we need.
 */
export async function generateLabelPdf(rows: LabelRow[], profile: PrinterProfile, opts: { labelText?: string; labelLine1?: string; labelLine2?: string; title?: string } = {}): Promise<string> {
  // A4 label-sheet / plain-A4 profiles tile many labels on one page — a
  // completely different page geometry. Route to the grid renderer, which
  // reuses the very same per-label drawing code (drawLabel below) so a cell
  // on a sheet is pixel-identical to a standalone sticker.
  if (profile.printType === 'a4-sheet' || profile.printType === 'a4-plain') {
    return generateA4SheetPdf(rows, profile, opts);
  }

  const { default: JsPDF } = await import('jspdf');

  // Explode `copies` into individual page-per-copy — one printed sticker
  // per unit, symmetric with the HTML engine.
  const exploded: LabelRow[] = [];
  for (const row of rows) {
    const copies = Math.max(1, Math.floor(row.copies ?? 1));
    for (let i = 0; i < copies; i++) exploded.push(row);
  }
  if (!exploded.length) return '';

  const rotation = profile.rotation ?? 0;
  const rotated = rotation === 90 || rotation === 270;

  // First page — compute layout to derive its exact mm height (roll paper
  // varies per label; fixed labels are always profile.labelHeightMm). When
  // the label is rotated 90/270 the PAGE dims swap (a 60×30 label rotated
  // sideways needs a 30×60 page) so the sticker still fits its physical media.
  const firstLayout = computeLabelLayout(profile, exploded[0], opts);
  const firstPageDims: [number, number] = rotated
    ? [firstLayout.heightMm, firstLayout.widthMm]
    : [firstLayout.widthMm, firstLayout.heightMm];

  const doc = new JsPDF({
    orientation: firstPageDims[0] >= firstPageDims[1] ? 'landscape' : 'portrait',
    unit: 'mm',
    format: firstPageDims,
    compress: true,
    hotfixes: ['px_scaling'],
  });

  for (let i = 0; i < exploded.length; i++) {
    const row = exploded[i];
    const layout = computeLabelLayout(profile, row, opts);
    if (i > 0) {
      const dims: [number, number] = rotated ? [layout.heightMm, layout.widthMm] : [layout.widthMm, layout.heightMm];
      doc.addPage(dims, dims[0] >= dims[1] ? 'landscape' : 'portrait');
    }
    // Draw the label at page origin. Calibration offset (offsetXMm/offsetYMm)
    // is a per-print head-alignment nudge applied here, at the page level.
    await drawLabel(doc, profile, layout, row, profile.offsetXMm || 0, profile.offsetYMm || 0);
  }

  // Open the PDF blob in a new tab so the shopkeeper can inspect the
  // real page dimensions and print/save from there.
  const blobUrl = doc.output('bloburl') as unknown as string;
  return blobUrl;
}

/**
 * A4 (or A4-landscape) multi-label sheet renderer. Tiles `columns × rows`
 * labels per page at physical mm positions (computeSheetGeometry), paging
 * automatically when a sheet fills. Each cell is drawn by the SAME drawLabel
 * routine as a standalone sticker — the only difference is a per-cell mm
 * origin and, for 'a4-plain', a hairline cut border so the shopkeeper can
 * scissor the labels apart.
 *
 * This is the fix for the client's core complaint ("on A4 the barcode
 * becomes unnecessarily long"): a barcode is sized to its CELL (e.g. 63×33
 * mm), never stretched across the whole 210 mm page.
 */
export async function generateA4SheetPdf(rows: LabelRow[], profile: PrinterProfile, opts: { labelText?: string; labelLine1?: string; labelLine2?: string; title?: string } = {}): Promise<string> {
  const { default: JsPDF } = await import('jspdf');
  const sheet = profile.sheet ?? { ...DEFAULT_SHEET };
  const { page, cells } = computeSheetGeometry(sheet);
  if (!cells.length) return '';

  // Explode copies into a flat list — one printed label per copy.
  const exploded: LabelRow[] = [];
  for (const row of rows) {
    const copies = Math.max(1, Math.floor(row.copies ?? 1));
    for (let i = 0; i < copies; i++) exploded.push(row);
  }
  if (!exploded.length) return '';

  const doc = new JsPDF({
    orientation: page.widthMm >= page.heightMm ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [page.widthMm, page.heightMm],
    compress: true,
    hotfixes: ['px_scaling'],
  });

  // A per-cell profile: the label engine thinks each cell IS the whole label
  // (labelWidthMm/HeightMm = the cell size, fixed height, no rotation, no
  // page-level offset). Everything else — fields, fonts, quiet zone, barcode
  // type, autofit — carries over unchanged, so the cell renders identically
  // to that same product printed as a single sticker of the cell size.
  const cellProfile: PrinterProfile = {
    ...profile,
    printType: 'thermal-sticker',
    rotation: 0,
    labelWidthMm: sheet.labelWidthMm,
    labelHeightMm: sheet.labelHeightMm,
    offsetXMm: 0,
    offsetYMm: 0,
  };

  for (let i = 0; i < exploded.length; i++) {
    const cellIndex = i % cells.length;
    if (i > 0 && cellIndex === 0) {
      doc.addPage([page.widthMm, page.heightMm], page.widthMm >= page.heightMm ? 'landscape' : 'portrait');
    }
    const cell = cells[cellIndex];
    const layout = computeLabelLayout(cellProfile, exploded[i], opts);
    // 'a4-plain' draws a light cut-guide border around every cell; 'a4-sheet'
    // (pre-die-cut Avery stock) leaves it clean since the sheet is already
    // perforated.
    if (profile.printType === 'a4-plain') {
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.2);
      doc.rect(cell.x, cell.y, sheet.labelWidthMm, sheet.labelHeightMm);
    }
    await drawLabel(doc, cellProfile, layout, exploded[i], cell.x, cell.y);
  }

  return doc.output('bloburl') as unknown as string;
}

/**
 * Draw ONE label's barcode + text into `doc`, offset to (ox,oy) in mm, with
 * the profile's calibration scale + rotation applied. Shared by the single-
 * sticker renderer and the A4 grid renderer so their output can never drift
 * apart. All coordinates from `layout` are label-local (0,0 = label top-left)
 * and get translated by (ox,oy) here.
 */
async function drawLabel(doc: any, profile: PrinterProfile, layout: LabelLayout, row: LabelRow, ox: number, oy: number): Promise<void> {
  // Per-axis calibration % (clamped) + rotation, expressed as ONE jsPDF
  // transformation matrix so vector text and the barcode image rotate/scale
  // together. Only touches content — never the declared page size.
  const scaleH = Math.max(0.9, Math.min(1.1, profile.scaleH / 100));
  const scaleV = Math.max(0.9, Math.min(1.1, profile.scaleV / 100));
  const rotation = profile.rotation ?? 0;
  const anyDoc = doc as any;
  const canTransform = typeof anyDoc.setCurrentTransformationMatrix === 'function';
  const needsTransform = canTransform && (scaleH !== 1 || scaleV !== 1 || rotation !== 0);

  if (needsTransform) {
    doc.saveGraphicsState();
    // Rotation maps label-local (x,y) into page space; see printProfiles
    // rotation notes. Page dims for 90/270 were swapped by the caller.
    const w = layout.widthMm, h = layout.heightMm;
    let m: [number, number, number, number, number, number];
    if (rotation === 90)       m = [0, scaleV, -scaleH, 0, h, 0];
    else if (rotation === 180) m = [-scaleH, 0, 0, -scaleV, w, h];
    else if (rotation === 270) m = [0, -scaleV, scaleH, 0, 0, w];
    else                        m = [scaleH, 0, 0, scaleV, 0, 0];
    // Fold the (ox,oy) page translation into the matrix so callers work in
    // label-local coords regardless of rotation.
    m = [m[0], m[1], m[2], m[3], m[4] + ox, m[5] + oy];
    anyDoc.setCurrentTransformationMatrix(m);
    ox = 0; oy = 0; // already folded into the matrix
  }

  // Barcode image — render DIRECTLY to an off-screen canvas (JsBarcode's
  // recommended PDF path; avoids the SVG-rasterise silent-fail in Chrome).
  if (layout.barcode && row.barcode) {
    try {
      const dpi = profile.dpi > 0 ? profile.dpi : 300;
      const pngPxW = Math.max(60, Math.round(mmToPx(layout.barcode.width, dpi)));
      const pngPxH = Math.max(30, Math.round(mmToPx(layout.barcode.height, dpi)));
      const dataUrl = await renderBarcodePngDataUrl(row.barcode, layout.barcode.format, pngPxW, pngPxH, layout.barcode.displayValue, profile.fontSizePt);
      doc.addImage(dataUrl, 'PNG', ox + layout.barcode.x, oy + layout.barcode.y, layout.barcode.width, layout.barcode.height, undefined, 'FAST');
    } catch { /* skip un-renderable rows rather than aborting the batch */ }
  }

  // Text lines — mm coordinates, mm-based font sizing.
  for (const line of layout.lines) {
    const [r, g, b] = hexToRgb(line.color);
    doc.setTextColor(r, g, b);
    doc.setFontSize(line.fontSizePt);
    doc.setFont('helvetica', line.fontWeight === 'bold' ? 'bold' : line.fontWeight === 'medium' ? 'bold' : 'normal');
    const baselineY = oy + line.y + ptToMm(line.fontSizePt) * 0.85;
    const anchor: 'left' | 'center' | 'right' = line.align;
    const x = ox + (anchor === 'left' ? profile.margins.left
            : anchor === 'right' ? layout.widthMm - profile.margins.right
            : layout.widthMm / 2);
    doc.text(line.text, x, baselineY, { align: anchor, maxWidth: layout.widthMm - profile.margins.left - profile.margins.right });

    // MRP prints with a strikethrough when the shopkeeper has it turned on
    // (profile.mrpStrikethrough, default true) — jsPDF has no built-in
    // strikethrough option, so draw the line manually through the text's
    // own measured width.
    if (line.strikethrough) {
      const textWidth = doc.getTextWidth(line.text);
      const strikeY = baselineY - ptToMm(line.fontSizePt) * 0.30;
      const [x1, x2] = anchor === 'left' ? [x, x + textWidth]
        : anchor === 'right' ? [x - textWidth, x]
        : [x - textWidth / 2, x + textWidth / 2];
      doc.setDrawColor(r, g, b);
      doc.setLineWidth(Math.max(0.1, ptToMm(line.fontSizePt) * 0.06));
      doc.line(x1, strikeY, x2, strikeY);
    }
  }

  if (needsTransform) doc.restoreGraphicsState();
}

// ─── Small helpers ─────────────────────────────────────────────────────────

/** Draw an SVG element into a canvas at the requested px dimensions,
 *  return a PNG data URL. Both preview and PDF paths need this to feed
 *  the JsBarcode output into their respective rasterisers. */
async function svgToPngDataUrl(svg: SVGSVGElement, widthPx: number, heightPx: number): Promise<string> {
  return new Promise((resolve, reject) => {
    // Normalise the SVG's own sizing before serialisation — without an
    // explicit width/height on the root, some browsers rasterise to a
    // tiny default (300×150) and jsPDF blows the image up to fit the
    // requested mm space, losing sharpness.
    svg.setAttribute('width', String(widthPx));
    svg.setAttribute('height', String(heightPx));
    const svgStr = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = widthPx;
      canvas.height = heightPx;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('canvas 2d unavailable')); return; }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, widthPx, heightPx);
      ctx.drawImage(img, 0, 0, widthPx, heightPx);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('svg rasterise failed')); };
    img.src = url;
  });
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = h.length === 3
    ? h.split('').map(c => parseInt(c + c, 16))
    : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  return [n[0] || 0, n[1] || 0, n[2] || 0];
}
