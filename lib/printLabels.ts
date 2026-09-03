import { detectBarcodeFormat } from '@/lib/barcode';
import type { PrinterProfile } from '@/lib/printProfiles';
import { autoFitBarcode, formatPriceNumber } from '@/lib/printProfiles';
import { autoDetectFormat } from '@/lib/barcodeValidation';
import { generateLabelPdf } from '@/lib/labelRenderer';

// Shared by BarcodeQRModal.tsx (one product's variant rows) and the Import
// wizard (an arbitrary list of just-imported products) — extracted so the
// print HTML/CSS and thermal-vs-A4 handling only exists in one place.
//
// Extended (2026-08) with `profile: PrinterProfile` for physical-size-
// accurate printing. Callers that don't pass a profile continue to work —
// the legacy labelSize/labelText/labelLine1/labelLine2 path is intact.

export interface PrintableLabel {
  name: string;
  /** Variant key (e.g. "Blue / M") — omitted for a plain, non-variant product. */
  variantKey?: string;
  barcode: string;
  sellingPrice?: number;
  mrp?: number;
  /** How many physical copies of this exact label to print — one sticker per
   *  copy, so a shopkeeper can print one per unit in stock. Defaults to 1. */
  copies?: number;
  /** Product's own SKU/stock-code — only printed when profile.fields.sku is
   *  on AND the product actually has one set. */
  sku?: string;
  /** Free-text "Other Code" the shopkeeper writes once against the product —
   *  only printed when profile.fields.otherCode is on AND the product
   *  actually has one set. */
  otherCode?: string;
}

export interface PrintLabelSheetOptions {
  /** Optional extra line printed on every label (promo note, batch tag, etc.). */
  labelText?: string;
  /** Optional two-line header printed above the product name — shop name,
   *  address, tagline, whatever the shopkeeper wants leading every sticker. */
  labelLine1?: string;
  labelLine2?: string;
  /** 'thermal58'/'thermal80' match the physical roll width in mm — matters
   *  because declaring the wrong width makes the print bridge scale the
   *  whole page to fit the real roll, which drags each label's fixed-height
   *  page along with it and makes labels bleed into each other. Ignored
   *  when `profile` is given (the profile carries authoritative sizes). */
  labelSize?: 'a4' | 'thermal' | 'thermal58' | 'thermal80';
  /** Full printer profile — mm-first physical sizing, DPI awareness,
   *  calibration, field flags, symbology choice. When present, every
   *  dimension in the printed sheet comes from this instead of the legacy
   *  labelSize preset. See lib/printProfiles.ts. */
  profile?: PrinterProfile;
  /** Print-window / document title. */
  title?: string;
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}

/** Print a label per row, repeated `copies` times each — either a multi-column
 *  A4 sheet (scissors-and-glue, or a thermal printer that likes per-page cuts)
 *  or, when labelSize is 'thermal', one label per physical page sized for an
 *  actual small-roll label printer (the roll advances a "page" per print).
 *  Each label carries its barcode rendered by JsBarcode as inline SVG (so the
 *  print dialog sees vectors, not screenshots). */
export async function printLabelSheet(rows: PrintableLabel[], options: PrintLabelSheetOptions = {}): Promise<void> {
  if (!rows.length) return;
  // Profile-driven print — physical mm-based sizing, calibration-aware,
  // symbology-validated. Falls through to the legacy path only when no
  // profile is passed (existing Import wizard, older callers).
  if (options.profile) {
    return printLabelSheetWithProfile(rows, options.profile, options);
  }
  const { default: JsBarcode } = await import('jsbarcode');
  const isThermal = options.labelSize === 'thermal' || options.labelSize === 'thermal58' || options.labelSize === 'thermal80';
  // 'thermal' (no width suffix) is a legacy value from before the 58/80mm
  // split — treat it as 58mm, the narrower/more common roll, rather than
  // guessing wrong in the other direction.
  const thermalWidthMm = options.labelSize === 'thermal80' ? 80 : 58;
  const noteLine = options.labelText?.trim() ? `<div class="lbl-note">${escapeHtml(options.labelText.trim())}</div>` : '';
  const line1 = options.labelLine1?.trim();
  const line2 = options.labelLine2?.trim();
  const headerBlock = (line1 || line2)
    ? `<div class="lbl-header">
        ${line1 ? `<div class="lbl-header1">${escapeHtml(line1)}</div>` : ''}
        ${line2 ? `<div class="lbl-header2">${escapeHtml(line2)}</div>` : ''}
      </div>`
    : '';
  const title = options.title || 'Labels';

  // Render each distinct barcode's SVG once, then repeat the whole label
  // markup `copies` times — one physical sticker per copy, not one label
  // annotated "×N".
  const labels = rows.flatMap(row => {
    const copies = Math.max(1, Math.floor(row.copies ?? 1));
    const svgTmp = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    try {
      JsBarcode(svgTmp, row.barcode, {
        format: detectBarcodeFormat(row.barcode),
        width: isThermal ? (thermalWidthMm === 80 ? 2.6 : 2.2) : 2,
        height: isThermal ? (thermalWidthMm === 80 ? 50 : 40) : 50,
        displayValue: true, fontSize: 10, fontOptions: 'bold', margin: 8, background: '#ffffff', lineColor: '#0f172a',
      });
    } catch { /* skip unrenderable code */ }
    const svgStr = new XMLSerializer().serializeToString(svgTmp);
    const sellingPrice = row.sellingPrice || 0;
    const mrp = row.mrp || 0;
    const price = sellingPrice > 0 ? `₹${sellingPrice.toLocaleString('en-IN')}` : (mrp > 0 ? `MRP ₹${mrp.toLocaleString('en-IN')}` : '');
    const label = `
      <div class="lbl">
        ${headerBlock}
        <div class="lbl-name">${escapeHtml(row.name)}</div>
        ${row.variantKey ? `<div class="lbl-variant">${escapeHtml(row.variantKey)}</div>` : ''}
        <div class="lbl-barcode">${svgStr}</div>
        ${noteLine}
        <div class="lbl-foot">
          <span>${price}</span>
        </div>
      </div>`;
    return Array(copies).fill(label);
  }).join('');

  // A wider 80mm label can carry noticeably bigger type than a 58mm one
  // without it looking sparse — scale text up rather than reusing 58mm
  // sizes stretched across the extra width.
  const fs = isThermal && thermalWidthMm === 80
    ? { header1: 11, header2: 8, name: 12, variant: 10, note: 9, foot: 12 }
    : { header1: 9, header2: 7, name: 10, variant: 9, note: 8, foot: 10 };

  const html = `<!doctype html><html><head><title>${escapeHtml(title)}</title>
    <style>
      /* 'auto' height (not a fixed mm value) is the actual fix for the
         overlap bug: a fixed height (previously 25mm for every label,
         regardless of content) truncated/compressed labels that had a
         header, note, or long name, causing the next label's content to
         bleed into the same physical area once the print bridge scaled the
         page to match the real 58mm/80mm roll width. Letting each label's
         page be exactly as tall as its own content removes that mismatch. */
      @page { size: ${isThermal ? `${thermalWidthMm}mm auto` : 'A4'}; margin: ${isThermal ? '1.5mm' : '8mm'}; }
      * { box-sizing: border-box; }
      body { font-family: Helvetica, Arial, sans-serif; margin: 0; color: #0f172a; }
      .sheet { display: ${isThermal ? 'block' : 'grid'}; grid-template-columns: repeat(2, 1fr); gap: 4mm; padding: ${isThermal ? '0' : '2mm'}; }
      .lbl {
        border: ${isThermal ? 'none' : '0.4mm dashed #94a3b8'};
        border-radius: ${isThermal ? '0' : '2mm'};
        padding: ${isThermal ? '1.5mm' : '3mm 3mm 2.5mm'};
        break-inside: avoid;
        ${isThermal ? 'page-break-after: always; break-after: page;' : ''}
        text-align: center;
        background: #fff;
      }
      .lbl-header  { margin-bottom: 1mm; padding-bottom: 1mm; border-bottom: 0.3mm solid #cbd5e1; }
      .lbl-header1 { font-size: ${fs.header1}px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; line-height: 1.2; }
      .lbl-header2 { font-size: ${fs.header2}px; font-weight: 600; color: #475569; line-height: 1.2; margin-top: 0.3mm; }
      .lbl-name    { font-size: ${fs.name}px; font-weight: 800; line-height: 1.15; margin-bottom: 1mm;
                      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .lbl-variant { font-size: ${fs.variant}px; font-weight: 700; color: #6366f1; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 1mm; }
      .lbl-barcode svg { max-width: 100%; height: auto; }
      .lbl-note    { font-size: ${fs.note}px; font-weight: 600; color: #334155; margin-bottom: 0.5mm; }
      .lbl-foot    { display: flex; justify-content: center; align-items: center; font-size: ${fs.foot}px; font-weight: 700; margin-top: 0.5mm; }
      @media print {
        html, body { background: #fff; }
        .lbl { border-color: #cbd5e1; }
      }
    </style></head><body>
    <div class="sheet">${labels}</div>
  </body></html>`;

  const win = window.open('', '_blank', 'width=900,height=1100');
  if (!win) return;
  win.document.open(); win.document.write(html); win.document.close();
  const trigger = () => { try { win.focus(); win.print(); } catch {} };
  if (win.document.readyState === 'complete') setTimeout(trigger, 200);
  else win.addEventListener('load', () => setTimeout(trigger, 200));
}

// ─── Profile-driven engine (physical mm sizing, calibration-aware) ─────────

/**
 * Print labels using an authoritative PrinterProfile. Every dimension is
 * declared in mm and lands on paper at that exact size (subject only to
 * the shopkeeper's own driver settings — Fit-to-Page, Shrink-to-Fit etc.
 * still have to be turned OFF at the OS level, which the preview screen
 * warns about; a web page cannot control the OS printer driver).
 *
 * Text alignment / position, field flags, quiet zones and per-axis
 * calibration all come from the profile. When profile.autoFit is on the
 * barcode dimensions are recomputed from the label size + reserved text
 * lines instead of being taken literally.
 */
export async function printLabelSheetWithProfile(
  rows: PrintableLabel[],
  profile: PrinterProfile,
  options: PrintLabelSheetOptions = {},
): Promise<void> {
  if (!rows.length) return;
  // Direct jsPDF path — the PDF is created at exactly the profile's
  // labelWidthMm × labelHeightMm, so Chrome's virtual "Print to PDF"
  // printer no longer wraps a 60×30 label inside A4. See
  // lib/labelRenderer.ts for the layout engine that both this path and
  // the settings-modal live preview share.
  try {
    const url = await generateLabelPdf(
      // sku/otherCode were missing here — the live preview (which reads the
      // same LabelRow shape via computeLabelLayout) showed them correctly,
      // giving every appearance the feature worked, but the ACTUAL printed
      // PDF — this jsPDF path is what real "Print" uses whenever any
      // profile is active, i.e. almost always — silently dropped both
      // fields before they ever reached the layout engine.
      rows.map(r => ({ name: r.name, variantKey: r.variantKey, barcode: r.barcode, sellingPrice: r.sellingPrice, mrp: r.mrp, copies: r.copies, sku: r.sku, otherCode: r.otherCode })),
      profile,
      { labelText: options.labelText, labelLine1: options.labelLine1, labelLine2: options.labelLine2, title: options.title },
    );
    if (url) {
      const win = window.open(url, '_blank');
      // Fallback for popup-blocked contexts: force a direct-navigate.
      if (!win) window.location.href = url;
    }
    return;
  } catch (err) {
    console.error('PDF generation failed, falling back to HTML print', err);
    // Fall through to the legacy HTML+window.print() path so the
    // shopkeeper isn't stranded if something goes sideways with jsPDF.
  }

  const { default: JsBarcode } = await import('jsbarcode');

  const isRollPaper = profile.labelHeightMm <= 0;

  const noteLine = options.labelText?.trim() ? `<div class="lbl-note">${escapeHtml(options.labelText.trim())}</div>` : '';
  const line1 = options.labelLine1?.trim();
  const line2 = options.labelLine2?.trim();
  const showHeader = profile.fields.shopName && (line1 || line2);
  const headerBlock = showHeader
    ? `<div class="lbl-header">
        ${line1 ? `<div class="lbl-header1">${escapeHtml(line1)}</div>` : ''}
        ${line2 ? `<div class="lbl-header2">${escapeHtml(line2)}</div>` : ''}
      </div>`
    : '';
  const title = options.title || 'Labels';

  const labels = rows.flatMap(row => {
    const copies = Math.max(1, Math.floor(row.copies ?? 1));

    // Choose symbology: profile.barcodeType overrides auto-detect when the
    // shopkeeper explicitly picked one.
    const format = profile.barcodeType === 'auto'
      ? autoDetectFormat(row.barcode)
      : (profile.barcodeType === 'CODE39' ? 'CODE39' : profile.barcodeType);

    // Sized from THIS row's own barcode value — a short code renders
    // narrower, a long one wider, instead of every row being stretched or
    // squeezed to one shared width (see autoFitBarcode's doc comment).
    const barSize = profile.autoFit
      ? autoFitBarcode(profile, row.barcode)
      : { widthMm: profile.barcodeWidthMm, heightMm: profile.barcodeHeightMm };

    const svgTmp = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    try {
      JsBarcode(svgTmp, row.barcode, {
        format,
        // JsBarcode's `width` is the module (thinnest bar) width in pixels;
        // scale so the whole barcode ends up roughly `barSize.widthMm` wide.
        // 3.78 = px per mm at 96 DPI (CSS default) — the preview / thermal
        // print bridge translates px → mm at declared page size.
        width: Math.max(1, (barSize.widthMm * 3.78) / estimateCharsFor(format, row.barcode)),
        height: Math.max(20, barSize.heightMm * 3.78),
        displayValue: profile.fields.barcodeNumber,
        fontSize: Math.max(6, profile.fontSizePt),
        fontOptions: profile.fontWeight === 'bold' ? 'bold' : '',
        margin: 0,
        background: '#ffffff',
        lineColor: '#0f172a',
      });
    } catch { /* skip unrenderable code */ }
    const svgStr = new XMLSerializer().serializeToString(svgTmp);

    // Assemble text lines per the field flags.
    const sellingPrice = row.sellingPrice || 0;
    const mrp = row.mrp || 0;
    // MRP and Selling can both show (two lines). Selling uses the profile's
    // editable caption (e.g. "Offer"). Currency prefix is opt-in (default
    // empty — the old hard-coded "₹"/"INR" was reported as cluttering the
    // label at small sizes).
    const currency = (profile.currencyPrefix ?? '').trim();
    const money = (n: number) => {
      const formatted = formatPriceNumber(n, profile.priceNumberFormat);
      return currency ? `${currency} ${formatted}` : formatted;
    };
    const sellCaption = (profile.sellingPriceLabel ?? 'Rate').trim();
    // Suffix (e.g. "/-") appended exactly as saved — no auto-inserted space,
    // matching lib/labelRenderer.ts's preview/PDF engine so print and
    // preview never disagree.
    const sellSuffix = profile.sellingPriceSuffix ?? '';
    const mrpLine = profile.fields.mrp && mrp > 0 ? `MRP ${money(mrp)}` : '';
    const sellLine = profile.fields.sellingPrice && sellingPrice > 0
      ? `${sellCaption ? sellCaption + ' ' : ''}${money(sellingPrice)}${sellSuffix}` : '';
    const variantLine = ((profile.fields.variant || profile.fields.size || profile.fields.colour) && row.variantKey) ? row.variantKey : '';
    const skuLine = profile.fields.sku && row.sku?.trim() ? `SKU: ${row.sku.trim()}` : '';
    const otherCodeLine = profile.fields.otherCode && row.otherCode?.trim() ? row.otherCode.trim() : '';

    const nameFontPt = Math.max(6, profile.productNameFontSizePt ?? profile.fontSizePt);
    const variantFontPt = Math.max(6, profile.variantFontSizePt ?? (profile.fontSizePt - 1));
    const mrpFontPt = Math.max(6, profile.mrpFontSizePt ?? (profile.fontSizePt - 1));
    const skuFontPt = Math.max(6, profile.skuFontSizePt ?? (profile.fontSizePt - 1));
    const otherCodeFontPt = Math.max(6, profile.otherCodeFontSizePt ?? (profile.fontSizePt - 1));
    const nameBlock = profile.fields.productName ? `<div class="lbl-name" style="font-size:${nameFontPt}pt">${escapeHtml(row.name)}</div>` : '';
    const variantBlock = variantLine ? `<div class="lbl-variant" style="font-size:${variantFontPt}pt">${escapeHtml(variantLine)}</div>` : '';
    const skuBlock = skuLine ? `<div class="lbl-sku" style="font-size:${skuFontPt}pt">${escapeHtml(skuLine)}</div>` : '';
    const otherCodeBlock = otherCodeLine ? `<div class="lbl-other-code" style="font-size:${otherCodeFontPt}pt">${escapeHtml(otherCodeLine)}</div>` : '';
    const priceBlock = `${mrpLine ? `<div class="lbl-mrp" style="font-size:${mrpFontPt}pt">${escapeHtml(mrpLine)}</div>` : ''}${sellLine ? `<div class="lbl-foot">${escapeHtml(sellLine)}</div>` : ''}`;

    // Text position (above / below barcode) drives the two possible orders.
    const above = profile.textPosition === 'above';
    const label = `
      <div class="lbl">
        ${headerBlock}
        ${above ? `${nameBlock}${variantBlock}${skuBlock}${otherCodeBlock}` : ''}
        <div class="lbl-barcode" style="width:${barSize.widthMm}mm;height:${barSize.heightMm}mm;margin:0 auto;box-sizing:content-box">${svgStr}</div>
        ${!above ? `${nameBlock}${variantBlock}${skuBlock}${otherCodeBlock}` : ''}
        ${noteLine}
        ${priceBlock}
      </div>`;
    return Array(copies).fill(label);
  }).join('');

  // Calibration: per-axis scale correction (100% = untouched). Applied via
  // a CSS transform on the label root, NOT via changing the @page size, so
  // the printer's declared page size stays correct while the CONTENT
  // shrinks/grows to compensate for a driver that consistently over- or
  // under-prints. Zebra/TSC drivers rarely need >±3%.
  const scaleH = Math.max(0.9, Math.min(1.1, profile.scaleH / 100));
  const scaleV = Math.max(0.9, Math.min(1.1, profile.scaleV / 100));
  const scaleCss = (scaleH !== 1 || scaleV !== 1)
    ? `transform: scale(${scaleH}, ${scaleV}); transform-origin: top left;`
    : '';

  // Alignment maps.
  const alignCss = profile.textAlign === 'left' ? 'left' : profile.textAlign === 'right' ? 'right' : 'center';
  const justifyCss = profile.positionH === 'left' ? 'flex-start' : profile.positionH === 'right' ? 'flex-end' : 'center';
  const alignVCss = profile.positionV === 'top' ? 'flex-start' : profile.positionV === 'bottom' ? 'flex-end' : 'center';
  const fontWeightCss = profile.fontWeight === 'bold' ? 800 : profile.fontWeight === 'medium' ? 600 : 400;

  // Page dimensions: exact mm from the profile. Roll paper uses `auto`
  // height so the thermal printer advances the roll per label instead of
  // forcing a fixed height that could crush content.
  const pageSize = isRollPaper
    ? `${profile.labelWidthMm}mm auto`
    : `${profile.labelWidthMm}mm ${profile.labelHeightMm}mm`;

  const html = `<!doctype html><html><head><title>${escapeHtml(title)}</title>
    <style>
      /* Physical dimensions declared in mm — the print bridge honours them
         as long as the OS printer driver is set to "Actual Size" / 100%
         scale. The preview screen tells the shopkeeper to check that. */
      @page { size: ${pageSize}; margin: 0; }
      * { box-sizing: border-box; }
      /* Force html/body to the exact page dimensions so Chrome does NOT
         auto-rotate a "landscape" label (like 60×30 mm) to fit a portrait
         PDF fallback paper — the client's test print came out sideways
         because A4/Letter is the default virtual printer size and Chrome
         helpfully rotated to fit. Locking body to labelWidthMm defeats
         that auto-rotate: the label stays horizontal even if the physical
         paper is bigger, printing at its true mm size in the top-left
         corner. */
      html, body {
        width: ${profile.labelWidthMm}mm;
        ${isRollPaper ? '' : `height: ${profile.labelHeightMm}mm;`}
        margin: 0; padding: 0; background: #fff;
        /* Locks text baseline direction — belt-and-suspenders against
           writing-mode swaps some print bridges try. */
        writing-mode: horizontal-tb;
      }
      body { font-family: Helvetica, Arial, sans-serif; color: #0f172a; }
      .lbl {
        width: ${profile.labelWidthMm}mm;
        ${isRollPaper ? '' : `height: ${profile.labelHeightMm}mm;`}
        padding-top: ${profile.margins.top}mm;
        padding-right: ${profile.margins.right}mm;
        padding-bottom: ${profile.margins.bottom}mm;
        padding-left: ${profile.margins.left}mm;
        display: flex; flex-direction: column;
        align-items: ${justifyCss};
        justify-content: ${alignVCss};
        text-align: ${alignCss};
        gap: ${profile.spacingMm}mm;
        background: #fff;
        overflow: hidden; /* stop hair-line overflow from spawning a phantom page */
        ${scaleCss}
      }
      /* Page break BEFORE every label except the first — using page-break-
         after on all of them was leaving a blank last page in Chrome's
         preview (client complaint: "2 sheets of paper" for a single label).
         :first-of-type keeps the first label on page 1 with no leading
         break. */
      .lbl + .lbl { page-break-before: always; break-before: page; }
      .lbl-header { padding-bottom: 0.5mm; border-bottom: 0.2mm solid #cbd5e1; width: 100%; }
      .lbl-header1 { font-size: ${Math.max(6, profile.headerFontSizePt ?? (profile.fontSizePt + 1))}pt; font-weight: 800; text-transform: uppercase; }
      .lbl-header2 { font-size: ${Math.max(6, profile.fontSizePt - 1)}pt; font-weight: 600; color: #475569; }
      .lbl-name    { font-size: ${profile.fontSizePt}pt; font-weight: ${fontWeightCss}; line-height: 1.15; word-break: break-word; }
      .lbl-variant { font-size: ${Math.max(6, profile.fontSizePt - 1)}pt; font-weight: 700; color: #4338ca; text-transform: uppercase; }
      .lbl-sku     { font-size: ${Math.max(6, profile.skuFontSizePt ?? (profile.fontSizePt - 1))}pt; font-weight: 500; color: #64748b; }
      .lbl-other-code { font-size: ${Math.max(6, profile.otherCodeFontSizePt ?? (profile.fontSizePt - 1))}pt; font-weight: 500; color: #64748b; }
      /* Each barcode's own wrapper div carries its width/height inline
         (sized from that row's own barcode value — see autoFitBarcode) so
         the SVG just fills whatever box its row assigned it, instead of
         every row sharing one hard-coded size here. */
      .lbl-barcode svg {
        width: 100%;
        height: 100%;
        display: block;
      }
      /* Quiet zone (the required silent margin around a barcode for it to
         scan) is enforced by wrapping the SVG in a white padded box. */
      .lbl-barcode {
        padding: ${profile.quietZoneMm}mm;
        background: #fff;
      }
      .lbl-note { font-size: ${Math.max(6, profile.customTextFontSizePt ?? profile.fontSizePt)}pt; font-weight: ${profile.customTextBold ? 800 : 400}; color: #334155; text-align: ${profile.customTextAlign ?? 'center'}; }
      .lbl-mrp  { font-size: ${Math.max(6, profile.fontSizePt - 1)}pt; font-weight: 600; color: #475569; text-decoration: ${(profile.mrpStrikethrough ?? true) ? 'line-through' : 'none'}; }
      .lbl-foot { font-size: ${Math.max(6, profile.priceFontSizePt ?? (profile.fontSizePt + 2))}pt; font-weight: 800; }
      @media print { html, body { background: #fff; } }
    </style></head><body>
    ${labels}
  </body></html>`;

  const win = window.open('', '_blank', 'width=900,height=1100');
  if (!win) return;
  win.document.open(); win.document.write(html); win.document.close();
  const trigger = () => { try { win.focus(); win.print(); } catch {} };
  if (win.document.readyState === 'complete') setTimeout(trigger, 200);
  else win.addEventListener('load', () => setTimeout(trigger, 200));
}

/** Estimate character count for JsBarcode's `width` scaling — different
 *  symbologies encode different bar counts per digit/char, so a naive
 *  string-length divide would over-scale EAN (fixed) and under-scale
 *  CODE128 (variable). Numbers below are close-enough approximations
 *  that get the printed width to the target mm within a few percent. */
function estimateCharsFor(format: string, value: string): number {
  const v = String(value || '');
  switch (format) {
    case 'EAN13': return 95;
    case 'EAN8':  return 67;
    case 'UPC':   return 95;
    case 'CODE39': return Math.max(30, 13 * v.length + 16);
    case 'CODE128':
    default: return Math.max(30, 11 * v.length + 35);
  }
}

/**
 * Print a single mm-ruler calibration page. Used by the Calibration
 * section of the Settings modal so a shopkeeper can physically measure
 * with a ruler and set scaleH/scaleV to the right value if the printer is
 * consistently off. The page is a fixed 100 × 100 mm — measure the printed
 * markers, compare to expected mm, adjust in the Settings modal.
 */
export function printCalibrationSheet(profile: PrinterProfile): void {
  const scaleH = Math.max(0.9, Math.min(1.1, profile.scaleH / 100));
  const scaleV = Math.max(0.9, Math.min(1.1, profile.scaleV / 100));
  const scaleCss = (scaleH !== 1 || scaleV !== 1)
    ? `transform: scale(${scaleH}, ${scaleV}); transform-origin: top left;`
    : '';
  const html = `<!doctype html><html><head><title>Print Calibration</title>
    <style>
      @page { size: 105mm 105mm; margin: 0; }
      /* Same anti-rotate lock as the label engine — see comment in
         printLabelSheetWithProfile. */
      html, body { width: 105mm; height: 105mm; margin: 0; padding: 0; writing-mode: horizontal-tb; }
      body { font-family: Arial, sans-serif; color: #000; }
      .page { width: 100mm; height: 100mm; padding: 2mm; ${scaleCss} }
      h1 { font-size: 10pt; margin: 0 0 3mm; }
      .instr { font-size: 8pt; margin-bottom: 4mm; line-height: 1.3; }
      /* Two rulers, one horizontal one vertical. If the printed marks
         match a real ruler exactly, the printer is at 100% scale and no
         calibration change is needed. */
      .ruler-h { position: relative; height: 8mm; width: 100mm; border-top: 0.2mm solid #000; }
      .ruler-h .tick { position: absolute; top: 0; width: 0.2mm; background: #000; }
      .ruler-h .tick.long  { height: 6mm; }
      .ruler-h .tick.short { height: 3mm; }
      .ruler-h .label { position: absolute; top: 6.5mm; font-size: 6pt; transform: translateX(-50%); }
      .ruler-v { position: relative; width: 8mm; height: 80mm; border-left: 0.2mm solid #000; }
      .ruler-v .tick { position: absolute; left: 0; height: 0.2mm; background: #000; }
      .ruler-v .tick.long  { width: 6mm; }
      .ruler-v .tick.short { width: 3mm; }
      .ruler-v .label { position: absolute; left: 6.5mm; font-size: 6pt; transform: translateY(-50%); }
      .grid { display: grid; grid-template-columns: 8mm 1fr; gap: 3mm; margin-top: 5mm; }
    </style></head><body>
    <div class="page">
      <h1>Print Calibration — measure with a ruler</h1>
      <div class="instr">
        If the printed marks below match a real ruler exactly, your printer is at 100% scale — no adjustment needed.
        If the last mark (100 mm) is short/long, set Horizontal/Vertical calibration in Print Settings.
        Example: printed 98 mm instead of 100 mm → set H-scale to 102%.
      </div>
      <div>
        <div style="font-size:8pt;font-weight:bold;margin-bottom:1mm">Horizontal (100 mm)</div>
        <div class="ruler-h">
          ${Array.from({ length: 21 }, (_, i) => {
            const mm = i * 5;
            const isLong = i % 2 === 0;
            return `<div class="tick ${isLong ? 'long' : 'short'}" style="left: ${mm}mm"></div>${
              isLong ? `<div class="label" style="left: ${mm}mm">${mm}</div>` : ''
            }`;
          }).join('')}
        </div>
      </div>
      <div class="grid">
        <div>
          <div style="font-size:8pt;font-weight:bold;margin-bottom:1mm">Vertical<br/>(80 mm)</div>
          <div class="ruler-v">
            ${Array.from({ length: 17 }, (_, i) => {
              const mm = i * 5;
              const isLong = i % 2 === 0;
              return `<div class="tick ${isLong ? 'long' : 'short'}" style="top: ${mm}mm"></div>${
                isLong ? `<div class="label" style="top: ${mm}mm">${mm}</div>` : ''
              }`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  </body></html>`;
  const win = window.open('', '_blank', 'width=700,height=800');
  if (!win) return;
  win.document.open(); win.document.write(html); win.document.close();
  const trigger = () => { try { win.focus(); win.print(); } catch {} };
  if (win.document.readyState === 'complete') setTimeout(trigger, 200);
  else win.addEventListener('load', () => setTimeout(trigger, 200));
}

/** Print a small "test label" using the current profile so a shopkeeper
 *  can verify the settings without pulling any real product data. Reuses
 *  the profile-driven engine so what shows up is exactly what a real
 *  label would look like. */
export function printTestLabel(profile: PrinterProfile): void {
  void printLabelSheetWithProfile(
    [{ name: 'Sample Product', variantKey: 'Black / M', barcode: '123456789012', sellingPrice: 999, mrp: 1299, copies: 1 }],
    profile,
    { labelLine1: 'Vyapar Sarthii', labelLine2: 'TEST LABEL', title: 'Print Test Label' },
  );
}
