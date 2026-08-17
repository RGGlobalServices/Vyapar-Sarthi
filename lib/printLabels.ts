import { detectBarcodeFormat } from '@/lib/barcode';

// Shared by BarcodeQRModal.tsx (one product's variant rows) and the Import
// wizard (an arbitrary list of just-imported products) — extracted so the
// print HTML/CSS and thermal-vs-A4 handling only exists in one place.

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
   *  page along with it and makes labels bleed into each other. */
  labelSize?: 'a4' | 'thermal' | 'thermal58' | 'thermal80';
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
