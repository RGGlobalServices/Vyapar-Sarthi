'use client';
import { useEffect, useRef, useState } from 'react';
import { X, QrCode, Barcode, Download, Printer, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BarcodeQRModalProps {
  product: {
    id: string | number;
    name: string;
    barcode?: string;
    sellingPrice?: number;
    mrp?: number;
    category?: string;
  };
  onClose: () => void;
}

export default function BarcodeQRModal({ product, onClose }: BarcodeQRModalProps) {
  const barcodeRef = useRef<SVGSVGElement>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [tab, setTab] = useState<'barcode' | 'qr'>('barcode');
  const [copied, setCopied] = useState(false);
  const barcodeValue = product.barcode || `PRD-${String(product.id).substring(0, 8).toUpperCase()}`;

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

        {/* Tabs */}
        <div className="flex border-b border-slate-800">
          {(['barcode', 'qr'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn(
                'flex-1 py-3 flex items-center justify-center gap-2 text-sm font-bold transition-colors',
                tab === t ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-slate-500 hover:text-slate-300'
              )}>
              {t === 'barcode' ? <><Barcode size={16} /> Barcode</> : <><QrCode size={16} /> QR Code</>}
            </button>
          ))}
        </div>

        {/* Code display */}
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
            <button onClick={copyBarcode} className="text-slate-500 hover:text-emerald-400 transition-colors">
              {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
            </button>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-3 gap-2 w-full">
            <button onClick={tab === 'barcode' ? downloadBarcode : downloadQR}
              className="flex flex-col items-center gap-1.5 py-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl hover:bg-emerald-500/20 transition-colors text-xs font-bold">
              <Download size={18} /> Download
            </button>
            <button onClick={printCode}
              className="flex flex-col items-center gap-1.5 py-3 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-xl hover:bg-blue-500/20 transition-colors text-xs font-bold">
              <Printer size={18} /> Print
            </button>
            <button onClick={copyBarcode}
              className="flex flex-col items-center gap-1.5 py-3 bg-slate-800 border border-slate-700 text-slate-400 rounded-xl hover:bg-slate-700 transition-colors text-xs font-bold">
              {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
