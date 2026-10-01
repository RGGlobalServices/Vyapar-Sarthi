'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useBusinessStore } from '@/lib/businessStore';
import { ExportButton, ReportPeriodProvider } from '@/lib/hooks/useExport';

const fetcher = (u: string) => api.get(u).then((r) => r.data);
const kg = (n: number | null | undefined) => (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const pct = (n: number | null | undefined) => (n == null ? '—' : `${n}%`);
const iso = (d: Date) => d.toLocaleDateString('en-CA');
const fmtDate = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

type Tab = 'daily' | 'material' | 'entries';

/** Production register for a date range — daily totals, yield by material and every run — each exportable as PDF / Excel / CSV. */
export default function ProductionReports() {
  const t = useTranslations('Mill');
  const activeShopId = useBusinessStore((s) => s.activeShopId);
  const today = new Date();
  const [from, setFrom] = useState(iso(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [to, setTo] = useState(iso(today));
  const [tab, setTab] = useState<Tab>('daily');

  const { data, isLoading } = useSWR<any>(activeShopId ? [`/mill/production-register?from=${from}&to=${to}`, activeShopId] : null, ([u]) => fetcher(u));
  const tot = data?.totals;

  const preset = (kind: 'today' | 'week' | 'month') => {
    const n = new Date();
    setTo(iso(n));
    if (kind === 'today') setFrom(iso(n));
    else if (kind === 'week') { const d = new Date(n); d.setDate(n.getDate() - ((n.getDay() + 6) % 7)); setFrom(iso(d)); }
    else setFrom(iso(new Date(n.getFullYear(), n.getMonth(), 1)));
  };

  const cols = useMemo(() => {
    const N = 'number' as const;
    return {
      daily: [
        { key: 'dateText', label: t('rp_c_date') }, { key: 'runs', label: t('rp_c_runs'), type: N },
        { key: 'inputKg', label: t('rp_c_input'), type: N }, { key: 'finishedKg', label: t('rp_c_finished'), type: N },
        { key: 'byProductKg', label: t('rp_c_byProduct'), type: N }, { key: 'wipKg', label: t('rp_c_wip'), type: N },
        { key: 'rejectedKg', label: t('rp_c_rejected'), type: N }, { key: 'lossKg', label: t('rp_c_waste'), type: N },
        { key: 'yieldPct', label: t('rp_c_yield'), type: N },
      ],
      material: [
        { key: 'material', label: t('rp_c_material') }, { key: 'runs', label: t('rp_c_runs'), type: N },
        { key: 'inputKg', label: t('rp_c_input'), type: N }, { key: 'finishedKg', label: t('rp_c_finished'), type: N },
        { key: 'byProductKg', label: t('rp_c_byProduct'), type: N }, { key: 'wipKg', label: t('rp_c_wip'), type: N },
        { key: 'rejectedKg', label: t('rp_c_rejected'), type: N }, { key: 'lossKg', label: t('rp_c_waste'), type: N },
        { key: 'yieldPct', label: t('rp_c_yield'), type: N }, { key: 'lossPct', label: t('rp_c_lossPct'), type: N },
      ],
      entries: [
        { key: 'dateText', label: t('rp_c_date') }, { key: 'batchNumber', label: t('rp_c_batch') }, { key: 'mode', label: t('rp_c_mode') },
        { key: 'source', label: t('rp_c_source') }, { key: 'material', label: t('rp_c_material') },
        { key: 'inputKg', label: t('rp_c_input'), type: N }, { key: 'finishedKg', label: t('rp_c_finished'), type: N },
        { key: 'byProductKg', label: t('rp_c_byProduct'), type: N }, { key: 'wipKg', label: t('rp_c_wip'), type: N },
        { key: 'rejectedKg', label: t('rp_c_rejected'), type: N }, { key: 'lossKg', label: t('rp_c_waste'), type: N },
        { key: 'yieldPct', label: t('rp_c_yield'), type: N }, { key: 'operator', label: t('rp_c_operator') },
        { key: 'finishedText', label: t('rp_c_finishedItems') }, { key: 'byProductText', label: t('rp_c_byProductItems') },
      ],
    };
  }, [t]);

  const rows = useMemo(() => {
    const withDate = (list: any[]) => list.map((r) => ({ ...r, dateText: fmtDate(r.date) }));
    return { daily: withDate(data?.byDay || []), material: data?.byMaterial || [], entries: withDate(data?.entries || []) };
  }, [data]);

  const summary = tot ? [
    { label: t('rp_kpiRuns'), value: String(tot.runs) },
    { label: t('rp_kpiIn'), value: `${kg(tot.inputKg)} kg` },
    { label: t('rp_kpiFinished'), value: `${kg(tot.finishedKg)} kg` },
    { label: t('rp_kpiBy'), value: `${kg(tot.byProductKg)} kg` },
    { label: t('rp_kpiLoss'), value: `${kg(tot.lossKg)} kg` },
    { label: t('rp_kpiYield'), value: pct(tot.yieldPct) },
  ] : [];

  const tabs: Array<{ id: Tab; label: string }> = [{ id: 'daily', label: t('rp_daily') }, { id: 'material', label: t('rp_material') }, { id: 'entries', label: t('rp_entries') }];
  const fileBase = { daily: 'production_register_daily', material: 'production_yield_by_material', entries: 'production_runs' }[tab];
  const title = { daily: t('rp_daily'), material: t('rp_material'), entries: t('rp_entries') }[tab];
  const inputCls = 'h-9 px-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-xs';
  const kpis: Array<[string, string, string]> = tot ? [
    [t('rp_kpiRuns'), String(tot.runs), ''], [t('rp_kpiIn'), kg(tot.inputKg), 'kg'], [t('rp_kpiFinished'), kg(tot.finishedKg), 'kg'],
    [t('rp_kpiBy'), kg(tot.byProductKg), 'kg'], [t('rp_kpiWip'), kg(tot.wipKg), 'kg'], [t('rp_kpiRej'), kg(tot.rejectedKg), 'kg'], [t('rp_kpiYield'), pct(tot.yieldPct), ''],
  ] : [];

  return (
    <ReportPeriodProvider startDate={from} endDate={to}>
      <div className="space-y-4">
        <p className="text-xs text-slate-500">{t('rp_hint')}</p>
        <div className="flex flex-wrap items-end gap-2">
          {(['today', 'week', 'month'] as const).map((k) => (
            <button key={k} onClick={() => preset(k)} className="h-9 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200">{t(`rp_${k}`)}</button>
          ))}
          <label className="text-[10px] font-bold uppercase text-slate-500">{t('rp_from')}<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={cn(inputCls, 'block mt-0.5')} /></label>
          <label className="text-[10px] font-bold uppercase text-slate-500">{t('rp_to')}<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={cn(inputCls, 'block mt-0.5')} /></label>
        </div>

        {isLoading ? (
          <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={22} /></div>
        ) : !tot || tot.runs === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">{t('rp_none')}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {kpis.map(([l, v, u]) => (
                <div key={l} className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-2.5">
                  <p className="text-[10px] font-bold uppercase text-slate-400">{l}</p>
                  <p className="text-base font-black font-mono text-slate-800 dark:text-slate-100">{v} <span className="text-[10px] font-semibold text-slate-400">{u}</span></p>
                </div>
              ))}
            </div>
            {data?.truncated && <p className="text-[11px] text-amber-600">{t('rp_truncated')}</p>}

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex gap-1 flex-wrap">
                {tabs.map((x) => (
                  <button key={x.id} onClick={() => setTab(x.id)}
                    className={cn('h-9 px-3 rounded-lg text-xs font-bold', tab === x.id ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300')}>{x.label}</button>
                ))}
              </div>
              <ExportButton columns={cols[tab]} data={rows[tab]} filename={fileBase} title={title} orientation="landscape" summary={summary} />
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500">
                  <tr>{cols[tab].map((c) => <th key={c.key} className={cn('px-3 py-2 font-bold whitespace-nowrap', c.type === 'number' ? 'text-right' : 'text-left')}>{c.label}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows[tab].map((r: any, i: number) => (
                    <tr key={r.id || r.date || r.material || i}>
                      {cols[tab].map((c) => (
                        <td key={c.key} className={cn('px-3 py-2 whitespace-nowrap', c.type === 'number' ? 'text-right font-mono' : 'text-left max-w-[16rem] truncate')}>
                          {c.type === 'number' ? (c.key.toLowerCase().includes('pct') ? pct(r[c.key]) : kg(r[c.key])) : (r[c.key] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </ReportPeriodProvider>
  );
}
