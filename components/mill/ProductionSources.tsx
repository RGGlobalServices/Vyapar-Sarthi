'use client';

import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { Factory, Loader2 } from 'lucide-react';
import { Link } from '@/i18n/routing';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import type { QuickSource } from '@/lib/quickEntry';

const fetcher = (u: string) => api.get(u).then((r) => r.data);
const kg = (n: number) => `${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg`;
const usable = (s: string) => !['BLOCKED', 'FULLY_CONSUMED', 'DISPOSED', 'FULLY_REPROCESSED'].includes(String(s));

type Item = { id: string; title: string; sub: string; kg: number };

function StartButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shrink-0">
      <Factory size={13} /> {label}
    </button>
  );
}

function List({ items, type, onStart, empty }: { items: Item[]; type: QuickSource; onStart: (type: QuickSource, id: string) => void; empty: string }) {
  const t = useTranslations('Mill');
  if (items.length === 0) return <p className="text-sm text-slate-400 py-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">{empty}</p>;
  return (
    <div className="grid gap-2">
      {items.map((i) => (
        <div key={i.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{i.title}</p>
            <p className="text-xs text-slate-500 truncate">{i.sub}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-black text-slate-700 dark:text-slate-200">{kg(i.kg)}</span>
            <StartButton label={t('rm_startProduction')} onClick={() => onStart(type, i.id)} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The other two places production starts from, next to Raw material: the customer's grain on Job Work orders, and WIP / rejected material to reprocess. */
export default function ProductionSources({ view, onStart }: { view: 'job_work' | 'reprocess'; onStart: (type: QuickSource, id: string) => void }) {
  const t = useTranslations('Mill');
  const activeShopId = useBusinessStore((s) => s.activeShopId);
  const { data: jw = [], isLoading: l1 } = useSWR<any[]>(view === 'job_work' && activeShopId ? ['/mill/job-work', activeShopId] : null, ([u]) => fetcher(u));
  const { data: wipData, isLoading: l2 } = useSWR<any>(view === 'reprocess' && activeShopId ? ['/mill/wip?limit=100', activeShopId] : null, ([u]) => fetcher(u));
  const { data: rjData, isLoading: l3 } = useSWR<any>(view === 'reprocess' && activeShopId ? ['/mill/rejections?limit=100', activeShopId] : null, ([u]) => fetcher(u));

  if (l1 || l2 || l3) return <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={22} /></div>;

  if (view === 'job_work') {
    const items: Item[] = jw.filter((j) => j.status === 'received' || j.status === 'processing').map((j) => ({
      id: j.id, title: `${j.orderNumber} · ${j.customer?.name || ''}`, sub: j.materialDescription || '', kg: Number(j.inputWeightKg) || 0,
    }));
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs text-slate-500">{t('rm_jobHint')}</p>
          <Link href={'/job-work' as any} className="text-xs font-bold text-amber-600 hover:underline">+ {t('rm_newJob')}</Link>
        </div>
        <List items={items} type="job_work" onStart={onStart} empty={t('rm_noJob')} />
      </div>
    );
  }

  const wip: Item[] = (wipData?.items || []).filter((w: any) => usable(w.status) && Number(w.availableQuantity) > 0).map((w: any) => ({
    id: w.id, title: `${w.lotNumber} · ${w.product?.name || ''}`, sub: w.batch?.batchNumber ? `from ${w.batch.batchNumber}` : '', kg: Number(w.availableQuantity) || 0,
  }));
  const rj: Item[] = (rjData?.items || []).filter((r: any) => usable(r.status) && Number(r.availableQuantity) > 0).map((r: any) => ({
    id: r.id, title: `${r.lotNumber} · ${r.product?.name || ''}`, sub: r.rejectionReason || (r.batch?.batchNumber ? `from ${r.batch.batchNumber}` : ''), kg: Number(r.availableQuantity) || 0,
  }));
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">{t('rm_reprocessHint')}</p>
      <section className="space-y-2">
        <h3 className="text-xs font-black uppercase tracking-wider text-amber-600">{t('rm_wipTitle')}</h3>
        <List items={wip} type="wip" onStart={onStart} empty={t('rm_noReprocess')} />
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-black uppercase tracking-wider text-rose-600">{t('rm_rejTitle')}</h3>
        <List items={rj} type="rejection" onStart={onStart} empty={t('rm_noReprocess')} />
      </section>
    </div>
  );
}
