'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { ChevronDown, Factory, FileText, Loader2, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useBusinessStore } from '@/lib/businessStore';
import BatchesModule from '@/components/mill/BatchesModule';
import QuickProductionForm from '@/components/mill/QuickProductionForm';
import ProductionReports from '@/components/mill/ProductionReports';
import { downloadProductionSlip } from '@/lib/productionSlipClient';

const fetcher = (u: string) => api.get(u).then((r) => r.data);
const kg = (n: number | null | undefined) => `${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg`;
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');

/**
 * Production screen for small and medium mills: one big "New Production" button (the one-form entry), the most recent runs, and —
 * folded away — the stage-wise batches for mills that work step by step. Nothing of the stage flow is removed.
 */
export default function ProductionHome() {
  const t = useTranslations('Mill');
  const activeShopId = useBusinessStore((s) => s.activeShopId);
  const [showForm, setShowForm] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState<boolean | null>(null);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [slipFor, setSlipFor] = useState<string | null>(null);
  const profile = useBusinessStore((s) => s.profile);

  const slip = async (id: string) => {
    setSlipFor(id);
    try {
      await downloadProductionSlip(id, { name: profile.shopName || 'Vyapar Sarthi', address: profile.address || null, mobile: profile.mobile || null, gst: profile.gst || null, pan: profile.pan || null });
    } catch {
      toast.error(t('qp_slipFailed'));
    } finally { setSlipFor(null); }
  };

  // same key BatchesModule uses, so the list is shared (one request)
  const { data: batches = [] } = useSWR<any[]>(activeShopId ? ['/mill/batches', activeShopId] : null, ([u]) => fetcher(u), { revalidateOnFocus: true });
  const active = batches.filter((b) => b.status === 'open' || b.status === 'in_progress');
  const recent = batches.filter((b) => b.status === 'closed').slice(0, 10);
  const advancedShown = advancedOpen ?? active.length > 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2"><Factory size={22} className="text-amber-600" /> {t('productionTitle')}</h1>
        <button onClick={() => setShowForm(true)} data-testid="qp-open"
          className="h-12 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-sm flex items-center gap-2">
          <Plus size={18} /> {t('qp_newBtn')}
        </button>
      </div>

      <section className="space-y-2">
        <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">{t('qp_recent')}</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">{t('qp_none')}</p>
        ) : (
          <div className="grid gap-2">
            {recent.map((b) => (
              <div key={b.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-mono font-black text-sm text-slate-800 dark:text-slate-100">{b.batchNumber} <span className="font-sans font-medium text-xs text-slate-400">{fmtDate(b.closedAt || b.startedAt)}</span></p>
                  <p className="text-xs text-slate-500 truncate max-w-[22rem]">{b.notes || b.rawLot?.product?.name || ''}</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-slate-500">{t('qp_input')} <b className="font-mono text-slate-800 dark:text-slate-100">{kg(b.inputKg)}</b></span>
                  <span className="text-emerald-600">{t('qp_finished')} <b className="font-mono">{kg(b.outputKg)}</b></span>
                  <span className="text-rose-500">{t('qp_loss')} <b className="font-mono">{kg(b.wastageKg)}</b></span>
                  {b.recoveryPct != null && <span className="font-black text-slate-700 dark:text-slate-200">{b.recoveryPct}%</span>}
                  <button onClick={() => slip(b.id)} disabled={slipFor === b.id} title={t('qp_slip')}
                    className="h-8 px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 disabled:opacity-50">
                    {slipFor === b.id ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />} {t('qp_slip')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-800">
        <button onClick={() => setReportsOpen(!reportsOpen)} className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left" data-testid="rp-toggle">
          <span>
            <span className="block text-sm font-black text-slate-800 dark:text-slate-100">{t('rp_title')}</span>
            <span className="block text-xs text-slate-500">{t('rp_hint')}</span>
          </span>
          <ChevronDown size={18} className={cn('text-slate-400 transition-transform', reportsOpen && 'rotate-180')} />
        </button>
        {reportsOpen && <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-800 pt-4"><ProductionReports /></div>}
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-800">
        <button onClick={() => setAdvancedOpen(!advancedShown)} className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left">
          <span>
            <span className="block text-sm font-black text-slate-800 dark:text-slate-100">{t('qp_advanced')}</span>
            <span className="block text-xs text-slate-500">{t('qp_advancedHint', { n: active.length })}</span>
          </span>
          <ChevronDown size={18} className={cn('text-slate-400 transition-transform', advancedShown && 'rotate-180')} />
        </button>
        {advancedShown && <div className="px-2 pb-4 border-t border-slate-100 dark:border-slate-800 pt-4"><BatchesModule mode="production" /></div>}
      </section>

      {showForm && <QuickProductionForm onClose={() => setShowForm(false)} />}
    </div>
  );
}
