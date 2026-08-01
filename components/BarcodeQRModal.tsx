'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { X, QrCode, Barcode, Download, Printer, Copy, Check, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BarcodeQRModalProps {
  product: {
    id: string | number;
    name: string;
    barcode?: string;
    sellingPrice?: number;
    mrp?: number;
    category?: string;
    /** Composite variant key → qty. Keys look like "Blue / 8GB / 128GB". */
    size_variants?: string | Record<string, number>;
    /** Metadata carries per-variant pricing + barcodes under `size_prices`. */
    metadata?: any;
  };
  onClose: () => void;
}

/** Parse a variant sub-map safely from either a JSON string or an object. */
function parseObj(v: any): Record<string, any> {
  if (!v) return {};
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return {}; } }
  return v;
}

export default function BarcodeQRModal({ product, onClose }: BarcodeQRModalProps) {
  const t = useTranslations('BarcodeQRModal');
  const tv = useTranslations('Variants');
  const barcodeRef = useRef<SVGSVGElement>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [tab, setTab] = useState<'barcode' | 'qr' | 'variants'>('barcode');
  const [copied, setCopied] = useState(false);

  // Every variant with its per-variant barcode. Rows without a set barcode
  // fall back to the product-level code so the label sheet still has SOMETHING
  // scannable for that colour/size — better than dropping the row silently.
  const variantRows = useMemo(() => {
    const variants = parseObj(product.size_variants);
    const meta = parseObj(product.metadata);
    const sp = parseObj(meta.size_prices);
    return Object.keys(variants)
      .filter(k => Number(variants[k]) > 0)
      .map(k => {
        const entry = (sp[k] || {}) as any;
        return {
          key: k,
          qty: Number(variants[k]) || 0,
          barcode: (entry.barcode || product.barcode || '').toString(),
          sellingPrice: Number(entry.sellingPrice) || Number(product.sellingPrice) || 0,
          mrp: Number(entry.mrp) || Number(product.mrp) || 0,
        };
      });
  }, [product]);

  // A stored barcode that starts with PRD-/BAR- is a placeholder the system
  // generated when the product was created without a real code — it is NOT a
  // company barcode the shopkeeper entered. Treat those (and blanks) as "no
  // real barcode" so we can label the difference and print a stable auto code.
  const isAutoPlaceholder = (v?: string) => !v || /^(prd|bar)-/i.test(v.trim());
  const hasRealBarcode = !isAutoPlaceholder(product.barcode);
  const barcodeValue = hasRealBarcode
    ? String(product.barcode)
    : `PRD-${String(product.id).substring(0, 8).toUpperCase()}`;

  // Generate barcode using JsBarcode
  useEffect(() => {
    if (tab !== 'barcode' || !barcodeRef.current) return;
    import('jsbarcode').then(({ default: JsBarcode }) => {
      try {
        JsBarcode(barcodeRef.current!, barcodeValue, {
          format: 'CODE128',
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
      a.download = `barcode-${product.name.replace(/\s+/g, '-')}.png`;
      a.click();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function downloadQR() {
    if (!qrCanvasRef.current) return;
    const a = document.createElement('a');
    a.href = qrCanvasRef.current.toDataURL('image/png');
    a.download = `qr-${product.name.replace(/\s+/g, '-')}.png`;
    a.click();
  }

  function copyBarcode() {
    navigator.clipboard.writeText(barcodeValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function printCode() {
    const content = tab === 'barcode'
      ? `<div style="text-align:center;font-family:monospace;padding:20px">
          <p style="font-size:14px;font-weight:bold;margin-bottom:8px">${product.name}</p>
          <img src="${barcodeRef.current ? 'data:image/svg+xml,' + encodeURIComponent(new XMLSerializer().serializeToString(barcodeRef.current)) : ''}" style="max-width:300px" />
          <p style="font-size:12px;margin-top:8px">₹${product.sellingPrice || product.mrp || 0}</p>
         </div>`
      : `<div style="text-align:center;font-family:sans-serif;padding:20px">
          <p style="font-size:14px;font-weight:bold;margin-bottom:8px">${product.name}</p>
          <img src="${qrCanvasRef.current?.toDataURL('image/png') || ''}" style="width:200px;height:200px" />
          <p style="font-size:12px;margin-top:8px">₹${product.sellingPrice || product.mrp || 0}</p>
         </div>`;

    const win = window.open('', '_blank', 'width=400,height=500');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><body>${content}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
  }

  // Print an A4 label sheet — one card per variant, 3 per row, ready for a
  // shop scissors-and-glue label roll or a thermal-label printer that likes
  // per-page cuts. Each label carries the variant barcode rendered by
  // JsBarcode as inline SVG (so the print dialog sees vectors, not screenshots).
  async function printLabelSheet() {
    if (!variantRows.length) return;
    const { default: JsBarcode } = await import('jsbarcode');
    // Render every barcode into a headless SVG string so the print window
    // gets clean vector labels instead of blurry canvas snapshots.
    const labels = variantRows.map(row => {
      const svgTmp = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      try {
        JsBarcode(svgTmp, row.barcode, {
          format: 'CODE128', width: 1.6, height: 44, displayValue: true,
          fontSize: 10, fontOptions: 'bold', margin: 4, background: '#ffffff', lineColor: '#0f172a',
        });
      } catch { /* skip unrenderable code */ }
      const svgStr = new XMLSerializer().serializeToString(svgTmp);
      const price = row.sellingPrice > 0 ? `₹${row.sellingPrice.toLocaleString('en-IN')}` : (row.mrp > 0 ? `MRP ₹${row.mrp.toLocaleString('en-IN')}` : '');
      return `
        <div class="lbl">
          <div class="lbl-name">${product.name}</div>
          <div class="lbl-variant">${row.key}</div>
          <div class="lbl-barcode">${svgStr}</div>
          <div class="lbl-foot">
            <span>${price}</span>
            <span class="lbl-qty">×${row.qty}</span>
          </div>
        </div>`;
    }).join('');

    const html = `<!doctype html><html><head><title>${product.name} — Labels</title>
      <style>
        @page { size: A4; margin: 8mm; }
        * { box-sizing: border-box; }
        body { font-family: Helvetica, Arial, sans-serif; margin: 0; color: #0f172a; }
        .sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; padding: 2mm; }
        .lbl {
          border: 0.4mm dashed #94a3b8;
          border-radius: 2mm;
          padding: 3mm 3mm 2.5mm;
          break-inside: avoid;
          text-align: center;
          background: #fff;
        }
        .lbl-name    { font-size: 10px; font-weight: 800; line-height: 1.15; margin-bottom: 1mm;
                        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .lbl-variant { font-size: 9px; font-weight: 700; color: #6366f1; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 1mm; }
        .lbl-barcode svg { max-width: 100%; height: auto; }
        .lbl-foot    { display: flex; justify-content: space-between; align-items: center; font-size: 10px; font-weight: 700; margin-top: 0.5mm; }
        .lbl-qty     { color: #64748b; font-weight: 600; }
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

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-800/30">
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
        <div className="flex border-b border-slate-800">
          {(['barcode', 'qr', ...(variantRows.length > 0 ? ['variants' as const] : [])] as const).map(tabKey => (
            <button key={tabKey} onClick={() => setTab(tabKey)}
              className={cn(
                'flex-1 py-3 flex items-center justify-center gap-2 text-sm font-bold transition-colors',
                tab === tabKey ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-slate-500 hover:text-slate-300'
              )}>
              {tabKey === 'barcode' ? <><Barcode size={16} /> {t('barcodeTab')}</>
                : tabKey === 'qr' ? <><QrCode size={16} /> {t('qrCodeTab')}</>
                : <><LayoutGrid size={16} /> {tv('variantBarcodesTitle')} · {variantRows.length}</>}
            </button>
          ))}
        </div>

        {/* Code display */}
        {tab !== 'variants' ? (
        <div className="p-6 flex flex-col items-center gap-4">
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

          {/* Actions */}
          <div className="grid grid-cols-3 gap-2 w-full">
            <button onClick={tab === 'barcode' ? downloadBarcode : downloadQR}
              className="flex flex-col items-center gap-1.5 py-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl hover:bg-emerald-500/20 transition-colors text-xs font-bold">
              <Download size={18} /> {t('download')}
            </button>
            <button onClick={printCode}
              className="flex flex-col items-center gap-1.5 py-3 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-xl hover:bg-blue-500/20 transition-colors text-xs font-bold">
              <Printer size={18} /> {t('print')}
            </button>
            <button onClick={copyBarcode}
              className="flex flex-col items-center gap-1.5 py-3 bg-slate-800 border border-slate-700 text-slate-400 rounded-xl hover:bg-slate-700 transition-colors text-xs font-bold">
              {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
              {copied ? t('copied') : t('copy')}
            </button>
          </div>
        </div>
        ) : (
        <div className="p-4 flex flex-col gap-3">
          <p className="text-[11px] text-slate-500 leading-snug">
            {tv('variantBarcodesTitle')} — <span className="text-slate-400">{variantRows.length}</span>
          </p>
          <div className="max-h-[45vh] overflow-y-auto pr-1 -mr-1 flex flex-col gap-1.5">
            {variantRows.map(row => (
              <div key={row.key} className="flex items-center gap-2 bg-slate-800/70 rounded-lg px-3 py-2 border border-slate-700/60">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black text-slate-100 truncate">{row.key}</p>
                  <p className="text-[10px] font-mono text-slate-400 truncate">{row.barcode || '—'}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] font-bold text-emerald-400">₹{row.sellingPrice.toLocaleString('en-IN')}</p>
                  <p className="text-[9px] text-slate-500">×{row.qty}</p>
                </div>
                <button
                  type="button"
                  title={t('copy')}
                  onClick={() => { navigator.clipboard.writeText(row.barcode || ''); }}
                  className="text-slate-500 hover:text-emerald-400 p-1"
                >
                  <Copy size={13} />
                </button>
              </div>
            ))}
          </div>
          {/* Solid emerald so this reads as the primary action of the tab — the
              earlier dim-blue variant looked disabled on dark backgrounds. */}
          <button
            type="button"
            onClick={printLabelSheet}
            className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl transition-colors text-sm font-black shadow-lg shadow-emerald-500/20"
          >
            <Printer size={16} /> {t('print')} · A4
          </button>
        </div>
        )}
      </div>
    </div>
  );
}
