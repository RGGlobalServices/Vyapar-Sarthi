'use client';

import { useMemo, useState } from 'react';
import { X, RotateCcw, Loader2, Download, Share2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useBusinessStore } from '@/lib/businessStore';
import { generatePurchaseReturnPdfBlob } from '@/lib/pdf/purchaseReturn';
import { shareFileOrText } from '@/lib/shareUtils';
import { saveOrShareBlob } from '@/lib/nativeSave';

const num = (s: string): number => {
  const n = Number((s ?? '').toString().trim());
  return Number.isFinite(n) ? n : 0;
};

/** "<productId>::<variantKey>" — same composite key the return API uses to
 *  pool a product+variant across purchase lines and across prior returns. */
const rowKey = (productId: string, variantKey?: string | null) => `${productId}::${variantKey || ''}`;

interface ReturnLine {
  key: string;
  productId: string;
  variantKey: string | null;
  unit: string | null;
  remaining: number;
  nameText: string;
  qtyText: string;
  rateText: string;
}

export default function PurchaseReturnModal({
  invoice,
  onClose,
  onSaved,
}: {
  invoice: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useBusinessStore();

  const initialLines = useMemo<ReturnLine[]>(() => {
    // Purchase lines for the SAME product+variant pool together (matches
    // the server's own rowKey grouping) — a shopkeeper returns "this
    // product/size", not one specific historical line entry.
    const originals = new Map<string, { productId: string; variantKey: string | null; name: string; unit: string | null; qty: number; rate: number }>();
    for (const item of invoice.purchaseItems || []) {
      const k = rowKey(item.productId, item.variantKey);
      const existing = originals.get(k);
      if (existing) { existing.qty += item.quantity; continue; }
      originals.set(k, {
        productId: item.productId,
        variantKey: item.variantKey || null,
        name: item.product?.name || 'Item',
        unit: item.product?.baseUnit || null,
        qty: item.quantity,
        rate: item.cost,
      });
    }
    const alreadyReturned = new Map<string, number>();
    for (const ret of invoice.purchaseReturns || []) {
      for (const it of ret.items || []) {
        const k = rowKey(it.productId, it.variantKey);
        alreadyReturned.set(k, (alreadyReturned.get(k) || 0) + it.quantity);
      }
    }
    return [...originals.entries()].map(([key, o]) => {
      const remaining = Math.max(0, o.qty - (alreadyReturned.get(key) || 0));
      return {
        key,
        productId: o.productId,
        variantKey: o.variantKey,
        unit: o.unit,
        remaining,
        nameText: o.name + (o.variantKey ? ` (${o.variantKey})` : ''),
        // Defaults to the full remaining quantity — most returns are for
        // everything still outstanding on a line; the shopkeeper edits down
        // for a partial return rather than typing a full quantity from zero.
        qtyText: String(remaining),
        rateText: String(o.rate),
      };
    });
  }, [invoice]);

  const [lines, setLines] = useState<ReturnLine[]>(initialLines);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<{ returnNumber: string; totalAmount: number; blob: Blob; filename: string } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  function updateLine(key: string, patch: Partial<ReturnLine>) {
    setLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));
  }

  const total = lines.reduce((sum, l) => sum + Math.max(0, num(l.qtyText)) * num(l.rateText), 0);
  const activeLines = lines.filter(l => num(l.qtyText) > 0);

  async function handleSave() {
    if (!activeLines.length) { setError('Set a quantity greater than 0 for at least one item.'); return; }
    for (const l of activeLines) {
      if (num(l.qtyText) > l.remaining) {
        setError(`"${l.nameText}" — only ${l.remaining} left to return.`);
        return;
      }
      if (num(l.rateText) < 0) { setError(`Rate cannot be negative ("${l.nameText}").`); return; }
    }
    setError('');
    setSaving(true);
    try {
      const res = await api.post(`/purchases/${invoice.id}/return`, {
        items: activeLines.map(l => ({
          productId: l.productId,
          variantKey: l.variantKey,
          name: l.nameText,
          quantity: num(l.qtyText),
          rate: num(l.rateText),
        })),
      });
      const created = res.data?.purchaseReturn;
      const { blob, filename } = await generatePurchaseReturnPdfBlob({
        shop: {
          name: profile.shopName || 'Vyapar Sarthi',
          address: profile.address || null,
          mobile: profile.mobile || null,
          gst: profile.gst || null,
          pan: profile.pan || null,
        },
        supplierName: invoice.supplier?.name || 'Supplier',
        returnNumber: created?.returnNumber || 'RETURN',
        date: created?.date || new Date(),
        originalInvoiceNumber: invoice.invoiceNumber || invoice.id,
        items: activeLines.map(l => ({
          name: l.nameText,
          quantity: num(l.qtyText),
          rate: num(l.rateText),
          amount: num(l.qtyText) * num(l.rateText),
        })),
        totalAmount: created?.totalAmount ?? total,
      });
      setSaved({ returnNumber: created?.returnNumber || 'RETURN', totalAmount: created?.totalAmount ?? total, blob, filename });
      toast.success('Purchase return saved');
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Could not save this return');
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload() {
    if (!saved) return;
    setDownloading(true);
    try {
      const handledNatively = await saveOrShareBlob(saved.blob, saved.filename);
      if (!handledNatively) {
        const url = URL.createObjectURL(saved.blob);
        const a = document.createElement('a');
        a.href = url; a.download = saved.filename;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      }
    } finally {
      setDownloading(false);
    }
  }

  async function handleShare() {
    if (!saved) return;
    setSharing(true);
    try {
      const file = new File([saved.blob], saved.filename, { type: 'application/pdf' });
      const msgLines = [
        `*Purchase Return — ${saved.returnNumber}*`,
        `From: ${profile.shopName || 'Vyapar Sarthi'}`,
        `Against Invoice: ${invoice.invoiceNumber || invoice.id}`,
        `*Return Amount: ₹${saved.totalAmount.toLocaleString('en-IN')}*`,
      ].join('\n');
      const shared = await shareFileOrText(file, msgLines, `Purchase Return ${saved.returnNumber}`);
      if (!shared) {
        const phone = (invoice.supplier?.mobile || '').replace(/[^0-9]/g, '');
        const waNum = phone.length === 10 ? `91${phone}` : phone.length > 10 ? phone : '';
        const encoded = encodeURIComponent(msgLines);
        window.open(waNum ? `https://api.whatsapp.com/send?phone=${waNum}&text=${encoded}` : `https://wa.me/?text=${encoded}`, '_blank');
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 border border-slate-200 dark:border-slate-800">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <RotateCcw className="text-orange-500" size={18} /> Return to Supplier
          </h2>
          <button onClick={onClose} className="p-2 -mr-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 rounded-full transition-colors">
            <X size={18} />
          </button>
        </div>

        {saved ? (
          <div className="p-6 space-y-4">
            <div className="rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-500/10 p-4 flex items-start gap-3">
              <CheckCircle2 className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" size={20} />
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">Return {saved.returnNumber} saved</p>
                <p className="text-xs text-slate-500 mt-0.5">₹{saved.totalAmount.toLocaleString('en-IN')} · stock, supplier balance and this purchase are updated.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="h-11 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Download PDF
              </button>
              <button
                type="button"
                onClick={handleShare}
                disabled={sharing}
                className="h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {sharing ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />} Share
              </button>
            </div>
            <button type="button" onClick={onClose} className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-600 dark:text-slate-300">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="p-6 overflow-y-auto space-y-3">
              <p className="text-xs text-slate-500">
                Pick what's going back to <b>{invoice.supplier?.name}</b> from Invoice {invoice.invoiceNumber || invoice.id}. Set a quantity to 0 to leave an item out.
              </p>
              {lines.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-6">This invoice has no items to return.</p>
              )}
              {lines.map(l => {
                const qty = num(l.qtyText);
                const over = qty > l.remaining;
                const amount = Math.max(0, qty) * num(l.rateText);
                return (
                  <div key={l.key} className={`rounded-xl border p-3 space-y-2 ${l.remaining <= 0 ? 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 opacity-60' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40'}`}>
                    <input
                      type="text"
                      value={l.nameText}
                      onChange={(e) => updateLine(l.key, { nameText: e.target.value })}
                      className="w-full bg-transparent text-sm font-bold outline-none border-b border-dashed border-slate-300 dark:border-slate-700 pb-1"
                    />
                    <p className="text-[10px] text-slate-500">Purchased qty remaining to return: <b>{l.remaining}</b>{l.unit ? ` ${l.unit}` : ''}</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Return Qty</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={l.qtyText}
                          onChange={(e) => updateLine(l.key, { qtyText: e.target.value })}
                          disabled={l.remaining <= 0}
                          className={`w-full h-9 px-2 rounded-lg text-sm font-semibold text-center border outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed ${over ? 'border-red-400 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'}`}
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Rate ₹</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={l.rateText}
                          onChange={(e) => updateLine(l.key, { rateText: e.target.value })}
                          className="w-full h-9 px-2 rounded-lg text-sm font-semibold text-center border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Amount</label>
                        <div className="w-full h-9 px-2 rounded-lg text-sm font-bold flex items-center justify-center border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                          ₹{amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>
                    {over && (
                      <p className="text-[11px] text-red-600 dark:text-red-400 flex items-center gap-1">
                        <AlertTriangle size={12} /> Only {l.remaining} left to return.
                      </p>
                    )}
                  </div>
                );
              })}
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            </div>
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Return</p>
                <p className="text-lg font-bold text-orange-600 dark:text-orange-400">₹{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
              </div>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !lines.length}
                className="px-5 h-11 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-60"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />} Save Return
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
