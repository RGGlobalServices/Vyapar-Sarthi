'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { AlertTriangle, Clock, Calendar, Package, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { getBusinessConfig } from '@/lib/businessConfig';
import { cn } from '@/lib/utils';

type Row = {
  id: string;
  name: string;
  category: string | null;
  brand: string | null;
  currentStock: number | null;
  wholesaleCost: number | null;
  sellingPrice: number | null;
  mrp: number | null;
  baseUnit: string | null;
  batch_number: string | null;
  expiryDate: string;
  barcode: string | null;
  daysLeft: number;
  stockValue: number;
};

type ExpiryResponse = {
  counts: { expired: number; within30: number; within60: number; within90: number };
  stockValue: { expired: number; within30: number; within60: number; within90: number };
  stockUnits: { expired: number; within30: number; within60: number; within90: number };
  expired: Row[]; within30: Row[]; within60: Row[]; within90: Row[];
};

type BucketKey = 'expired' | 'within30' | 'within60' | 'within90';

const rupee = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const fetcher = (url: string) => api.get(url).then(r => r.data);

export default function ExpiryPage() {
  const t = useTranslations('Expiry');
  const locale = useLocale();
  const { profile, activeShopId } = useBusinessStore();
  const bizConfig = getBusinessConfig(profile.businessType);

  const { data, isLoading, error, mutate } = useSWR<ExpiryResponse>(
    activeShopId ? ['/products/expiring', activeShopId] : null,
    ([url]) => fetcher(url),
    { revalidateOnFocus: true }
  );

  const [openBucket, setOpenBucket] = useState<BucketKey | null>('expired');

  const tiles = useMemo(() => ([
    { key: 'expired' as BucketKey, label: t('expired'), icon: AlertTriangle, tone: 'red',
      count: data?.counts.expired ?? 0, value: data?.stockValue.expired ?? 0, units: data?.stockUnits.expired ?? 0,
      hint: t('expiredHint') },
    { key: 'within30' as BucketKey, label: t('within30'), icon: Clock, tone: 'orange',
      count: data?.counts.within30 ?? 0, value: data?.stockValue.within30 ?? 0, units: data?.stockUnits.within30 ?? 0,
      hint: t('within30Hint') },
    { key: 'within60' as BucketKey, label: t('within60'), icon: Clock, tone: 'amber',
      count: data?.counts.within60 ?? 0, value: data?.stockValue.within60 ?? 0, units: data?.stockUnits.within60 ?? 0,
      hint: t('within60Hint') },
    { key: 'within90' as BucketKey, label: t('within90'), icon: Calendar, tone: 'yellow',
      count: data?.counts.within90 ?? 0, value: data?.stockValue.within90 ?? 0, units: data?.stockUnits.within90 ?? 0,
      hint: t('within90Hint') },
  ]), [data, t]);

  // Businesses without hasExpiry (electrical, electronics, general wholesale…)
  // rarely track expiry dates. Render a friendly explainer instead of an empty
  // page — never a hard 404 so a shopkeeper who lands here from an old link
  // isn't blocked.
  const bizTracksExpiry = bizConfig.hasExpiry;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <AlertTriangle size={24} className="text-orange-500" /> {t('title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('subtitle')}
          </p>
        </div>
        <button
          onClick={() => mutate()}
          className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          {t('refresh')}
        </button>
      </div>

      {!bizTracksExpiry && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
          {t('notTracked', { label: bizConfig.label })}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 size={20} className="animate-spin mr-2" /> {t('loading')}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
          {t('error')}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {tiles.map(tile => {
              const Icon = tile.icon;
              const active = openBucket === tile.key;
              return (
                <button
                  key={tile.key}
                  onClick={() => setOpenBucket(active ? null : tile.key)}
                  className={cn(
                    'text-left p-5 rounded-2xl border transition-all',
                    active
                      ? tile.tone === 'red' ? 'border-red-400 bg-red-50 dark:border-red-500/50 dark:bg-red-500/10'
                        : tile.tone === 'orange' ? 'border-orange-400 bg-orange-50 dark:border-orange-500/50 dark:bg-orange-500/10'
                        : tile.tone === 'amber' ? 'border-amber-400 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-500/10'
                        : 'border-yellow-400 bg-yellow-50 dark:border-yellow-500/50 dark:bg-yellow-500/10'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <Icon size={22} className={
                      tile.tone === 'red' ? 'text-red-500'
                        : tile.tone === 'orange' ? 'text-orange-500'
                        : tile.tone === 'amber' ? 'text-amber-500'
                        : 'text-yellow-500'
                    } />
                    <span className={cn('text-[10px] font-bold uppercase', active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400')}>
                      {active ? t('showing') : t('tapToView')}
                    </span>
                  </div>
                  <p className="mt-3 text-3xl font-black text-slate-900 dark:text-white">{tile.count}</p>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-1">{tile.label}</p>
                  <div className="mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px] text-slate-500">
                    {t('stockLabel')} <span className="font-bold text-slate-700 dark:text-slate-200">{tile.units}</span> {t('units')}
                    · {t('valueLabel')} <span className="font-bold text-slate-700 dark:text-slate-200">{rupee(tile.value)}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">{tile.hint}</p>
                </button>
              );
            })}
          </div>

          {openBucket && (
            <BucketTable
              key={openBucket}
              locale={locale}
              title={tiles.find(t => t.key === openBucket)!.label}
              tone={tiles.find(t => t.key === openBucket)!.tone as any}
              rows={data[openBucket]}
            />
          )}
        </>
      )}
    </div>
  );
}

function BucketTable({ locale, title, tone, rows }: {
  locale: string; title: string; tone: 'red' | 'orange' | 'amber' | 'yellow'; rows: Row[];
}) {
  const t = useTranslations('Expiry');
  const [expanded, setExpanded] = useState(true);
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500">
        {t('emptyBucket')}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span className="font-bold text-slate-900 dark:text-white text-sm">{title}</span>
          <span className="text-xs text-slate-500">{t('productCount', { count: rows.length })}</span>
        </div>
      </button>
      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-slate-500 bg-slate-50/50 dark:bg-slate-800/30">
              <tr>
                <th className="text-left px-4 py-2 font-medium">{t('tableProduct')}</th>
                <th className="text-left px-4 py-2 font-medium">{t('tableBatch')}</th>
                <th className="text-left px-4 py-2 font-medium">{t('tableExpiry')}</th>
                <th className="text-right px-4 py-2 font-medium">{t('tableStock')}</th>
                <th className="text-right px-4 py-2 font-medium">{t('tableValue')}</th>
                <th className="text-right px-4 py-2 font-medium">{t('tableDays')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <Link href={`/${locale}/products`} className="font-semibold text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400">
                      {r.name}
                    </Link>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {r.brand ? `${r.brand} · ` : ''}{r.category || t('uncategorised')}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300 font-mono text-xs">{r.batch_number || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {new Date(r.expiryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">
                    {Number(r.currentStock) || 0} <span className="text-[10px] text-slate-500 font-normal">{r.baseUnit || ''}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">{rupee(r.stockValue)}</td>
                  <td className={cn(
                    'px-4 py-3 text-right font-black text-xs',
                    tone === 'red' ? 'text-red-500'
                      : tone === 'orange' ? 'text-orange-500'
                      : tone === 'amber' ? 'text-amber-500'
                      : 'text-yellow-600'
                  )}>
                    {r.daysLeft < 0 ? t('daysAgo', { days: Math.abs(r.daysLeft) }) : r.daysLeft === 0 ? t('today') : t('daysLeft', { days: r.daysLeft })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
