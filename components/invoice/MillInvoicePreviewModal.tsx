'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { printBill } from '@/lib/printBill';
import { createPortal } from 'react-dom';
import { Download, Loader2, MessageCircle, Printer, X, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { waitForImages } from '@/lib/waitForImages';
import { buildMillInvoiceData, isMillInvoice, millWhatsAppText, type MillInvoiceShop } from '@/lib/millInvoice';
import MillInvoice from '@/components/invoice/MillInvoice';

const fmtDate = (iso: string): string => {
  try { const d = new Date(iso); return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`; } catch { return ''; }
};

/**
 * Print / PDF / Reprint / WhatsApp for a Mill (mill_v2) invoice. Always loads the STORED invoice from the server
 * (GET /billing/:id) — a Mill invoice is never rebuilt from a client cart or with the legacy billing engine.
 * Used for the "bill saved" screen, the invoice-history preview and the invoice detail page.
 */
export default function MillInvoicePreviewModal({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const { profile } = useBusinessStore();
  const [sale, setSale] = useState<any>(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  // Format is driven entirely by profile settings (A4/Thermal toggle is not shown to the user).
  const variant: 'a4' | 'thermal' = (profile?.invoiceFormat === 'a4' || profile?.invoiceFormat === 'wholesale') && !(typeof window !== 'undefined' && window.innerWidth < 640) ? 'a4' : 'thermal';

  useEffect(() => {
    let cancelled = false;
    setSale(null); setError('');
    api.get(`/billing/${invoiceId}`)
      .then((res) => { if (!cancelled) { if (!isMillInvoice(res.data)) setError('This is not a Mill invoice.'); else setSale(res.data); } })
      .catch((e: any) => { if (!cancelled) setError(e?.response?.data?.detail || e?.message || 'Could not load the invoice.'); });
    return () => { cancelled = true; };
  }, [invoiceId]);

  const shop: MillInvoiceShop = useMemo(() => ({
    name: profile?.shopName || undefined, address: profile?.address || undefined, mobile: profile?.mobile || undefined,
    gst: profile?.gst || undefined, pan: profile?.pan || undefined,
    logoUrl: profile?.logoUrl || undefined, signatureUrl: profile?.signatureUrl || undefined,
    footer: profile?.invoiceFooter || undefined, upiId: profile?.upiId || undefined,
    bankName: profile?.bankName || undefined, bankAccountName: profile?.bankAccountName || undefined,
    bankAccountNumber: profile?.bankAccountNumber || undefined, bankIfsc: profile?.bankIfsc || undefined,
    accentColor: profile?.invoiceColor || null,
  }), [profile]);
  const data = useMemo(() => (sale ? buildMillInvoiceData(sale, shop, fmtDate(sale.created_at)) : null), [sale, shop]);

  const handlePrint = () => { printBill(); };

  const handlePdf = async () => {
    if (!previewRef.current || !data) return;
    setDownloading(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);
      const clone = previewRef.current.cloneNode(true) as HTMLElement;
      clone.style.position = 'fixed'; clone.style.top = '0'; clone.style.left = '-9999px'; clone.style.height = 'auto';
      document.body.appendChild(clone);
      try {
        await waitForImages(clone);
        const canvas = await html2canvas(clone, { scale: 2.2, useCORS: true, backgroundColor: '#ffffff', logging: false });
        const img = canvas.toDataURL('image/jpeg', 0.85);
        if (variant === 'a4') {
          const w = 210; const h = (canvas.height * w) / canvas.width; const pageH = 297;
          const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
          // Multi-page A4: the same tall image is placed at a negative offset on each page — nothing is clipped.
          for (let off = 0, first = true; off < h - 0.5; off += pageH, first = false) {
            if (!first) pdf.addPage();
            pdf.addImage(img, 'JPEG', 0, -off, w, h);
          }
          pdf.save(`${data.invoiceNumber}.pdf`);
        } else {
          const w = 80; const h = (canvas.height * w) / canvas.width;
          const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [w, h] });
          pdf.addImage(img, 'JPEG', 0, 0, w, h);
          pdf.save(`${data.invoiceNumber}.pdf`);
        }
      } finally { document.body.removeChild(clone); }
    } catch (e) {
      console.error(e);
      alert('Could not generate the PDF.');
    } finally { setDownloading(false); }
  };

  const handleWhatsApp = () => {
    if (!data || !sale?.customer_mobile || !data.consistent) return;
    let phone = String(sale.customer_mobile).replace(/\D/g, '');
    if (phone.length === 10) phone = `91${phone}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(millWhatsAppText(data))}`, '_blank');
  };

  const noMobile = !sale?.customer_mobile;
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4" data-testid="mill-invoice-modal">
      <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl w-full max-w-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between gap-2 p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <h2 className="font-black text-slate-900 dark:text-white">Mill Invoice</h2>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-slate-400 hover:text-slate-900 dark:hover:text-white"><X size={20} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-950 p-3">
          {!sale && !error && <div className="py-16 flex justify-center text-slate-500"><Loader2 className="animate-spin" /></div>}
          {error && <p className="py-10 text-center text-red-500 text-sm font-semibold flex items-center justify-center gap-2"><AlertTriangle size={16} /> {error}</p>}
          {data && (
            <div className="flex justify-center">
              <div className="shadow-xl"><MillInvoice ref={previewRef} data={data} variant={variant} /></div>
            </div>
          )}
        </div>


        <div className="p-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-4 gap-2 shrink-0">
          <button onClick={handlePrint} disabled={!data} data-testid="mill-inv-print" className="flex flex-col items-center gap-1 bg-slate-100 dark:bg-slate-800 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 disabled:opacity-50"><Printer size={16} />Print</button>
          <button onClick={handlePdf} disabled={!data || downloading} data-testid="mill-inv-pdf" className="flex flex-col items-center gap-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50">
            {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}PDF
          </button>
          <button onClick={handleWhatsApp} disabled={!data || noMobile || !data.consistent} data-testid="mill-inv-wa"
            title={noMobile ? 'No customer mobile number on this invoice' : undefined}
            className="flex flex-col items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50"><MessageCircle size={16} />WhatsApp</button>
          <button onClick={onClose} className="flex flex-col items-center gap-1 bg-slate-100 dark:bg-slate-800 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300"><X size={16} />Close</button>
        </div>
      </div>
      {/* Print copy: the global print stylesheet shows only #print-area. Portalled to <body> so a long invoice is not
          clipped to one page by this fixed overlay. */}
      {data && typeof document !== 'undefined' && createPortal(
        <div id="print-area" className="hidden print:block bg-white"><MillInvoice data={data} variant={variant} /></div>,
        document.body,
      )}
    </div>
  );
}
