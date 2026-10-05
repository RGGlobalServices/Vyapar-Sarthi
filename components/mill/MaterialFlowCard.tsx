'use client';

import { Wheat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

export const kg = (n: number | null | undefined) => `${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg`;

function FlowStat({ label, value, tone = 'slate', hint }: { label: string; value: string; tone?: 'slate' | 'amber' | 'emerald' | 'rose' | 'blue' | 'violet'; hint?: string }) {
  const map = {
    slate: 'text-slate-800 dark:text-slate-100', amber: 'text-amber-600 dark:text-amber-400', emerald: 'text-emerald-600 dark:text-emerald-400',
    rose: 'text-rose-600 dark:text-rose-400', blue: 'text-blue-600 dark:text-blue-400', violet: 'text-violet-600 dark:text-violet-400',
  };
  return (
    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cn('text-base font-black font-mono mt-0.5', map[tone])}>{value}</p>
      {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

/** One customer's whole job: grain given -> finished / by-products / waste, plus what the linked batches hold in WIP / rejected / reprocessing. */
export default function MaterialFlowCard({ flow }: { flow: any }) {
  const t = useTranslations('JobWork');
  if (!flow) return null;
  const jw = flow.jobWork;
  const b = flow.batches;
  const bp = Object.entries(jw.byProductBreakdown || {}) as [string, number][];
  return (
    <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Wheat size={16} className="text-amber-500" />
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">{t('flowTitle')}</h3>
        </div>
        <span className="text-[11px] font-semibold text-slate-400">
          {t('flowOrders', { orders: jw.orders, received: jw.byStatus.received, processing: jw.byStatus.processing, done: jw.byStatus.completed + jw.byStatus.delivered })}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <FlowStat label={t('flowRawMaterial')} value={kg(jw.receivedKg)} tone="amber" />
        <FlowStat label={t('flowStillToProcess')} value={kg(jw.pendingKg)} tone="blue" hint={t('flowStillToProcessHint')} />
        <FlowStat label={t('flowFinishedMaterial')} value={kg(jw.finishedKg)} tone="emerald" hint={jw.yieldPct != null ? t('flowYieldHint', { pct: jw.yieldPct }) : undefined} />
        <FlowStat label={t('flowByProductsKept')} value={kg(jw.byProductKeptKg)} tone="violet" hint={bp.length ? bp.map(([n, q]) => `${n} ${kg(q)}`).join(' · ') : t('flowDefaultByProduct')} />
        <FlowStat label={t('flowWasteLoss')} value={kg(jw.wasteKg)} tone="rose" hint={t('flowWasteLossHint')} />
        <FlowStat label={t('flowBatchesLinked')} value={String(b.count)} />
      </div>

      {b.count > 0 && (
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-500 mb-2">{t('flowBatchesSection', { count: b.count })}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <FlowStat label={t('flowProcessedInBatches')} value={kg(b.inputKg)} />
            <FlowStat label={t('flowFinishedGoods')} value={kg(b.finishedKg)} tone="emerald" />
            <FlowStat label={t('flowWip')} value={kg(b.wipKg)} tone="blue" hint={t('flowWipHint')} />
            <FlowStat label={t('flowRejected')} value={kg(b.rejectedKg)} tone="rose" hint={t('flowRejectedHint', { open: kg(b.rejectedOpenKg) })} />
            <FlowStat label={t('flowReprocessed')} value={kg(b.reprocessedKg)} tone="violet" hint={t('flowReprocessedHint')} />
            <FlowStat label={t('flowBatchWastage')} value={kg(b.wastageKg)} tone="rose" />
            <FlowStat label={t('flowByProductLots')} value={kg(b.byProductKg)} tone="violet" hint={t('flowByProductLotsHint', { bran: kg(b.branKg), husk: kg(b.huskKg), broken: kg(b.brokenKg) })} />
          </div>
        </div>
      )}
      {b.count === 0 && (
        <p className="text-[11px] text-slate-400">{t('flowNoBatches')}</p>
      )}
    </div>
  );
}
