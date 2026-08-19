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
import { autoFitBarcode, mmToPx, ptToMm } from './printProfiles';
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
  const { default: JsPDF } = await import('jspdf');

  // Explode `copies` into individual page-per-copy — one printed sticker
  // per unit, symmetric with the HTML engine.
  const exploded: LabelRow[] = [];
  for (const row of rows) {
    const copies = Math.max(1, Math.floor(row.copies ?? 1));
    for (let i = 0; i < copies; i++) exploded.push(row);
  }
  if (!exploded.length) return '';

  // First page — compute layout to derive its exact mm height (roll paper
  // varies per label; fixed labels are always profile.labelHeightMm).
  const firstLayout = computeLabelLayout(profile, exploded[0], opts);
  const firstPageDims: [number, number] = firstLayout.widthMm >= firstLayout.heightMm
    ? [firstLayout.widthMm, firstLayout.heightMm]
    : [firstLayout.widthMm, firstLayout.heightMm];

  const doc = new JsPDF({
    // Custom format: [width, height] in mm. jsPDF v4 accepts this
    // directly. Orientation is derived from the aspect ratio — a 60×30
    // label = landscape naturally; a 30×60 label = portrait naturally.
    // No manual rotate() calls anywhere.
    orientation: firstPageDims[0] >= firstPageDims[1] ? 'landscape' : 'portrait',
    unit: 'mm',
    format: firstPageDims,
    compress: true,
    hotfixes: ['px_scaling'],
  });

  // Per-axis calibration % (clamped to safe range). Applied as a jsPDF
  // transformation matrix rather than a CSS scale — same net effect but
  // works with vector output. Only touches the label content, never the
  // page format itself, so the PDF's declared page size stays at the
  // exact configured mm.
  const scaleH = Math.max(0.9, Math.min(1.1, profile.scaleH / 100));
  const scaleV = Math.max(0.9, Math.min(1.1, profile.scaleV / 100));

  for (let i = 0; i < exploded.length; i++) {
    const row = exploded[i];
    const layout = computeLabelLayout(profile, row, opts);
    // Add a new page for every row EXCEPT the first (first was set at
    // constructor time). Every page uses its own dimensions — roll paper
    // labels can differ in height, fixed labels are all identical.
    if (i > 0) {
      const dims: [number, number] = [layout.widthMm, layout.heightMm];
      doc.addPage(dims, dims[0] >= dims[1] ? 'landscape' : 'portrait');
    }

    // Calibration transform — origin at (0,0), scale content only.
    if (scaleH !== 1 || scaleV !== 1) {
      // jsPDF v4 transformation: matrix a,b,c,d,e,f — a scaleX, d scaleY.
      doc.saveGraphicsState();
      // Use setCurrentTransformationMatrix if available; fallback silent.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyDoc = doc as any;
      if (typeof anyDoc.setCurrentTransformationMatrix === 'function') {
        anyDoc.setCurrentTransformationMatrix([scaleH, 0, 0, scaleV, 0, 0]);
      }
    }

    // Barcode image — render DIRECTLY to an off-screen canvas via
    // JsBarcode(canvas, …) and take canvas.toDataURL(). The earlier
    // SVG-serialise → Blob URL → Image → canvas path failed silently on
    // some browsers (Chrome dropped the unattached-SVG rasterisation
    // step, so the PNG came back blank and the PDF landed with no
    // barcode). The direct-to-canvas path is what JsBarcode's own docs
    // recommend for PDF/image use cases — always works, no image-load
    // timing races, no xmlns quirks.
    if (layout.barcode && row.barcode) {
      try {
        const dpi = profile.dpi > 0 ? profile.dpi : 300; // raster at 300 unless the user pinned a printer DPI
        const pngPxW = Math.max(60, Math.round(mmToPx(layout.barcode.width, dpi)));
        const pngPxH = Math.max(30, Math.round(mmToPx(layout.barcode.height, dpi)));
        const dataUrl = await renderBarcodePngDataUrl(row.barcode, layout.barcode.format, pngPxW, pngPxH, layout.barcode.displayValue, profile.fontSizePt);
        doc.addImage(dataUrl, 'PNG', layout.barcode.x, layout.barcode.y, layout.barcode.width, layout.barcode.height, undefined, 'FAST');
      } catch (e) {
        // Skip un-renderable rows silently rather than aborting the batch.
      }
    }

    // Text lines — mm coordinates, mm-based font sizing (pt→mm via ptToMm).
    for (const line of layout.lines) {
      const [r, g, b] = hexToRgb(line.color);
      doc.setTextColor(r, g, b);
      doc.setFontSize(line.fontSizePt);
      doc.setFont('helvetica', line.fontWeight === 'bold' ? 'bold' : line.fontWeight === 'medium' ? 'bold' : 'normal');
      // jsPDF text y is baseline; add ~font size (converted to mm) so the
      // top of the text sits at the layout y.
      const baselineY = line.y + ptToMm(line.fontSizePt) * 0.85;
      const anchor: 'left' | 'center' | 'right' = line.align;
      const x = anchor === 'left' ? profile.margins.left
              : anchor === 'right' ? layout.widthMm - profile.margins.right
              : layout.widthMm / 2;
      doc.text(line.text, x, baselineY, { align: anchor, maxWidth: layout.widthMm - profile.margins.left - profile.margins.right });
    }

    if (scaleH !== 1 || scaleV !== 1) doc.restoreGraphicsState();
  }

  // Open the PDF blob in a new tab so the shopkeeper can inspect the
  // real page dimensions and print/save from there.
  const blobUrl = doc.output('bloburl') as unknown as string;
  return blobUrl;
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
