'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { X, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { parseSizeVariantsMap, cleanVariants, variantKeyOf, variantLabel } from '@/lib/variants';
import { lotLabel } from '@/lib/lots';

type ProductLike = {
  id: string | number; name?: string;
  cost?: any; costPrice?: any; wholesaleCost?: any; sellingPrice?: any; selling_price?: any;
  size_variants?: any; variants?: any;
};

/**
 * "New lot / Stock in": the same product came again (maybe at a new price). Creates a lot with its own
 * lot no., qty, cost, selling price and expiry. Older lots are left exactly as they are — billing then lists
 * each lot separately and sells the old one first at its own price.
 */
export default function NewLotModal({
  product, onClose, onDone, requestConfig,
}: { product: ProductLike; onClose: () => void; onDone: () => void; requestConfig?: any }) {
  const pid = String(product.id);
  const variantKeys = useMemo(() => {
    const fromMap = Object.keys(parseSizeVariantsMap(product.size_variants));
    const fromRows = cleanVariants(product.variants).map((r) => variantKeyOf(r));
    return Array.from(new Set([...fromMap, ...fromRows])).filter(Boolean);
  }, [product.size_variants, product.variants]);

  const [lotNo, setLotNo] = useState('');
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState(String(Number(product.costPrice ?? product.cost ?? product.wholesaleCost) || ''));
  const [price, setPrice] = useState(String(Number(product.sellingPrice ?? product.selling_price) || ''));
  const [expiry, setExpiry] = useState('');
  const [variantKey, setVariantKey] = useState(variantKeys[0] || '');
  const [updateShelf, setUpdateShelf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lots, setLots] = useState<any[] | null>(null);

  useEffect(() => {
    api.get(`/products/${pid}/batches`, requestConfig).then((r) => setLots(Array.isArray(r.data) ? r.data : [])).catch(() => setLots([]));
  }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) { toast.error('Enter the quantity that came'); return; }
    setSaving(true);
    try {
      await api.post(`/products/${pid}/batches`, {
        batchNumber: lotNo.trim() || undefined,
        quantity: q,
        costPrice: Number(cost) || undefined,
        sellingPrice: Number(price) || undefined,
        expiryDate: expiry || undefined,
        variantKey: variantKeys.length ? variantKey : undefined,
        updateShelfPrice: updateShelf,
      }, requestConfig);
      toast.success('New lot added');
      onDone();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || 'Could not add the lot');
    } finally { setSaving(false); }
  };

  const inp = 'w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500';
  const lbl = 'block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1';

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[100dvh] sm:max-h-[92dvh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="font-black text-lg text-slate-900 dark:text-white">New lot / Stock in</h2>
            <p className="text-xs text-slate-500 truncate">{product.name}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          {lots && lots.length > 0 && (
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Lots in stock now (they stay as they are)</p>
              <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-0.5">
                {lots.slice(0, 6).map((l) => (
                  <li key={l.id}><b>{lotLabel(l)}</b> · {l.quantity} left{Number(l.sellingPrice) > 0 ? ` · ₹${Number(l.sellingPrice).toLocaleString('en-IN')}` : ''}{l.variantKey ? ` · ${variantLabel(l.variantKey)}` : ''}</li>
                ))}
              </ul>
            </div>
          )}

          {variantKeys.length > 0 && (
            <div>
              <label className={lbl}>Size / colour this lot is for *</label>
              <select className={inp} value={variantKey} onChange={(e) => setVariantKey(e.target.value)}>
                {variantKeys.map((k) => <option key={k} value={k}>{variantLabel(k)}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Lot / Batch no.</label>
              <input className={inp} value={lotNo} onChange={(e) => setLotNo(e.target.value)} placeholder="auto if empty" />
            </div>
            <div>
              <label className={lbl}>Quantity *</label>
              <input className={inp} type="number" min="0" step="any" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
            </div>
            <div>
              <label className={lbl}>Cost price (₹)</label>
              <input className={inp} type="number" min="0" step="any" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Selling price (₹)</label>
              <input className={inp} type="number" min="0" step="any" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className={lbl}>Expiry (optional)</label>
              <input className={inp} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </div>
          </div>

          <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={updateShelf} onChange={(e) => setUpdateShelf(e.target.checked)} />
            <span>Also change the product&apos;s own price to this selling price <span className="text-slate-400">(old lots keep their old price either way)</span></span>
          </label>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">Cancel</button>
          <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl text-sm font-bold bg-emerald-500 text-slate-900 hover:bg-emerald-400 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 size={15} className="animate-spin" />} Add lot
          </button>
        </div>
      </form>
    </div>
  );
}
