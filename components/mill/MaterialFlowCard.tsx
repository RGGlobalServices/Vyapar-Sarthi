'use client';

import { Wheat } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  if (!flow) return null;
  const jw = flow.jobWork;
  const b = flow.batches;
  const bp = Object.entries(jw.byProductBreakdown || {}) as [string, number][];
  return (
    <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Wheat size={16} className="text-amber-500" />
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">Material Flow — Job Work Summary</h3>
        </div>
        <span className="text-[11px] font-semibold text-slate-400">
          {jw.orders} orders · {jw.byStatus.received} received · {jw.byStatus.processing} processing · {jw.byStatus.completed + jw.byStatus.delivered} done
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <FlowStat label="Raw material given" value={kg(jw.receivedKg)} tone="amber" />
        <FlowStat label="Still to process" value={kg(jw.pendingKg)} tone="blue" hint="received + processing orders" />
        <FlowStat label="Finished material" value={kg(jw.finishedKg)} tone="emerald" hint={jw.yieldPct != null ? `Yield ${jw.yieldPct}% of completed input` : undefined} />
        <FlowStat label="By-products kept" value={kg(jw.byProductKeptKg)} tone="violet" hint={bp.length ? bp.map(([n, q]) => `${n} ${kg(q)}`).join(' · ') : 'husk / bran etc.'} />
        <FlowStat label="Waste / loss" value={kg(jw.wasteKg)} tone="rose" hint="input − finished − by-products (completed orders)" />
        <FlowStat label="Batches linked" value={String(b.count)} />
      </div>

      {b.count > 0 && (
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-500 mb-2">From the production batches ({b.count})</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <FlowStat label="Processed in batches" value={kg(b.inputKg)} />
            <FlowStat label="Finished goods lots" value={kg(b.finishedKg)} tone="emerald" />
            <FlowStat label="WIP (in progress)" value={kg(b.wipKg)} tone="blue" hint="available in work-in-progress" />
            <FlowStat label="Rejected" value={kg(b.rejectedKg)} tone="rose" hint={`${kg(b.rejectedOpenKg)} still open`} />
            <FlowStat label="Reprocessed" value={kg(b.reprocessedKg)} tone="violet" hint="rejected material sent again" />
            <FlowStat label="Batch wastage" value={kg(b.wastageKg)} tone="rose" />
            <FlowStat label="By-product lots" value={kg(b.byProductKg)} tone="violet" hint={`bran ${kg(b.branKg)} · husk ${kg(b.huskKg)} · broken ${kg(b.brokenKg)}`} />
          </div>
        </div>
      )}
      {b.count === 0 && (
        <p className="text-[11px] text-slate-400">
          WIP / rejected / reprocessing appear here once a production batch is started from the Job Work order (Batches → New Batch → source: Job Work).
        </p>
      )}
    </div>
  );
}
