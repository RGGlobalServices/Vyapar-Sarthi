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
import { autoFitBarcode, mmToPx, ptToMm, computeSheetGeometry, DEFAULT_SHEET } from './printProfiles';
import { autoDetectFormat } from './barcodeValidation';

export interface LabelRow {
  name: string;
  variantKey?: string;
  barcode: string;
  sellingPrice?: number;
  mrp?: number;
  copies?: number;
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
   *  own font weight/color. */
  emphasis: 'name' | 'variant' | 'header1' | 'header2' | 'price' | 'note';
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
  // Auto-fit resolves the barcode's mm dimensions; when off we take
  // profile values literally.
  const barSize = profile.autoFit
    ? autoFitBarcode(profile)
    : { widthMm: profile.barcodeWidthMm, heightMm: profile.barcodeHeightMm };

  // Assemble text lines per the field flags. Line height is roughly 1.3×
  // font size so descenders don't collide. All measurements in mm.
  const lineHeightMm = ptToMm(profile.fontSizePt) * 1.3;
  const smallLineMm = ptToMm(Math.max(6, profile.fontSizePt - 1)) * 1.3;
  const headerLineMm = ptToMm(profile.fontSizePt + 1) * 1.3;
  const lines: LabelTextLine[] = [];

  if (profile.fields.shopName && opts.labelLine1?.trim()) {
    lines.push({ y: 0, text: opts.labelLine1.trim(), fontSizePt: profile.fontSizePt + 1, fontWeight: 'bold', color: '#000000', emphasis: 'header1', align: profile.textAlign, heightMm: headerLineMm });
  }
  if (profile.fields.shopName && opts.labelLine2?.trim()) {
    lines.push({ y: 0, text: opts.labelLine2.trim(), fontSizePt: Math.max(6, profile.fontSizePt - 1), fontWeight: 'medium', color: '#333333', emphasis: 'header2', align: profile.textAlign, heightMm: smallLineMm });
  }

  const nameLine = profile.fields.productName ? row.name : '';
  const variantLine = ((profile.fields.variant || profile.fields.size || profile.fields.colour) && row.variantKey) ? row.variantKey : '';
  const noteLine = profile.fields.customText && opts.labelText?.trim() ? opts.labelText.trim() : '';
  const priceLine = (() => {
    const sellingPrice = row.sellingPrice || 0;
    const mrp = row.mrp || 0;
    if (profile.fields.sellingPrice && sellingPrice > 0) return `INR ${sellingPrice.toLocaleString('en-IN')}`;
    if (profile.fields.mrp && mrp > 0) return `MRP INR ${mrp.toLocaleString('en-IN')}`;
    return '';
  })();

  // Text position ABOVE the barcode: name + variant on top; below-price
  // and note stay below. Text position BELOW: nothing above, all under.
  const above = profile.textPosition === 'above';
  if (above && nameLine)    lines.push({ y: 0, text: nameLine, fontSizePt: profile.fontSizePt, fontWeight: profile.fontWeight, color: '#000000', emphasis: 'name', align: profile.textAlign, heightMm: lineHeightMm });
  if (above && variantLine) lines.push({ y: 0, text: variantLine, fontSizePt: Math.max(6, profile.fontSizePt - 1), fontWeight: 'bold', color: '#4338ca', emphasis: 'variant', align: profile.textAlign, heightMm: smallLineMm });

  // Barcode slot (always centred horizontally by the position map, y
  // position derived after we know how many text lines are above it).
  const barcodeX = (widthMm - barSize.widthMm) / 2 + (profile.positionH === 'left' ? -(widthMm - barSize.widthMm) / 2 + profile.margins.left : profile.positionH === 'right' ? (widthMm - barSize.widthMm) / 2 - profile.margins.right : 0);
  // We'll fill Y below after computing total content height.

  // Barcode-number line, drawn BELOW the barcode as one continuous string
  // (e.g. "123456789012") rather than the EAN/UPC-standard split layout
  // (e.g. "1 234567 890128"). The split IS the international standard for
  // EAN-13/UPC-A — scanners rely on those positions — but shopkeepers
  // reading their own inventory codes find the split confusing. Our
  // compromise: still print bars in the correct symbology (scanner-
  // compatible), but display the digits as a single clean line below by
  // turning off JsBarcode's built-in `displayValue` and adding a plain
  // text line ourselves. Fixes client feedback: "product barcode number
  // divide you can see it below".
  const barcodeNumberLine = profile.fields.barcodeNumber && row.barcode ? row.barcode : '';

  if (!above && nameLine)    lines.push({ y: 0, text: nameLine, fontSizePt: profile.fontSizePt, fontWeight: profile.fontWeight, color: '#000000', emphasis: 'name', align: profile.textAlign, heightMm: lineHeightMm });
  if (!above && variantLine) lines.push({ y: 0, text: variantLine, fontSizePt: Math.max(6, profile.fontSizePt - 1), fontWeight: 'bold', color: '#4338ca', emphasis: 'variant', align: profile.textAlign, heightMm: smallLineMm });
  if (barcodeNumberLine)     lines.push({ y: 0, text: barcodeNumberLine, fontSizePt: Math.max(6, profile.fontSizePt - 1), fontWeight: 'normal', color: '#000000', emphasis: 'note', align: 'center', heightMm: smallLineMm });
  if (noteLine)              lines.push({ y: 0, text: noteLine, fontSizePt: Math.max(6, profile.fontSizePt - 1), fontWeight: 'normal', color: '#334155', emphasis: 'note', align: profile.textAlign, heightMm: smallLineMm });
  if (priceLine)             lines.push({ y: 0, text: priceLine, fontSizePt: profile.fontSizePt, fontWeight: 'bold', color: '#000000', emphasis: 'price', align: profile.textAlign, heightMm: lineHeightMm });

  // Now vertically stack: margins → above-lines → barcode → below-lines →
  // margins. `heightMm` on the label is either profile.labelHeightMm or,
  // for roll paper, computed from content.
  const aboveLinesCount = above ? (nameLine ? 1 : 0) + (variantLine ? 1 : 0) : 0;
  const aboveLines = lines.slice(0, (profile.fields.shopName ? (opts.labelLine1?.trim() ? 1 : 0) + (opts.labelLine2?.trim() ? 1 : 0) : 0) + aboveLinesCount);
  const belowLines = lines.slice(aboveLines.length);
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
    if (availableForBarcode > 0 && barcodeHeightMm > availableForBarcode) {
      barcodeHeightMm = Math.max(6, availableForBarcode);
    }
  }
  const barcodeBlockMm = barcodeHeightMm + profile.quietZoneMm * 2;

  const totalContentMm = aboveHeightMm + profile.spacingMm + barcodeBlockMm + profile.spacingMm + belowHeightMm;
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
  y += profile.spacingMm;
  const barcodeY = y + profile.quietZoneMm;
  y += barcodeBlockMm + profile.spacingMm;
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
