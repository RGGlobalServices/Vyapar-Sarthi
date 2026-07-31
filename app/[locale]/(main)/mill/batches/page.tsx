'use client';

import { useEffect, useState, useMemo } from 'react';
import useSWR from 'swr';
import {
  Plus, X, Loader2, ArrowRight, CheckCircle2, Factory, Wheat, Package, Percent, Clock,
} from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

const STAGES = ['cleaning', 'drying', 'shelling', 'polishing', 'packing'] as const;
const STAGE_LABELS: Record<string, string> = {
  cleaning: 'Cleaning', drying: 'Drying', shelling: 'Shelling', polishing: 'Polishing', packing: 'Packing',
};

type Stage = {
  id: string; stageName: string; sequence: number;
  inputKg: number | null; outputKg: number | null; wastageKg: number | null;
  operatorName: string | null; notes: string | null;
  startedAt: string; completedAt: string | null;
};

type Batch = {
  id: string; batchNumber: string; status: 'open' | 'in_progress' | 'closed';
  currentStage: string; startedAt: string; closedAt: string | null;
  inputKg: number | null; outputKg: number | null; wastageKg: number | null;
  brokenKg: number | null; branKg: number | null; huskKg: number | null; recoveryPct: number | null;
  notes: string | null;
  rawLot?: { id: string; lotNumber: string | null; farmerName: string | null; weightKg: number | null;
    product?: { name: string } | null; supplier?: { name: string } | null };
  stages: Stage[];
  byProducts?: any[];
};

type RawLot = {
  id: string; lotNumber: string | null; farmerName: string | null;
  weightKg: number | null; remainingKg: number | null;
  product?: { name: string } | null;
};

const fetcher = (u: string) => api.get(u).then(r => r.data);

const statusTone = (s: string) => s === 'closed'
  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
  : s === 'in_progress'
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';

export default function MillBatchesPage() {
  const t = useTranslations('Mill');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const { data: batches = [], mutate: refetch, isLoading } = useSWR<Batch[]>(
    activeShopId ? ['/mill/batches', activeShopId] : null,
    ([u]) => fetcher(u),
    { revalidateOnFocus: true }
  );
  const { data: lots = [] } = useSWR<RawLot[]>(
    activeShopId ? ['/mill/raw-lots?status=available', activeShopId] : null,
    ([u]) => fetcher(u),
  );

  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const openBatch = batches.find(b => b.id === selectedId) || null;

  const stats = useMemo(() => ({
    open: batches.filter(b => b.status !== 'closed').length,
    closed: batches.filter(b => b.status === 'closed').length,
    avgRecovery: (() => {
      const closed = batches.filter(b => b.recoveryPct != null);
      if (closed.length === 0) return null;
      return Math.round(closed.reduce((s, b) => s + (b.recoveryPct || 0), 0) / closed.length * 10) / 10;
    })(),
  }), [batches]);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Factory size={22} className="text-amber-600" /> {t('title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('subtitle')}
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors"
        >
          <Plus size={18} /> {t('newBatch')}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={Wheat} label={t('openInProgress')} value={stats.open} tone="amber" />
        <StatCard icon={CheckCircle2} label={t('closed')} value={stats.closed} tone="emerald" />
        <StatCard icon={Percent} label={t('avgRecovery')} value={stats.avgRecovery != null ? `${stats.avgRecovery}%` : '—'} tone="blue" />
      </div>

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : batches.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <Factory size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm text-slate-500">{t('noBatches')}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {batches.map(b => (
              <BatchRow key={b.id} batch={b} onOpen={() => setSelectedId(b.id)} />
            ))}
          </ul>
        </div>
      )}

      {creating && (
        <CreateBatchModal
          lots={lots}
          onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); refetch(); setSelectedId(id); }}
        />
      )}
      {openBatch && (
        <BatchDetail
          batch={openBatch}
          onClose={() => setSelectedId(null)}
          onChanged={refetch}
        />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: any; tone: 'amber' | 'emerald' | 'blue' }) {
  const map = { amber: 'text-amber-500', emerald: 'text-emerald-500', blue: 'text-blue-500' };
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <Icon size={18} className={map[tone]} />
      <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{value}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

function BatchRow({ batch, onOpen }: { batch: Batch; onOpen: () => void }) {
  const t = useTranslations('Mill');
  const completed = batch.stages.filter(s => s.completedAt).length;
  const total = batch.stages.length || STAGES.length;
  const pct = Math.round((completed / total) * 100);
  return (
    <li onClick={onOpen} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-black text-slate-900 dark:text-white">{batch.batchNumber}</span>
            <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full', statusTone(batch.status))}>
              {batch.status.replace('_', ' ')}
            </span>
            {batch.status !== 'closed' && (
              <span className="text-[10px] font-semibold text-slate-500">
                {t('current')}: {STAGE_LABELS[batch.currentStage] ? t(batch.currentStage) : batch.currentStage}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {batch.rawLot?.lotNumber ? `${t('lot')} ${batch.rawLot.lotNumber} · ` : ''}
            {batch.rawLot?.farmerName ? `${batch.rawLot.farmerName} · ` : ''}
            {t('input')} {batch.inputKg || 0} Kg
            {batch.status === 'closed' && batch.outputKg != null && ` · ${t('output')} ${batch.outputKg} Kg`}
            {batch.recoveryPct != null && ` · ${t('recovery')} ${batch.recoveryPct}%`}
          </p>
        </div>
        <div className="w-40 shrink-0">
          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div
              className={cn('h-full transition-all', batch.status === 'closed' ? 'bg-emerald-500' : 'bg-amber-500')}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500 mt-1 text-right">{completed} / {total} {t('stages')}</p>
        </div>
      </div>
    </li>
  );
}

function CreateBatchModal({ lots, onClose, onCreated }: {
  lots: RawLot[]; onClose: () => void; onCreated: (id: string) => void;
}) {
  const t = useTranslations('Mill');
  const [form, setForm] = useState({ rawLotId: lots[0]?.id || '', inputKg: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const lot = lots.find(l => l.id === form.rawLotId);
  const cap = lot?.remainingKg ?? lot?.weightKg ?? 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = await api.post('/mill/batches', {
        rawLotId: form.rawLotId || null,
        inputKg: Number(form.inputKg),
        notes: form.notes,
      });
      onCreated(res.data.id);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || t('failedToCreate'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-black">{t('newProductionBatch')}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('rawMaterialLot')}</label>
            <select
              value={form.rawLotId}
              onChange={e => setForm({ ...form, rawLotId: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
              required
            >
              {lots.length === 0 && <option value="">{t('noAvailableLots')}</option>}
              {lots.map(l => (
                <option key={l.id} value={l.id}>
                  {l.lotNumber || t('unnamedLot')} · {l.product?.name || 'Raw'} · {l.remainingKg ?? l.weightKg} Kg {t('avail')}
                  {l.farmerName ? ` · ${l.farmerName}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
              {t('inputWeightKg')}
              {lot && <span className="ml-2 font-normal text-slate-400 lowercase">{t('maxKgFromLot', { cap })}</span>}
            </label>
            <input
              type="number" min="0" step="0.01" max={cap || undefined}
              value={form.inputKg}
              onChange={e => setForm({ ...form, inputKg: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('notesOptional')}</label>
            <input
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
              placeholder={t('notesPlaceholder')}
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={saving || !form.rawLotId || !form.inputKg}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {t('startBatch')}
          </button>
        </form>
      </div>
    </div>
  );
}

function BatchDetail({ batch, onClose, onChanged }: { batch: Batch; onClose: () => void; onChanged: () => void }) {
  const t = useTranslations('Mill');
  const [saving, setSaving] = useState<string | null>(null);
  const [close, setClose] = useState({
    outputKg: String(batch.outputKg ?? ''), brokenKg: String(batch.brokenKg ?? ''),
    branKg: String(batch.branKg ?? ''), huskKg: String(batch.huskKg ?? ''),
    wastageKg: String(batch.wastageKg ?? ''),
  });
  const [closing, setClosing] = useState(false);

  const patchStage = async (stage: Stage, patch: any) => {
    setSaving(stage.id);
    try {
      await api.patch(`/mill/batches/${batch.id}/stages/${stage.id}`, patch);
      onChanged();
    } catch (err: any) {
      alert(err?.response?.data?.error || t('failedToUpdateStage'));
    } finally { setSaving(null); }
  };

  const closeBatch = async () => {
    if (!close.outputKg || Number(close.outputKg) <= 0) {
      alert(t('enterFinalOutput'));
      return;
    }
    setClosing(true);
    try {
      await api.patch(`/mill/batches/${batch.id}`, {
        status: 'closed',
        outputKg: Number(close.outputKg),
        brokenKg: Number(close.brokenKg) || null,
        branKg: Number(close.branKg) || null,
        huskKg: Number(close.huskKg) || null,
        wastageKg: Number(close.wastageKg) || null,
      });
      onChanged();
    } catch (err: any) {
      alert(err?.response?.data?.error || t('failedToClose'));
    } finally { setClosing(false); }
  };

  const projectedRecovery = (() => {
    const o = Number(close.outputKg) || 0;
    const i = Number(batch.inputKg) || 0;
    if (i <= 0) return null;
    return Math.round((o / i) * 10000) / 100;
  })();

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-slate-50 dark:bg-slate-900 w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col h-[92vh] sm:h-auto sm:max-h-[92vh]">
        <div className="p-5 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sm:rounded-t-2xl flex items-start justify-between shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-900 dark:text-white">{batch.batchNumber}</h2>
              <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full', statusTone(batch.status))}>{batch.status.replace('_', ' ')}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {batch.rawLot?.lotNumber && `${t('lot')} ${batch.rawLot.lotNumber} · `}
              {batch.rawLot?.farmerName && `${batch.rawLot.farmerName} · `}
              {t('input')} {batch.inputKg || 0} Kg · {t('started')} {new Date(batch.startedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="text-xs font-bold uppercase text-slate-500 mb-2">{t('stageWorkflow')}</div>
          {batch.stages.map((stage, idx) => (
            <StageCard
              key={stage.id}
              stage={stage}
              index={idx}
              isActive={stage.stageName === batch.currentStage && batch.status !== 'closed'}
              batchClosed={batch.status === 'closed'}
              saving={saving === stage.id}
              onSave={patchStage}
            />
          ))}

          {batch.status !== 'closed' && (
            <div className="rounded-xl border border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Package size={16} className="text-emerald-600" />
                <span className="text-sm font-bold text-emerald-800 dark:text-emerald-300">{t('closeBatchTitle')}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <NumInput label={t('outputKg')} value={close.outputKg} onChange={v => setClose(c => ({ ...c, outputKg: v }))} required />
                <NumInput label={t('brokenKg')} value={close.brokenKg} onChange={v => setClose(c => ({ ...c, brokenKg: v }))} />
                <NumInput label={t('branKg')} value={close.branKg} onChange={v => setClose(c => ({ ...c, branKg: v }))} />
                <NumInput label={t('huskKg')} value={close.huskKg} onChange={v => setClose(c => ({ ...c, huskKg: v }))} />
                <NumInput label={t('wastageKg')} value={close.wastageKg} onChange={v => setClose(c => ({ ...c, wastageKg: v }))} />
              </div>
              {projectedRecovery != null && (
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  {t('projectedRecovery')}: <strong>{projectedRecovery}%</strong>
                </p>
              )}
              <button
                onClick={closeBatch}
                disabled={closing || !close.outputKg}
                className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2"
              >
                {closing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {t('closeBatchBtn')}
              </button>
            </div>
          )}

          {batch.status === 'closed' && (
            <div className="rounded-xl border border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={18} className="text-emerald-600" />
                <span className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                  {t('closed')} {batch.closedAt ? `· ${new Date(batch.closedAt).toLocaleDateString('en-IN')}` : ''}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                <StatMini label={t('output')} v={batch.outputKg} unit="Kg" />
                <StatMini label={t('brokenKg').replace(' Kg','')} v={batch.brokenKg} unit="Kg" />
                <StatMini label={t('branKg').replace(' Kg','')} v={batch.branKg} unit="Kg" />
                <StatMini label={t('huskKg').replace(' Kg','')} v={batch.huskKg} unit="Kg" />
                <StatMini label={t('recovery')} v={batch.recoveryPct} unit="%" bold />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StageCard({ stage, index, isActive, batchClosed, saving, onSave }: {
  stage: Stage; index: number; isActive: boolean; batchClosed: boolean; saving: boolean;
  onSave: (stage: Stage, patch: any) => void;
}) {
  const t = useTranslations('Mill');
  const [form, setForm] = useState({
    inputKg: String(stage.inputKg ?? ''), outputKg: String(stage.outputKg ?? ''),
    wastageKg: String(stage.wastageKg ?? ''), operatorName: stage.operatorName || '',
    notes: stage.notes || '',
  });
  const isDone = !!stage.completedAt;

  return (
    <div className={cn(
      'rounded-xl border p-4 space-y-3',
      isDone ? 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-500/5'
        : isActive ? 'border-amber-300 dark:border-amber-500/40 bg-amber-50/40 dark:bg-amber-500/5'
          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-black',
            isDone ? 'bg-emerald-500 text-white' : isActive ? 'bg-amber-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500')}>
            {isDone ? <CheckCircle2 size={14} /> : index + 1}
          </span>
          <span className="text-sm font-bold text-slate-900 dark:text-white">{STAGE_LABELS[stage.stageName] || stage.stageName}</span>
          {isDone ? (
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 ml-2">
              <CheckCircle2 size={14} /> {t('completed')}
            </span>
          ) : isActive ? <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 ml-2">{t('current')}</span> : null}
        </div>
        {stage.completedAt && (
          <span className="text-[10px] text-slate-500 flex items-center gap-1">
            <Clock size={10} /> {new Date(stage.completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>
      {!batchClosed && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <NumInput label={t('inputWeightKg')} value={form.inputKg} onChange={v => setForm(f => ({ ...f, inputKg: v }))} />
            <NumInput label={t('outputKg')} value={form.outputKg} onChange={v => setForm(f => ({ ...f, outputKg: v }))} />
            <NumInput label={t('wastageKg')} value={form.wastageKg} onChange={v => setForm(f => ({ ...f, wastageKg: v }))} />
            <TextInput label={t('operatorOptional')} value={form.operatorName} onChange={v => setForm(f => ({ ...f, operatorName: v }))} />
          </div>
          <TextInput label={t('notesOptional')} value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => onSave(stage, { ...form, inputKg: Number(form.inputKg) || null, outputKg: Number(form.outputKg) || null, wastageKg: Number(form.wastageKg) || null, operatorName: form.operatorName || null, notes: form.notes || null })}
              disabled={saving}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : t('saveStage')}
            </button>
            {!isDone ? (
              <button
                onClick={() => onSave(stage, { ...form, inputKg: Number(form.inputKg) || null, outputKg: Number(form.outputKg) || null, wastageKg: Number(form.wastageKg) || null, operatorName: form.operatorName || null, notes: form.notes || null, completed: true })}
                disabled={saving || !form.outputKg}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1"
              >
                {t('markAsCompleted')} <ArrowRight size={12} />
              </button>
            ) : (
              <button
                onClick={() => onSave(stage, { ...form, inputKg: Number(form.inputKg) || null, outputKg: Number(form.outputKg) || null, wastageKg: Number(form.wastageKg) || null, operatorName: form.operatorName || null, notes: form.notes || null, completed: false })}
                disabled={saving}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-500/30"
              >
                Reopen
              </button>
            )}
          </div>
        </div>
      )}
      {batchClosed && (
        <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-600 dark:text-slate-300">
          <span>Input: <strong>{stage.inputKg ?? '—'} Kg</strong></span>
          <span>Output: <strong>{stage.outputKg ?? '—'} Kg</strong></span>
          <span>Wastage: <strong>{stage.wastageKg ?? '—'} Kg</strong></span>
        </div>
      )}
    </div>
  );
}

function NumInput({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">{label}{required && ' *'}</span>
      <input
        type="number" min="0" step="0.01"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full h-9 px-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-950 text-sm"
      />
    </label>
  );
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">{label}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full h-9 px-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-950 text-sm"
      />
    </label>
  );
}

function StatMini({ label, v, unit, bold }: { label: string; v: number | null; unit: string; bold?: boolean }) {
  return (
    <div>
      <p className={cn('text-lg font-black', bold ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white')}>
        {v != null ? v : '—'}
        {v != null && <span className="text-[10px] font-normal text-slate-500 ml-0.5">{unit}</span>}
      </p>
      <p className="text-[10px] text-slate-500">{label}</p>
    </div>
  );
}
