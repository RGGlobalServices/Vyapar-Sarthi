'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import BatchesModule from '@/components/mill/BatchesModule';
import ProductionRuns from '@/components/mill/ProductionRuns';

/**
 * Batches — the record of production. Every run is a batch: "Production runs & reports" lists the finished ones (with a Slip each) and
 * the register / yield reports; "Stage-wise batches" is the optional step-by-step way (create a batch, run its stages).
 * Direct production is started from Raw Material, not here.
 */
function Inner() {
  const t = useTranslations('Mill');
  const params = useSearchParams();
  const [tab, setTab] = useState<'runs' | 'stages'>(params?.get('batch') || params?.get('tab') === 'stages' ? 'stages' : 'runs');
  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
          {([['runs', t('br_tabRuns')], ['stages', t('br_tabStages')]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} data-testid={`batches-tab-${id}`}
              className={cn('px-3.5 py-2 rounded-lg text-xs font-bold transition-colors', tab === id ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300')}>{label}</button>
          ))}
        </div>
        {tab === 'stages' && <Link href={'/production' as any} className="text-xs font-bold text-amber-600 hover:underline">{t('br_openStages')} →</Link>}
      </div>
      {tab === 'runs' ? <ProductionRuns /> : (
        <>
          <p className="text-xs text-slate-500">{t('br_stagesHint')}</p>
          <BatchesModule mode="batches" />
        </>
      )}
    </div>
  );
}

export default function BatchesHub() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
