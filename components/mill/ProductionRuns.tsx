'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { FileText, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import ProductionReports from '@/components/mill/ProductionReports';
import { downloadProductionSlip } from '@/lib/productionSlipClient';

const fetcher = (u: string) => api.get(u).then((r) => r.data);
const kg = (n: number | null | undefined) => `${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg`;
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');

/** Every finished production run (quick entries and stage-wise batches alike): the latest ones with a Slip each, and the reports. */
export default function ProductionRuns() {
  const t = useTranslations('Mill');
  const activeShopId = useBusinessStore((s) => s.activeShopId);
  const profile = useBusinessStore((s) => s.profile);
  const [slipFor, setSlipFor] = useState<string | null>(null);

  // same key BatchesModule uses, so the list is shared (one request)
  const { data: batches = [] } = useSWR<any[]>(activeShopId ? ['/mill/batches', activeShopId] : null, ([u]) => fetcher(u), { revalidateOnFocus: true });
  const recent = batches.filter((b) => b.status === 'closed').slice(0, 10);

  const slip = async (id: string) => {
    setSlipFor(id);
    try {
      await downloadProductionSlip(id, { name: profile.shopName || 'Vyapar Sarthi', address: profile.address || null, mobile: profile.mobile || null, gst: profile.gst || null, pan: profile.pan || null });
    } catch {
      toast.error(t('qp_slipFailed'));
    } finally { setSlipFor(null); }
  };

  return (
    <div className="space-y-6">
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
                <div className="flex items-center gap-4 text-xs flex-wrap">
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

      <section className="space-y-2">
        <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">{t('rp_title')}</h2>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4"><ProductionReports /></div>
      </section>
    </div>
  );
}
