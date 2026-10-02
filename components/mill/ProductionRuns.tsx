'use client';

import { useEffect, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useTranslations } from 'next-intl';
import { FileText, Loader2, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import ProductionReports from '@/components/mill/ProductionReports';
import QuickProductionForm from '@/components/mill/QuickProductionForm';
import ModalPortal from '@/components/mill/ModalPortal';
import { useConfirm } from '@/components/ConfirmDialog';
import { downloadProductionSlipOf, warmUpSlip } from '@/lib/productionSlipClient';

const fetcher = (u: string) => api.get(u).then((r) => r.data);
const kg = (n: number | null | undefined) => `${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg`;
// How a run was made: direct (the one-form entry), stage-wise, a customer's Job Work, or reprocessing
const modeOf = (b: any): 'pm_direct' | 'pm_stages' | 'pm_jobwork' | 'pm_reprocess' =>
  b.batchType === 'JOB_WORK' ? 'pm_jobwork' : b.batchType === 'REPROCESSING' ? 'pm_reprocess'
    : (b.stages || []).length === 1 && b.stages[0].stageName === 'Production' ? 'pm_direct' : 'pm_stages';
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');

/** Every finished production run (quick entries and stage-wise batches alike): the latest ones with a Slip each, and the reports. */
export default function ProductionRuns() {
  const t = useTranslations('Mill');
  const activeShopId = useBusinessStore((s) => s.activeShopId);
  const profile = useBusinessStore((s) => s.profile);
  const [slipFor, setSlipFor] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const { mutate } = useSWRConfig();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editFull, setEditFull] = useState<string | null>(null);   // a raw-material run: the whole Quick form, filled
  const [editSimple, setEditSimple] = useState<any>(null);          // any other run: date / operator / notes only

  // same key BatchesModule uses, so the list is shared (one request)
  const { data: batches = [] } = useSWR<any[]>(activeShopId ? ['/mill/batches', activeShopId] : null, ([u]) => fetcher(u), { revalidateOnFocus: true });
  const recent = batches.filter((b) => b.status === 'closed').slice(0, 20);
  // a direct run that took its material from raw lots can be re-entered in full; others (stage-wise, Job Work, WIP, rejected) only have their details edited
  const fullEditable = (b: any) => modeOf(b) === 'pm_direct' && b.batchType === 'NORMAL' && !/^WIP lot/i.test(b.notes || '');
  const refresh = () => mutate((key: any) => Array.isArray(key) && typeof key[0] === 'string' && (key[0].startsWith('/mill/') || key[0].startsWith('/products')), undefined, { revalidate: true });

  const remove = async (b: any) => {
    if (!(await confirm(t('pe_deleteMsg'), { title: t('pe_deleteTitle', { batch: b.batchNumber }), okLabel: t('pe_delete'), cancelLabel: t('pe_cancel') }))) return;
    setBusyId(b.id);
    try {
      await api.delete(`/mill/production-entry/${b.id}`);
      toast.success(t('pe_deleted', { batch: b.batchNumber }));
      refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e?.response?.data?.error || e?.message || t('pe_failed'), { duration: 8000 });
    } finally { setBusyId(null); }
  };

  useEffect(() => { warmUpSlip(); }, []);

  const slip = async (b: any) => {
    setSlipFor(b.id);
    try {
      await downloadProductionSlipOf(b, { name: profile.shopName || 'Vyapar Sarthi', address: profile.address || null, mobile: profile.mobile || null, gst: profile.gst || null, pan: profile.pan || null });
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
                  <p className="font-mono font-black text-sm text-slate-800 dark:text-slate-100">{b.batchNumber} <span className="font-sans font-medium text-xs text-slate-400">{fmtDate(b.closedAt || b.startedAt)}</span> <span className="font-sans text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 align-middle">{t(modeOf(b))}</span></p>
                  <p className="text-xs text-slate-500 truncate max-w-[22rem]">{b.notes || b.rawLot?.product?.name || ''}</p>
                </div>
                <div className="flex items-center gap-4 text-xs flex-wrap">
                  <span className="text-slate-500">{t('qp_input')} <b className="font-mono text-slate-800 dark:text-slate-100">{kg(b.inputKg)}</b></span>
                  <span className="text-emerald-600">{t('qp_finished')} <b className="font-mono">{kg(b.outputKg)}</b></span>
                  <span className="text-rose-500">{t('qp_loss')} <b className="font-mono">{kg(b.wastageKg)}</b></span>
                  {b.recoveryPct != null && <span className="font-black text-slate-700 dark:text-slate-200">{b.recoveryPct}%</span>}
                  <button onClick={() => slip(b)} disabled={slipFor === b.id} title={t('qp_slip')}
                    className="h-8 px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 disabled:opacity-50">
                    {slipFor === b.id ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />} {t('qp_slip')}
                  </button>
                  <button onClick={() => (fullEditable(b) ? setEditFull(b.id) : setEditSimple(b))} title={t('pe_edit')} aria-label={t('pe_edit')}
                    className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center"><Pencil size={13} /></button>
                  <button onClick={() => remove(b)} disabled={busyId === b.id} title={t('pe_delete')} aria-label={t('pe_delete')}
                    className="h-8 w-8 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-600 flex items-center justify-center disabled:opacity-50">{busyId === b.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}</button>
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
      {confirmDialog}
      {editFull && <QuickProductionForm editId={editFull} onClose={() => setEditFull(null)} onSaved={refresh} />}
      {editSimple && <RunDetailsModal batch={editSimple} onClose={() => setEditSimple(null)} onSaved={() => { setEditSimple(null); refresh(); }} />}
    </div>
  );
}

/** Date, operator and notes of a finished run — these change no stock, so they can always be edited. */
function RunDetailsModal({ batch, onClose, onSaved }: { batch: any; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('Mill');
  const stage = (batch.stages || [])[0] || {};
  const local = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const [when, setWhen] = useState(batch.startedAt ? local(batch.startedAt) : '');
  const [operator, setOperator] = useState(stage.operatorName || '');
  const [notes, setNotes] = useState(stage.notes || '');
  const [saving, setSaving] = useState(false);
  const direct = (batch.stages || []).length === 1;
  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/mill/production-entry/${batch.id}`, { startedAt: when ? new Date(when).toISOString() : undefined, ...(direct ? { operatorName: operator, notes } : {}) });
      onSaved();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e?.response?.data?.error || e?.message || t('pe_failed'));
    } finally { setSaving(false); }
  };
  const cls = 'w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-sm';
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl p-5 space-y-3">
          <h2 className="text-lg font-black text-slate-900 dark:text-white">{t('pe_detailsTitle')} · {batch.batchNumber}</h2>
          {!direct && <p className="text-xs text-slate-500">{t('pe_stagesNote')}</p>}
          <label className="block text-[11px] font-bold uppercase text-slate-500">{t('pe_date')}<input type="datetime-local" className={cls + ' mt-1'} value={when} onChange={(e) => setWhen(e.target.value)} /></label>
          {direct && <label className="block text-[11px] font-bold uppercase text-slate-500">{t('pe_operator')}<input className={cls + ' mt-1'} value={operator} onChange={(e) => setOperator(e.target.value)} /></label>}
          {direct && <label className="block text-[11px] font-bold uppercase text-slate-500">{t('pe_notes')}<input className={cls + ' mt-1'} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-500">{t('pe_cancel')}</button>
            <button onClick={save} disabled={saving} className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">{saving && <Loader2 size={14} className="animate-spin" />} {t('pe_save')}</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
