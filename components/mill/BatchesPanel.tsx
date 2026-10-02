'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useTranslations } from 'next-intl';
import { Factory, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import ProductionRuns from '@/components/mill/ProductionRuns';
import NewBatchModal from '@/components/mill/NewBatchModal';

const fetcher = (u: string) => api.get(u).then((r) => r.data);
const kg = (n: number | null | undefined) => `${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg`;

export type BatchInfo = { id: string; batchNumber: string; inputKg: number; materialName: string; materialProductId: string; lotsText: string };

/** Batches inside Raw Material: plan a batch (one or several lots), start its production later, and see every finished run with its reports. */
export default function BatchesPanel({ onStartBatch }: { onStartBatch: (b: BatchInfo) => void }) {
  const t = useTranslations('Mill');
  const activeShopId = useBusinessStore((s) => s.activeShopId);
  const { mutate: globalMutate } = useSWRConfig();
  const [creating, setCreating] = useState(false);
  const { data: batches = [] } = useSWR<any[]>(activeShopId ? ['/mill/batches', activeShopId] : null, ([u]) => fetcher(u), { revalidateOnFocus: true });
  const open = batches.filter((b) => b.status === 'open' || b.status === 'in_progress');

  const info = (b: any): BatchInfo => {
    const lots: any[] = b.inputLots?.length ? b.inputLots : [];
    const first = lots[0]?.rawMaterialLot || b.rawLot;
    return {
      id: b.id, batchNumber: b.batchNumber, inputKg: Number(b.inputKg) || 0,
      materialName: first?.product?.name || b.rawLot?.product?.name || '',
      materialProductId: first?.product?.id || b.rawLot?.product?.id || '',
      lotsText: lots.length > 1 ? t('bt_lots', { n: lots.length }) : (first?.lotNumber || b.rawLot?.lotNumber || ''),
    };
  };

  const cancel = async (b: any) => {
    if (!window.confirm(t('bt_cancelConfirm'))) return;
    try {
      await api.delete(`/mill/batches/${b.id}`);
      globalMutate((key: any) => Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith('/mill/'), undefined, { revalidate: true });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.response?.data?.error || err?.message || 'Failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-xs text-slate-500 max-w-xl">{t('bt_hint')}</p>
        <button onClick={() => setCreating(true)} data-testid="new-batch" className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold flex items-center gap-1.5 shadow-sm">
          <Plus size={16} /> {t('bt_new')}
        </button>
      </div>

      <section className="space-y-2">
        <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">{t('bt_open')}</h2>
        {open.length === 0 ? (
          <p className="text-sm text-slate-400 py-5 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">{t('bt_none')}</p>
        ) : (
          <div className="grid gap-2">
            {open.map((b) => {
              const i = info(b);
              return (
                <div key={b.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-mono font-black text-sm text-slate-800 dark:text-slate-100">{i.batchNumber}</p>
                    <p className="text-xs text-slate-500 truncate">{i.materialName}{i.lotsText ? ` · ${i.lotsText}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-black text-slate-700 dark:text-slate-200">{kg(i.inputKg)}</span>
                    <button onClick={() => onStartBatch(i)} className="h-9 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm">
                      <Factory size={13} /> {t('bt_start')}
                    </button>
                    <button onClick={() => cancel(b)} title={t('bt_cancel')} className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-red-500 flex items-center justify-center"><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ProductionRuns />
      {creating && <NewBatchModal onClose={() => setCreating(false)} />}
    </div>
  );
}
