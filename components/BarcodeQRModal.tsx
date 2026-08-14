'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { X, QrCode, Barcode, Download, Printer, Copy, Check, LayoutGrid, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { invalidateProductCaches } from '@/lib/swrInvalidate';
import { detectBarcodeFormat } from '@/lib/barcode';
import { printLabelSheet as printLabelSheetShared } from '@/lib/printLabels';
import { generateVariantBarcodes } from '@/components/SizeVariantGrid';

interface BarcodeQRModalProps {
  product: {
    id: string | number;
    name: string;
    barcode?: string;
    /** Outer-carton/box code — separate from the per-piece barcode above. */
    cartonBarcode?: string;
    sellingPrice?: number;
    mrp?: number;
    /** Shop's own purchase/wholesale cost — the "Wholesale Rate" on a carton label. */
    wholesaleCost?: number;
    category?: string;
    /** Current stock on hand — seeds "copies to print" so a shopkeeper can
     *  default to one sticker per unit without typing it in. */
    stock?: number;
    /** Composite variant key → qty. Keys look like "Blue / 8GB / 128GB". */
    size_variants?: string | Record<string, number>;
    /** Metadata carries per-variant pricing + barcodes under `size_prices`. */
    metadata?: any;
  };
  /** Shows the Udyog-only Carton/Box bulk-label tab. */
  isWholesale?: boolean;
  onClose: () => void;
}

/** Parse a variant sub-map safely from either a JSON string or an object. */
function parseObj(v: any): Record<string, any> {
  if (!v) return {};
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return {}; } }
  return v;
}

/** Collapse anything that isn't filesystem-safe (spaces, slashes in a
 *  "Colour / Size" variant key, etc.) into single dashes for a download filename. */
function safeSlug(s: string): string {
  return s.trim().replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// The print functions below build HTML via document.write() into a popup
// window — anything interpolated in has to be escaped, or a crafted product
// name / a shopkeeper's own typed label text could execute as markup/script
// in that window.
function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}

export default function BarcodeQRModal({ product, isWholesale, onClose }: BarcodeQRModalProps) {
  const t = useTranslations('BarcodeQRModal');
  const tv = useTranslations('Variants');
  const barcodeRef = useRef<SVGSVGElement>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  // A variant product opens straight on the Variants tab — the plain
  // Barcode tab only ever shows one code for the whole product, which isn't
  // any specific real variant and was confusing shopkeepers into thinking
  // that was "the" barcode to print for every colour/size.
  const [tab, setTab] = useState<'barcode' | 'qr' | 'variants' | 'carton'>(() => {
    const variants = parseObj(product.size_variants);
    const hasVariants = Object.values(variants).some(q => Number(q) > 0);
    return hasVariants ? 'variants' : 'barcode';
  });
  const [copied, setCopied] = useState(false);
  // How many physical stickers to print — defaults to current stock (one per
  // unit on the shelf) but stays fully editable: print fewer if only some
  // units need re-labelling, or more to get ahead of the next delivery.
  const [printQty, setPrintQty] = useState(() => Math.max(1, Math.round(product.stock ?? 1)));
  // Optional extra line printed on the label below the price — a promo note,
  // batch tag, shop name, whatever the shopkeeper wants on the sticker itself.
  const [labelText, setLabelText] = useState('');
  // Optional two-line HEADER printed above the product name — shop name on
  // top, address/tagline below, same idea as the header block on a printed
  // receipt. Distinct from labelText above (which sits below the price).
  const [labelLine1, setLabelLine1] = useState('');
  const [labelLine2, setLabelLine2] = useState('');
  // Udyog-only Carton/Box label — a separate bulk-packaging code from the
  // per-piece barcode above, priced by the whole carton rather than one unit.
  const [unitsPerCarton, setUnitsPerCarton] = useState(1);
  const [cartonCopies, setCartonCopies] = useState(1);
  // A4 keeps today's behaviour (a small popup for one code, a multi-column
  // sheet for variants). Thermal targets an actual small-roll label printer —
  // this app had no physical-page-size print path at all before this.
  const [labelSize, setLabelSize] = useState<'a4' | 'thermal'>('a4');

  // A stored barcode that starts with PRD-/BAR- is a placeholder the system
  // generated when the product was created without a real code — it is NOT a
  // company barcode the shopkeeper entered. Treat those (and blanks) as "no
  // real barcode" so we can label the difference and print a stable auto code.
  const isAutoPlaceholder = (v?: string) => !v || /^(prd|bar)-/i.test(v.trim());
  // Mirrors the `product` prop, but can move ahead of it within this modal
  // session once the persist effect below succeeds — the prop itself is a
  // snapshot the parent won't refresh just because this modal wrote something.
  const [persistedBarcode, setPersistedBarcode] = useState(product.barcode);
  useEffect(() => { setPersistedBarcode(product.barcode); }, [product.id, product.barcode]);
  const hasRealBarcode = !isAutoPlaceholder(persistedBarcode);
  const barcodeValue = hasRealBarcode
    ? String(persistedBarcode)
    : `PRD-${String(product.id).substring(0, 8).toUpperCase()}`;

  // The single most important fix here: previously this computed value was
  // shown and PRINTED but never saved, so a label stuck on the shelf encoded
  // a string `product.barcode` in the database would never match — scanning
  // it at billing always 404'd. Persist it once, best-effort, so display,
  // print, and what the scanner searches against are permanently the same
  // string. Safe to retry: if this fails (offline, etc.), `hasRealBarcode`
  // stays false and the same attempt fires again next time the modal opens.
  useEffect(() => {
    if (hasRealBarcode) return;
    const value = barcodeValue;
    api.put(`/products/${product.id}`, { barcode: value })
      .then(() => { setPersistedBarcode(value); invalidateProductCaches(); })
      .catch(() => { /* best-effort — retried on next open */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id, hasRealBarcode]);

  // Real products use a genuinely different barcode per colour/size — they
  // are physically different items with different manufacturer codes. A
  // variant with no barcode of its own previously fell back to sharing the
  // SAME product-level `barcodeValue` as every other variant, which is why
  // every row looked identical: not a display bug, the underlying data
  // really had no per-variant code, so there was nothing to tell them apart
  // with. Fixed by generating a genuinely distinct code per variant (pure,
  // synchronous — reuses the exact same generator the Edit-Product "Generate
  // variant barcodes" button already uses, `PRD-<id8>-<VARIANT>`, so the
  // format matches what shopkeepers already see there) and persisting it,
  // the same "never print something that isn't also saved" discipline as
  // the product-level fix above.
  const ensuredSizePrices = useMemo(() => {
    const variants = parseObj(product.size_variants);
    const existing = parseObj(parseObj(product.metadata).size_prices);
    return generateVariantBarcodes(barcodeValue, variants, existing);
  }, [product, barcodeValue]);

  // Local, editable copy — seeded from the ensured map above, but a
  // shopkeeper can type over any of these with the REAL manufacturer code
  // printed on that specific variant, same as the product-level barcode
  // field is editable via Edit Product.
  const [sizePrices, setSizePrices] = useState<Record<string, any>>(ensuredSizePrices);
  useEffect(() => {
    setSizePrices(ensuredSizePrices);
    // Deliberately keyed on product.id alone, not ensuredSizePrices — a
    // background refetch/realtime tick hands down a new `product` object
    // reference for the SAME product constantly; resetting on every such
    // reference change would silently discard an in-progress edit in the
    // input still focused above. Only a genuine product switch should reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  // Persist any newly-generated (not user-typed) codes once, so the label
  // this modal is about to show/print is already what the scanner will
  // search against — mirrors the product-level persist effect above.
  // Deliberately compares against the RAW original metadata, not the live
  // `sizePrices` state, so this only ever fires for genuinely-missing codes
  // and never fights a shopkeeper's own in-progress edits.
  useEffect(() => {
    const meta = parseObj(product.metadata);
    const existing = parseObj(meta.size_prices);
    const generatedSomething = Object.keys(ensuredSizePrices).some(k => !existing[k]?.barcode && ensuredSizePrices[k]?.barcode);
    if (!generatedSomething) return;
    api.put(`/products/${product.id}`, { metadata: { ...meta, size_prices: ensuredSizePrices } })
      .then(() => invalidateProductCaches())
      .catch(() => { /* best-effort — retried next time the modal opens */ });
    // Keyed on product.id alone (see the sizePrices-reset effect above for
    // why) — otherwise a reference-only refetch mid-edit could re-fire this
    // with a stale, pre-edit snapshot and overwrite a just-saved edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  function setVariantBarcode(key: string, value: string) {
    setSizePrices(prev => ({ ...prev, [key]: { ...(prev[key] || {}), barcode: value } }));
  }

  // Saves on blur rather than every keystroke — same metadata-merge shape as
  // the auto-generate effect above, just triggered by the shopkeeper instead
  // of computed for them.
  function saveVariantBarcode() {
    const meta = parseObj(product.metadata);
    api.put(`/products/${product.id}`, { metadata: { ...meta, size_prices: sizePrices } })
      .then(() => invalidateProductCaches())
      .catch(() => { /* the field keeps its typed value either way; retried on next edit/open */ });
  }

  const variantRows = useMemo(() => {
    const variants = parseObj(product.size_variants);
    return Object.keys(variants)
      .filter(k => Number(variants[k]) > 0)
      .map(k => {
        const entry = (sizePrices[k] || {}) as any;
        return {
          key: k,
          qty: Number(variants[k]) || 0,
          barcode: (entry.barcode || '').toString(),
          sellingPrice: Number(entry.sellingPrice) || Number(product.sellingPrice) || 0,
          mrp: Number(entry.mrp) || Number(product.mrp) || 0,
        };
      });
  }, [product, sizePrices]);

  // Per-variant "copies to print" — defaults to that variant's own current
  // stock (one sticker per unit) but each row stays independently editable,
  // same reasoning as `printQty` above. Re-seeds defaults whenever the set of
  // variant keys changes (a different product opened, or stock re-synced);
  // an in-progress edit on a key that's still present is left alone.
  const [variantPrintQty, setVariantPrintQty] = useState<Record<string, number>>({});
  useEffect(() => {
    setVariantPrintQty(prev => {
      const next: Record<string, number> = {};
      for (const row of variantRows) next[row.key] = prev[row.key] ?? Math.max(1, row.qty);
      return next;
    });
  }, [variantRows]);

  // Generate barcode using JsBarcode
  useEffect(() => {
    if (tab !== 'barcode' || !barcodeRef.current) return;
    import('jsbarcode').then(({ default: JsBarcode }) => {
      try {
        JsBarcode(barcodeRef.current!, barcodeValue, {
          format: detectBarcodeFormat(barcodeValue),
          width: 2.5,
          height: 80,
          displayValue: true,
          fontSize: 14,
          fontOptions: 'bold',
          margin: 12,
          background: '#ffffff',
          lineColor: '#0f172a',
        });
      } catch (e) {
        console.error('Barcode gen error:', e);
      }
    });
  }, [tab, barcodeValue]);

  // Generate QR code
  useEffect(() => {
    if (tab !== 'qr' || !qrCanvasRef.current) return;
    import('qrcode').then((QRCode) => {
      const qrData = JSON.stringify({
        id: product.id,
        name: product.name,
        price: product.sellingPrice,
        barcode: barcodeValue,
      });
      QRCode.default.toCanvas(qrCanvasRef.current!, qrData, {
        width: 240,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
        errorCorrectionLevel: 'H',
      }).catch(console.error);
    });
  }, [tab, product, barcodeValue]);

  function downloadBarcode() {
    if (!barcodeRef.current) return;
    const svg = barcodeRef.current;
    const data = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([data], { type: 'image/svg+xml' });
    // Convert SVG → canvas → PNG
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `barcode-${safeSlug(product.name)}.png`;
      a.click();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function downloadQR() {
    if (!qrCanvasRef.current) return;
    const a = document.createElement('a');
    a.href = qrCanvasRef.current.toDataURL('image/png');
    a.download = `qr-${safeSlug(product.name)}.png`;
    a.click();
  }

  function copyBarcode() {
    navigator.clipboard.writeText(barcodeValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function printCode() {
    // Barcode: delegate to the shared sheet renderer so it gets the same
    // repeat-per-copy, thermal-page-size, and quiet-zone handling as the
    // Variants/Carton tabs and the Import wizard's bulk print — one sticker
    // per copy, not a single label annotated with a count.
    if (tab === 'barcode') {
      printLabelSheetShared(
        [{ name: product.name, barcode: barcodeValue, sellingPrice: product.sellingPrice, mrp: product.mrp, copies: printQty }],
        { labelText, labelLine1, labelLine2, labelSize, title: `${product.name} — Labels` },
      );
      return;
    }

    // QR has its own simpler path (not part of the shared barcode renderer)
    // but still respects the copy count and thermal/A4 page size.
    const priceLine = `₹${product.sellingPrice || product.mrp || 0}`;
    const noteLine = labelText.trim() ? `<p style="font-size:10px;margin-top:3px;color:#334155">${escapeHtml(labelText.trim())}</p>` : '';
    const qrSrc = qrCanvasRef.current?.toDataURL('image/png') || '';
    const copies = Math.max(1, Math.floor(printQty) || 1);
    const isThermal = labelSize === 'thermal';
    const card = `<div class="qr-lbl">
        <p style="font-size:12px;font-weight:bold;margin:0 0 6px">${escapeHtml(product.name)}</p>
        <img src="${qrSrc}" style="width:${isThermal ? '120px' : '180px'};height:${isThermal ? '120px' : '180px'}" />
        <p style="font-size:11px;margin:6px 0 0">${priceLine}</p>
        ${noteLine}
      </div>`;
    const pageRule = isThermal
      ? '@page { size: 50mm 25mm; margin: 2mm; } .qr-lbl { page-break-after: always; }'
      : '@page { size: A4; margin: 8mm; }';
    const html = `<!DOCTYPE html><html><head><style>
        * { box-sizing: border-box; } body { font-family: sans-serif; margin: 0; }
        ${isThermal ? '.sheet { display: block; }' : '.sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; padding: 4mm; }'}
        .qr-lbl { text-align: center; ${isThermal ? '' : 'border: 0.4mm dashed #94a3b8; border-radius: 2mm; padding: 3mm;'} }
        ${pageRule}
      </style></head><body><div class="sheet">${Array(copies).fill(card).join('')}</div></body></html>`;

    const win = window.open('', '_blank', 'width=400,height=500');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
  }

  // Print a label per variant, repeated per that row's own editable copy
  // count — delegates to the shared renderer (lib/printLabels.ts) also used
  // by the Import wizard's bulk label printing.
  function printLabelSheet() {
    printLabelSheetShared(
      variantRows.map(row => ({
        name: product.name,
        variantKey: row.key,
        barcode: row.barcode,
        sellingPrice: row.sellingPrice,
        mrp: row.mrp,
        copies: variantPrintQty[row.key] ?? Math.max(1, row.qty),
      })),
      { labelText, labelLine1, labelLine2, labelSize, title: `${product.name} — Labels` },
    );
  }

  // Print / download just ONE variant — a shopkeeper restocking a single
  // colour/size shouldn't have to print the whole sheet to get one label.
  function printOneVariant(row: typeof variantRows[number]) {
    printLabelSheetShared(
      [{ name: product.name, variantKey: row.key, barcode: row.barcode, sellingPrice: row.sellingPrice, mrp: row.mrp, copies: variantPrintQty[row.key] ?? Math.max(1, row.qty) }],
      { labelText, labelLine1, labelLine2, labelSize, title: `${product.name} — ${row.key}` },
    );
  }

  // Downloads the SAME label content Print produces (name, variant, barcode,
  // custom text, price) rasterized as one PNG — not just the bare barcode
  // graphic, so the custom label text a shopkeeper typed in actually shows
  // up here too instead of only on the printed sheet.
  async function downloadOneVariant(row: typeof variantRows[number]) {
    const { default: JsBarcode } = await import('jsbarcode');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    try {
      JsBarcode(svg, row.barcode, {
        format: detectBarcodeFormat(row.barcode), width: 2.5, height: 80,
        displayValue: true, fontSize: 14, fontOptions: 'bold', margin: 12,
        background: '#ffffff', lineColor: '#0f172a',
      });
    } catch { return; }
    const data = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([data], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const pad = 16 * scale;
      const note = labelText.trim();
      const header1 = labelLine1.trim();
      const header2 = labelLine2.trim();
      const sellingPrice = row.sellingPrice || 0;
      const mrp = row.mrp || 0;
      const price = sellingPrice > 0 ? `₹${sellingPrice.toLocaleString('en-IN')}` : (mrp > 0 ? `MRP ₹${mrp.toLocaleString('en-IN')}` : '');

      const header1Font = `800 ${11 * scale}px Arial, sans-serif`;
      const header2Font = `600 ${9 * scale}px Arial, sans-serif`;
      const nameFont = `800 ${16 * scale}px Arial, sans-serif`;
      const variantFont = `700 ${13 * scale}px Arial, sans-serif`;
      const noteFont = `600 ${12 * scale}px Arial, sans-serif`;
      const priceFont = `700 ${15 * scale}px Arial, sans-serif`;

      const header1LineH = header1 ? 14 * scale : 0;
      const header2LineH = header2 ? 12 * scale : 0;
      const nameLineH = 22 * scale;
      const variantLineH = 18 * scale;
      const noteLineH = note ? 16 * scale : 0;
      const priceLineH = price ? 20 * scale : 0;
      const gap = 4 * scale;
      const hasHeader = !!(header1 || header2);
      const contentW = Math.max(img.width, 220 * scale);

      const canvas = document.createElement('canvas');
      canvas.width = contentW + pad * 2;
      canvas.height = pad * 2 + nameLineH + variantLineH + gap + img.height
        + (hasHeader ? header1LineH + header2LineH + gap : 0)
        + (note ? noteLineH + gap : 0) + (price ? priceLineH + gap : 0);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const cx = canvas.width / 2;
      let y = pad;

      if (header1) {
        y += header1LineH / 2;
        ctx.fillStyle = '#0f172a';
        ctx.font = header1Font;
        ctx.fillText(header1.toUpperCase(), cx, y, contentW);
        y += header1LineH / 2;
      }
      if (header2) {
        y += header2LineH / 2;
        ctx.fillStyle = '#475569';
        ctx.font = header2Font;
        ctx.fillText(header2, cx, y, contentW);
        y += header2LineH / 2;
      }
      if (hasHeader) {
        y += gap;
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = scale;
        ctx.beginPath();
        ctx.moveTo(pad, y);
        ctx.lineTo(canvas.width - pad, y);
        ctx.stroke();
      }

      y += nameLineH / 2;

      ctx.fillStyle = '#0f172a';
      ctx.font = nameFont;
      ctx.fillText(product.name, cx, y, contentW);

      y += nameLineH / 2 + variantLineH / 2;
      ctx.fillStyle = '#6366f1';
      ctx.font = variantFont;
      ctx.fillText(row.key, cx, y, contentW);

      y += variantLineH / 2 + gap + img.height / 2;
      ctx.drawImage(img, (canvas.width - img.width) / 2, y - img.height / 2, img.width, img.height);
      y += img.height / 2;

      if (note) {
        y += gap + noteLineH / 2;
        ctx.fillStyle = '#334155';
        ctx.font = noteFont;
        ctx.fillText(note, cx, y, contentW);
        y += noteLineH / 2;
      }

      if (price) {
        y += gap + priceLineH / 2;
        ctx.fillStyle = '#0f172a';
        ctx.font = priceFont;
        ctx.fillText(price, cx, y, contentW);
      }

      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `barcode-${safeSlug(product.name)}-${safeSlug(row.key)}.png`;
      a.click();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  // Carton/box label — a distinct bulk-packaging concept from the per-piece
  // labels above: one barcode per outer carton (product.cartonBarcode, never
  // auto-generated the way the per-piece one is — a real carton code has to
  // come from the shopkeeper via Edit Product), showing both the Wholesale
  // and Retail rate for the WHOLE carton (unit rate × units-per-carton), not
  // per piece. Kept as its own print function rather than forced through the
  // shared single-price renderer, since two price lines + a bulk-qty line is
  // a genuinely different label layout.
  async function printCartonLabel() {
    if (!product.cartonBarcode) return;
    const { default: JsBarcode } = await import('jsbarcode');
    const isThermal = labelSize === 'thermal';
    const svgTmp = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    try {
      JsBarcode(svgTmp, product.cartonBarcode, {
        format: detectBarcodeFormat(product.cartonBarcode), width: isThermal ? 2.2 : 2, height: isThermal ? 40 : 50,
        displayValue: true, fontSize: 10, fontOptions: 'bold', margin: 8, background: '#ffffff', lineColor: '#0f172a',
      });
    } catch { /* skip unrenderable code */ }
    const svgStr = new XMLSerializer().serializeToString(svgTmp);
    const units = Math.max(1, Math.floor(unitsPerCarton) || 1);
    const wholesaleTotal = (product.wholesaleCost || 0) * units;
    const retailTotal = (product.sellingPrice || product.mrp || 0) * units;
    const noteLine = labelText.trim() ? `<div class="lbl-note">${escapeHtml(labelText.trim())}</div>` : '';
    const card = `
      <div class="lbl">
        <div class="lbl-name">${escapeHtml(product.name)}</div>
        <div class="lbl-variant">${t('perCarton')} × ${units}</div>
        <div class="lbl-barcode">${svgStr}</div>
        ${noteLine}
        <div class="lbl-rates">
          <div><span>${t('wholesaleRate')}</span><b>₹${wholesaleTotal.toLocaleString('en-IN')}</b></div>
          <div><span>${t('retailRate')}</span><b>₹${retailTotal.toLocaleString('en-IN')}</b></div>
        </div>
      </div>`;
    const copies = Math.max(1, Math.floor(cartonCopies) || 1);
    const labels = Array(copies).fill(card).join('');

    const html = `<!doctype html><html><head><title>${escapeHtml(product.name)} — Carton Labels</title>
      <style>
        @page { size: ${isThermal ? '50mm 25mm' : 'A4'}; margin: ${isThermal ? '2mm' : '8mm'}; }
        * { box-sizing: border-box; }
        body { font-family: Helvetica, Arial, sans-serif; margin: 0; color: #0f172a; }
        .sheet { display: ${isThermal ? 'block' : 'grid'}; grid-template-columns: repeat(2, 1fr); gap: 4mm; padding: ${isThermal ? '0' : '2mm'}; }
        .lbl {
          border: ${isThermal ? 'none' : '0.4mm dashed #94a3b8'};
          border-radius: ${isThermal ? '0' : '2mm'};
          padding: ${isThermal ? '1.5mm' : '3mm'};
          break-inside: avoid;
          ${isThermal ? 'page-break-after: always; break-after: page;' : ''}
          text-align: center;
          background: #fff;
        }
        .lbl-name    { font-size: 11px; font-weight: 800; line-height: 1.15; margin-bottom: 1mm; }
        .lbl-variant { font-size: 9px; font-weight: 700; color: #6366f1; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 1mm; }
        .lbl-barcode svg { max-width: 100%; height: auto; }
        .lbl-note    { font-size: 8px; font-weight: 600; color: #334155; margin: 0.5mm 0; }
        .lbl-rates   { display: flex; justify-content: space-around; margin-top: 1mm; border-top: 0.3mm solid #cbd5e1; padding-top: 1mm; }
        .lbl-rates div { display: flex; flex-direction: column; font-size: 9px; }
        .lbl-rates span { color: #64748b; font-weight: 600; }
        .lbl-rates b { font-size: 11px; }
        @media print { html, body { background: #fff; } .lbl { border-color: #cbd5e1; } }
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

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm max-h-[90vh] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-800/30 shrink-0">
          <div>
            <h2 className="font-bold text-slate-100 text-base truncate max-w-[200px]">{product.name}</h2>
            <p className="text-xs text-slate-500">{product.category} · ₹{product.sellingPrice || product.mrp}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1">
            <X size={20} />
          </button>
        </div>

        {/* Tabs — the Variants tab only shows up when the product actually has
            per-variant barcodes to print. Keeps the modal single-column for
            plain products (no rows to fill). */}
        <div className="flex border-b border-slate-800 shrink-0">
          {([
            'barcode', 'qr',
            ...(variantRows.length > 0 ? ['variants' as const] : []),
            ...(isWholesale ? ['carton' as const] : []),
          ] as const).map(tabKey => (
            <button key={tabKey} onClick={() => setTab(tabKey)}
              className={cn(
                'flex-1 py-3 flex items-center justify-center gap-2 text-sm font-bold transition-colors',
                tab === tabKey ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-slate-500 hover:text-slate-300'
              )}>
              {tabKey === 'barcode' ? <><Barcode size={16} /> {t('barcodeTab')}</>
                : tabKey === 'qr' ? <><QrCode size={16} /> {t('qrCodeTab')}</>
                : tabKey === 'variants' ? <><LayoutGrid size={16} /> {tv('variantBarcodesTitle')} · {variantRows.length}</>
                : <><Package size={16} /> {t('cartonTab')}</>}
            </button>
          ))}
        </div>

        {/* Code display */}
        {tab === 'carton' ? (
        <div className="p-4 flex flex-col gap-3 overflow-y-auto min-h-0">
          {!product.cartonBarcode ? (
            <p className="text-[11px] text-amber-400/90 leading-relaxed p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              {t('cartonBarcodeMissing')}
            </p>
          ) : (
            <>
              <div className="bg-white rounded-xl p-3 flex items-center justify-center w-full">
                <svg ref={el => {
                  if (!el || !product.cartonBarcode) return;
                  import('jsbarcode').then(({ default: JsBarcode }) => {
                    try {
                      JsBarcode(el, product.cartonBarcode!, {
                        format: detectBarcodeFormat(product.cartonBarcode!), width: 2.5, height: 80,
                        displayValue: true, fontSize: 14, fontOptions: 'bold', margin: 12,
                        background: '#ffffff', lineColor: '#0f172a',
                      });
                    } catch { /* */ }
                  });
                }} className="max-w-full" />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">{t('unitsPerCarton')}</label>
                <input
                  type="number" min={1}
                  value={unitsPerCarton}
                  onChange={e => setUnitsPerCarton(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-center font-bold text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-800/70 rounded-xl px-3 py-2 border border-slate-700/60 text-center">
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">{t('wholesaleRate')}</p>
                  <p className="text-sm font-black text-blue-400">₹{((product.wholesaleCost || 0) * unitsPerCarton).toLocaleString('en-IN')}</p>
                </div>
                <div className="bg-slate-800/70 rounded-xl px-3 py-2 border border-slate-700/60 text-center">
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">{t('retailRate')}</p>
                  <p className="text-sm font-black text-emerald-400">₹{((product.sellingPrice || product.mrp || 0) * unitsPerCarton).toLocaleString('en-IN')}</p>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">{t('customLabelText')}</label>
                <input
                  type="text"
                  value={labelText}
                  onChange={e => setLabelText(e.target.value)}
                  placeholder={t('customLabelTextPlaceholder')}
                  maxLength={60}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">{t('numberOfCartons')}</label>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setCartonCopies(q => Math.max(1, q - 1))}
                    className="w-9 h-9 shrink-0 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-bold hover:bg-slate-700">–</button>
                  <input
                    type="number" min={1}
                    value={cartonCopies}
                    onChange={e => setCartonCopies(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-center font-bold text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button type="button" onClick={() => setCartonCopies(q => q + 1)}
                    className="w-9 h-9 shrink-0 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-bold hover:bg-slate-700">+</button>
                </div>
              </div>

              <div className="flex bg-slate-800 rounded-xl p-1 w-full">
                {([['a4', t('labelSizeA4')], ['thermal', t('labelSizeThermal')]] as const).map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setLabelSize(key)}
                    className={cn(
                      'flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors',
                      labelSize === key ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'
                    )}>
                    {label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={printCartonLabel}
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl transition-colors text-sm font-black shadow-lg shadow-emerald-500/20"
              >
                <Printer size={16} /> {t('print')} ({cartonCopies}) · {labelSize === 'thermal' ? t('labelSizeThermal') : t('labelSizeA4')}
              </button>
            </>
          )}
        </div>
        ) : tab !== 'variants' ? (
        <div className="p-6 flex flex-col items-center gap-4 overflow-y-auto min-h-0">
          {tab === 'barcode' ? (
            <div className="bg-white rounded-xl p-3 flex items-center justify-center w-full">
              <svg ref={barcodeRef} className="max-w-full" />
            </div>
          ) : (
            <div className="bg-white rounded-xl p-4 flex items-center justify-center">
              <canvas ref={qrCanvasRef} />
            </div>
          )}

          {/* Barcode number with copy */}
          <div className="flex items-center gap-2 w-full bg-slate-800 rounded-xl px-4 py-2">
            <p className="flex-1 font-mono text-slate-300 text-sm truncate">{barcodeValue}</p>
            <span className={cn(
              'text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0',
              hasRealBarcode
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-amber-500/15 text-amber-400'
            )}>
              {hasRealBarcode ? t('companyBadge') : t('autoBadge')}
            </span>
            <button onClick={copyBarcode} className="text-slate-500 hover:text-emerald-400 transition-colors">
              {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
            </button>
          </div>

          {/* When there is no real company barcode, tell the shopkeeper this is
              a generated label code and point them to where they can add the
              real one — so it can be scanned at billing. */}
          {!hasRealBarcode && (
            <p className="text-[11px] text-amber-400/90 text-center -mt-1 px-2">
              {t('autoGeneratedHintPrefix')} <span className="font-bold">{t('editProductCompanyBarcode')}</span>.
            </p>
          )}

          {/* Copies to print — defaults to current stock (one sticker per
              unit), always editable: print fewer to just cover a partial
              re-label, or more to get ahead of the next delivery. */}
          <div className="w-full">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              {t('copiesToPrint')} {product.stock !== undefined && <span className="normal-case font-medium text-slate-500">({t('currentStock', { count: Math.max(0, Math.round(product.stock)) })})</span>}
            </label>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPrintQty(q => Math.max(1, q - 1))}
                className="w-9 h-9 shrink-0 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-bold hover:bg-slate-700">–</button>
              <input
                type="number" min={1}
                value={printQty}
                onChange={e => setPrintQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-center font-bold text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button type="button" onClick={() => setPrintQty(q => q + 1)}
                className="w-9 h-9 shrink-0 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-bold hover:bg-slate-700">+</button>
            </div>
          </div>

          {/* Header — two optional lines printed above the product name
              (shop name, address/tagline), separated from it by a rule. */}
          <div className="w-full grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">{t('labelLine1')}</label>
              <input
                type="text"
                value={labelLine1}
                onChange={e => setLabelLine1(e.target.value)}
                placeholder={t('labelLine1Placeholder')}
                maxLength={40}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">{t('labelLine2')}</label>
              <input
                type="text"
                value={labelLine2}
                onChange={e => setLabelLine2(e.target.value)}
                placeholder={t('labelLine2Placeholder')}
                maxLength={40}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Custom text — an optional extra line on the printed label
              (promo note, batch tag, etc.) on top of the name/price already
              shown. */}
          <div className="w-full">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">{t('customLabelText')}</label>
            <input
              type="text"
              value={labelText}
              onChange={e => setLabelText(e.target.value)}
              placeholder={t('customLabelTextPlaceholder')}
              maxLength={60}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Label size — A4 keeps today's popup; Thermal targets an actual
              small-roll label printer with a real physical page size. */}
          <div className="flex bg-slate-800 rounded-xl p-1 w-full">
            {([['a4', t('labelSizeA4')], ['thermal', t('labelSizeThermal')]] as const).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setLabelSize(key)}
                className={cn(
                  'flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors',
                  labelSize === key ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'
                )}>
                {label}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="grid grid-cols-3 gap-2 w-full">
            <button onClick={tab === 'barcode' ? downloadBarcode : downloadQR}
              className="flex flex-col items-center gap-1.5 py-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl hover:bg-emerald-500/20 transition-colors text-xs font-bold">
              <Download size={18} /> {t('download')}
            </button>
            <button onClick={printCode}
              className="flex flex-col items-center gap-1.5 py-3 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-xl hover:bg-blue-500/20 transition-colors text-xs font-bold">
              <Printer size={18} /> {t('print')}{printQty > 1 ? ` ×${printQty}` : ''}
            </button>
            <button onClick={copyBarcode}
              className="flex flex-col items-center gap-1.5 py-3 bg-slate-800 border border-slate-700 text-slate-400 rounded-xl hover:bg-slate-700 transition-colors text-xs font-bold">
              {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
              {copied ? t('copied') : t('copy')}
            </button>
          </div>
        </div>
        ) : (
        <div className="p-4 flex flex-col gap-3 overflow-y-auto min-h-0">
          <p className="text-[11px] text-slate-500 leading-snug">
            {tv('variantBarcodesTitle')} — <span className="text-slate-400">{variantRows.length}</span>
          </p>
          <div className="max-h-[50vh] overflow-y-auto pr-1 -mr-1 flex flex-col gap-2">
            {variantRows.map(row => (
              <div key={row.key} className="bg-slate-800/70 rounded-lg px-3 py-2.5 border border-slate-700/60 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-black text-slate-100 truncate">{row.key}</p>
                  <p className="text-[10px] font-bold text-emerald-400 shrink-0">₹{row.sellingPrice.toLocaleString('en-IN')}</p>
                </div>

                {/* editable — real-world variants often carry a distinct manufacturer barcode */}
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={row.barcode}
                    onChange={e => setVariantBarcode(row.key, e.target.value)}
                    onBlur={saveVariantBarcode}
                    className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    title={t('copy')}
                    onClick={() => { navigator.clipboard.writeText(row.barcode || ''); }}
                    className="shrink-0 text-slate-500 hover:text-emerald-400 p-1.5"
                  >
                    <Copy size={13} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <label className="text-[8px] font-bold text-slate-500 uppercase tracking-wide" title={t('currentStock', { count: row.qty })}>
                      {t('copiesShort')}
                    </label>
                    <input
                      type="number" min={1}
                      value={variantPrintQty[row.key] ?? row.qty}
                      onChange={e => setVariantPrintQty(prev => ({ ...prev, [row.key]: Math.max(1, parseInt(e.target.value) || 1) }))}
                      className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1 text-xs text-center font-bold text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" title={t('download')} onClick={() => downloadOneVariant(row)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-900 transition-colors">
                      <Download size={14} />
                    </button>
                    <button type="button" title={t('print')} onClick={() => printOneVariant(row)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-900 transition-colors">
                      <Printer size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">{t('labelLine1')}</label>
              <input
                type="text"
                value={labelLine1}
                onChange={e => setLabelLine1(e.target.value)}
                placeholder={t('labelLine1Placeholder')}
                maxLength={40}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">{t('labelLine2')}</label>
              <input
                type="text"
                value={labelLine2}
                onChange={e => setLabelLine2(e.target.value)}
                placeholder={t('labelLine2Placeholder')}
                maxLength={40}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">{t('customLabelText')}</label>
            <input
              type="text"
              value={labelText}
              onChange={e => setLabelText(e.target.value)}
              placeholder={t('customLabelTextPlaceholder')}
              maxLength={60}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="flex bg-slate-800 rounded-xl p-1 w-full">
            {([['a4', t('labelSizeA4')], ['thermal', t('labelSizeThermal')]] as const).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setLabelSize(key)}
                className={cn(
                  'flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors',
                  labelSize === key ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'
                )}>
                {label}
              </button>
            ))}
          </div>

          {/* Solid emerald so this reads as the primary action of the tab — the
              earlier dim-blue variant looked disabled on dark backgrounds. */}
          <button
            type="button"
            onClick={printLabelSheet}
            className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl transition-colors text-sm font-black shadow-lg shadow-emerald-500/20"
          >
            <Printer size={16} /> {t('print')} ({variantRows.reduce((sum, row) => sum + (variantPrintQty[row.key] ?? row.qty), 0)}) · {labelSize === 'thermal' ? t('labelSizeThermal') : t('labelSizeA4')}
          </button>
        </div>
        )}
      </div>
    </div>
  );
}
