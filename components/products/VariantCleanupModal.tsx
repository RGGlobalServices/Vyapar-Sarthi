'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { X, Loader2, Wrench, Layers } from 'lucide-react';
import api from '@/lib/api';

type DriftItem = { id: string; name: string; currentStock: number; sumVariants: number; sumSizeMap: number; issues: string[]; proposedStock: number; variantCount: number; totalMismatch: boolean };
type MergeGroup = { baseName: string; totalStock: number; items: Array<{ id: string; name: string; stock: number; size: string; color: string }> };

/**
 * "Check variants" — dry-run report first, nothing changes until the shopkeeper ticks items and confirms.
 *  1. Stock mismatch: variant quantities differ between screens / from the product total -> re-sync.
 *  2. Same model listed many times ("K BEAUTY 7273 32X34 …", "… 32X36 …") -> merge into ONE product with variants.
 * Old values are logged; merged-away products are archived (recoverable), never deleted.
 */
export default function VariantCleanupModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [drift, setDrift] = useState<DriftItem[]>([]);
  const [merges, setMerges] = useState<MergeGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [pickDrift, setPickDrift] = useState<Set<string>>(new Set());
  const [pickMerge, setPickMerge] = useState<Set<string>>(new Set());
  const [alignTotal, setAlignTotal] = useState<Set<string>>(new Set());
  // In-modal confirmation (window.confirm is silently blocked in embedded/desktop browsers).
  const [confirming, setConfirming] = useState<null | 'fix' | 'merge'>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/products/variant-audit');
      const d: DriftItem[] = res.data?.drift || [];
      const m: MergeGroup[] = res.data?.merges || [];
      setDrift(d); setMerges(m); setTotal(res.data?.totalProducts || 0);
      setPickDrift(new Set(d.map((x) => x.id)));
      setPickMerge(new Set());
      setAlignTotal(new Set());
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Could not check products');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const toggle = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const n = new Set(set); n.has(key) ? n.delete(key) : n.add(key); setter(n);
  };

  const fixDrift = async () => {
    if (!pickDrift.size) return;
    setConfirming(null);
    setBusy(true);
    try {
      const res = await api.post('/products/variant-audit', { action: 'resync', ids: [...pickDrift], alignTotalIds: [...alignTotal].filter((id) => pickDrift.has(id)) });
      toast.success(`${res.data?.fixed || 0} product(s) fixed`);
      onDone(); await load();
    } catch (e: any) { toast.error(e?.response?.data?.detail || 'Fix failed'); } finally { setBusy(false); }
  };

  const doMerge = async () => {
    const groups = merges.filter((g) => pickMerge.has(g.baseName)).map((g) => ({ baseName: g.baseName, ids: g.items.map((i) => i.id) }));
    if (!groups.length) return;
    setConfirming(null);
    setBusy(true);
    try {
      const res = await api.post('/products/variant-audit', { action: 'merge', groups });
      if (res.data?.errors?.length) toast.error(res.data.errors[0]);
      toast.success(`${res.data?.merged || 0} product(s) merged`);
      onDone(); await load();
    } catch (e: any) { toast.error(e?.response?.data?.detail || 'Merge failed'); } finally { setBusy(false); }
  };

  const box = 'rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900';

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl max-h-[100dvh] sm:max-h-[92dvh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="font-black text-lg text-slate-900 dark:text-white">Check size / colour stock</h2>
            <p className="text-xs text-slate-500">Nothing changes until you tick items and confirm.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto p-4 space-y-5">
          {loading ? (
            <div className="py-12 flex justify-center text-slate-500"><Loader2 className="animate-spin" /></div>
          ) : (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300">Checked <b>{total}</b> products.</p>

              <section className={`${box} p-3 space-y-2`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2"><Wrench size={15} className="text-amber-500" /> Stock numbers that do not match ({drift.length})</p>
                  <button onClick={() => setConfirming('fix')} disabled={busy || !pickDrift.size} className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-900 text-xs font-bold disabled:opacity-50">Fix selected ({pickDrift.size})</button>
                </div>
                {drift.length === 0 && <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">All good — every product&apos;s size/colour stock adds up.</p>}
                {drift.map((d) => (
                  <label key={d.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                    <input type="checkbox" className="mt-1" checked={pickDrift.has(d.id)} onChange={() => toggle(pickDrift, d.id, setPickDrift)} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{d.name}</p>
                      <p className="text-[11px] text-slate-500">Product total {d.currentStock} · sizes/colours add up to {d.proposedStock} ({d.variantCount} variants)</p>
                      <ul className="text-[11px] text-amber-700 dark:text-amber-400 list-disc ml-4">{d.issues.map((i) => <li key={i}>{i}</li>)}</ul>
                      {d.totalMismatch && (
                        <span className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={alignTotal.has(d.id)} onChange={() => toggle(alignTotal, d.id, setAlignTotal)} />
                          Also change the product total to {d.proposedStock} <span className="text-slate-400">(leave unticked if the extra stock is real — then assign it to sizes in Edit)</span>
                        </span>
                      )}
                    </div>
                  </label>
                ))}
              </section>

              <section className={`${box} p-3 space-y-2`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2"><Layers size={15} className="text-violet-500" /> Same product listed many times ({merges.length})</p>
                  <button onClick={() => setConfirming('merge')} disabled={busy || !pickMerge.size} className="px-3 py-1.5 rounded-lg bg-violet-500 text-white text-xs font-bold disabled:opacity-50">Merge selected ({pickMerge.size})</button>
                </div>
                {merges.length === 0 && <p className="text-xs text-slate-500">No products found that look like one model split into many.</p>}
                {merges.map((g) => (
                  <label key={g.baseName} className="flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                    <input type="checkbox" className="mt-1" checked={pickMerge.has(g.baseName)} onChange={() => toggle(pickMerge, g.baseName, setPickMerge)} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{g.baseName} <span className="text-[11px] font-medium text-slate-500">— {g.items.length} products, {g.totalStock} pcs</span></p>
                      <p className="text-[11px] text-slate-500">{g.items.map((i) => `${i.color ? i.color + ' · ' : ''}${i.size} (${i.stock})`).join(' | ')}</p>
                    </div>
                  </label>
                ))}
              </section>
            </>
          )}
        </div>

        {confirming && (
          <div className="border-t border-slate-200 dark:border-slate-800 p-4 bg-amber-50 dark:bg-amber-500/10 space-y-2">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {confirming === 'fix'
                ? `Fix the size/colour lists of ${pickDrift.size} product(s)? Product totals stay as they are unless you ticked "Also change the product total". Old values are saved in the activity log.`
                : `Merge ${pickMerge.size} group(s) into single products with size/colour variants? The extra products are archived (recoverable from Trash); bills already made are not changed.`}
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirming(null)} className="px-4 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm font-bold">Cancel</button>
              <button onClick={confirming === 'fix' ? fixDrift : doMerge} className="px-4 py-1.5 rounded-lg bg-emerald-500 text-slate-900 text-sm font-bold">Yes, apply</button>
            </div>
          </div>
        )}
        {busy && <div className="border-t border-slate-200 dark:border-slate-800 p-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><Loader2 size={16} className="animate-spin" /> Working... this can take a little while on a slow connection.</div>}
      </div>
    </div>
  );
}
