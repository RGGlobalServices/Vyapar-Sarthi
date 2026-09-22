'use client';

import { AlertTriangle, RefreshCw, Receipt } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

const pulse = 'bg-slate-200 dark:bg-slate-800 animate-pulse';

/** Placeholder for the KPI rows + list cards while the first response is in flight. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300" data-testid="dashboard-skeleton">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 md:p-6">
            <div className={`h-3 w-20 rounded mb-4 ${pulse}`} />
            <div className={`h-7 w-28 rounded-xl ${pulse}`} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 md:p-6">
            <div className={`h-3 w-24 rounded mb-4 ${pulse}`} />
            <div className={`h-6 w-24 rounded-xl ${pulse}`} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className={`h-4 w-32 rounded ${pulse}`} />
            </div>
            <div className="p-4 space-y-3">
              {[...Array(4)].map((_, j) => (
                <div key={j} className="flex justify-between gap-4">
                  <div className={`h-4 w-32 rounded ${pulse}`} />
                  <div className={`h-4 w-16 rounded ${pulse}`} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Shown when /reports/dashboard fails and there is nothing earlier to show. Never renders ₹0 figures. */
export function DashboardError({ onRetry, retrying }: { onRetry: () => void; retrying?: boolean }) {
  const t = useTranslations('Dashboard');
  return (
    <div role="alert" data-testid="dashboard-error" className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-500/30 rounded-2xl p-8 flex flex-col items-center text-center gap-3">
      <div className="p-3 rounded-full bg-red-500/10 text-red-600 dark:text-red-400"><AlertTriangle size={28} /></div>
      <h2 className="text-lg font-black text-slate-900 dark:text-white">{t('errorTitle')}</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">{t('errorBody')}</p>
      <button
        onClick={onRetry}
        disabled={retrying}
        className="mt-1 inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white dark:text-slate-900 px-5 py-2 rounded-xl text-sm font-black transition-colors"
      >
        <RefreshCw size={14} className={retrying ? 'animate-spin' : ''} /> {t('retry')}
      </button>
    </div>
  );
}

/** A fetch failed but earlier figures are still on screen — say so instead of silently showing stale numbers. */
export function StaleNotice({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('Dashboard');
  return (
    <div role="status" data-testid="dashboard-stale" className="flex flex-wrap items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2 text-xs font-bold text-amber-700 dark:text-amber-400">
      <AlertTriangle size={14} className="shrink-0" />
      <span className="flex-1 min-w-0">{t('staleWarning')}</span>
      <button onClick={onRetry} className="underline underline-offset-2">{t('retry')}</button>
    </div>
  );
}

/** A shop with no invoices yet: the cards below are genuinely zero, so explain why instead of looking broken. */
export function DashboardEmpty() {
  const t = useTranslations('Dashboard');
  return (
    <div data-testid="dashboard-empty" className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 w-fit"><Receipt size={20} /></div>
      <div className="flex-1 min-w-0">
        <p className="font-black text-slate-900 dark:text-white">{t('emptyTitle')}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('emptyBody')}</p>
      </div>
      <Link href="/billing" className="bg-emerald-500 hover:bg-emerald-400 text-white dark:text-slate-900 px-4 py-2 rounded-xl text-xs font-black text-center transition-colors">
        {t('startBilling')}
      </Link>
    </div>
  );
}
