'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useTranslations } from 'next-intl';
import { Loader2, X } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import ModalPortal from '@/components/mill/ModalPortal';
import RawLotPicker from '@/components/mill/RawLotPicker';

const fetcher = (u: string) => api.get(u).then((r) => r.data);
const inputCls = 'w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-sm focus:ring-2 focus:ring-emerald-500 outline-none';
const labelCls = 'block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1';

/** Plan a batch: one raw material, one or several of its lots with a weight each. Production is started on it later. */
export default function NewBatchModal({ onClose, onCreated, initialLotId, lotsHint }: { onClose: () => void; onCreated?: () => void; initialLotId?: string; lotsHint?: any[] }) {
  const t = useTranslations('Mill');
  const activeShopId = useBusinessStore((s) => s.activeShopId);
  const { mutate: globalMutate } = useSWRConfig();
  // the page that opened this already has the lots — use them at once instead of waiting for another request
  const { data: fetched = [] } = useSWR<any[]>(activeShopId && !lotsHint?.length ? ['/mill/raw-lots?status=available', activeShopId] : null, ([u]) => fetcher(u));
  const lots: any[] = lotsHint?.length ? lotsHint : fetched;
  const [sel, setSel] = useState<Record<string, string>>({});
  // opened from a lot / material card: that lot is already ticked (once the lots have loaded)
  const applied = useRef(false);
  useEffect(() => {
    if (!initialLotId || applied.current) return;
    const l = lots.find((x) => x.id === initialLotId);
    if (l) { applied.current = true; setSel({ [l.id]: String(Math.round(Number(l.availableKg ?? l.remainingQuantity ?? 0) * 1000) / 1000) }); }
  }, [lots, initialLotId]);
  const [batchNumber, setBatchNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const entries = Object.entries(sel).filter(([, v]) => Number(v) > 0);
  const total = entries.reduce((s, [, v]) => s + Number(v), 0);

  const create = async () => {
    if (!entries.length) { setError(t('bt_pickLots')); return; }
    setSaving(true); setError('');
    try {
      const productId = lots.find((l) => l.id === entries[0][0])?.productId || undefined;
      await api.post('/mill/batches', {
        inputLots: entries.map(([id, v]) => ({ rawMaterialLotId: id, quantity: Number(v), unit: 'kg' })),
        inputKg: Math.round(total * 1000) / 1000,
        productId,
        stages: ['Production'],
        batchNumber: batchNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      globalMutate((key: any) => Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith('/mill/'), undefined, { revalidate: true });
      onCreated?.();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('bt_failed'));
    } finally { setSaving(false); }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4">
        <div className="bg-white dark:bg-slate-900 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[96dvh] flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-900 dark:text-white">{t('bt_newTitle')}</h2>
            <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
          </div>
          <div className="p-5 space-y-4 overflow-y-auto">
            <RawLotPicker lots={lots} selected={sel} onChange={(s) => { setSel(s); setError(''); }} inputCls={inputCls} labelCls={labelCls} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block"><span className={labelCls}>{t('bt_number')}</span><input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} maxLength={40} className={inputCls} /></label>
              <label className="block"><span className={labelCls}>{t('bt_notes')}</span><input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} className={inputCls} /></label>
            </div>
          </div>
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
            {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="h-11 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-bold">{t('qp_cancel')}</button>
              <button type="button" onClick={create} disabled={saving || !entries.length}
                className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-black flex items-center justify-center gap-2">
                {saving ? <><Loader2 size={16} className="animate-spin" /> {t('bt_creating')}</> : t('bt_create')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
