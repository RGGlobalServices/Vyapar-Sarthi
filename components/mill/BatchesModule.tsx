'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Link } from '@/i18n/routing';
import ModalPortal from '@/components/mill/ModalPortal';
import useSWR from 'swr';
import {
  Plus, X, Loader2, ArrowRight, CheckCircle2, Factory, Wheat, Package, Percent, Clock, Layers, Search,
} from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

// Stage names are the mill's own (rice, wheat, millet … differ). A name is translated only when it happens to be one of these
// built-in keys; anything the user typed is shown exactly as typed.
const KNOWN_STAGES = ['cleaning', 'drying', 'shelling', 'polishing', 'packing', 'processing'];
const stageLabel = (t: any, name: string) => (KNOWN_STAGES.includes(name) ? t(name) : name);
const DEFAULT_STAGES_TEXT = 'Cleaning, Processing, Packing';
const OUTPUT_TYPES = ['finished_good', 'by_product', 'rejection'] as const;

type Stage = {
  id: string; stageName: string; sequence: number;
  inputKg: number | null; outputKg: number | null; wastageKg: number | null;
  operatorName: string | null; notes: string | null;
  startedAt: string; completedAt: string | null;
  extras?: { name: string; kg: number }[] | null;
};

type Batch = {
  id: string; batchNumber: string; status: 'open' | 'in_progress' | 'closed';
  currentStage: string; startedAt: string; closedAt: string | null;
  inputKg: number | null; outputKg: number | null; wastageKg: number | null;
  brokenKg: number | null; branKg: number | null; huskKg: number | null; recoveryPct: number | null;
  plannedOutputKg: number | null;
  notes: string | null; outputProductId: string | null;
  rawLot?: { id: string; lotNumber: string | null; farmerName: string | null; weightKg: number | null; remainingKg?: number | null;
    moisturePct?: number | null; ratePerKg?: number | null; purchaseDate?: string | null; source?: 'purchase' | 'weighbridge' | 'manual'; sourceRef?: string | null;
    product?: { id?: string; name: string } | null; supplier?: { name: string } | null };
  createdAt?: string | null;
  stages: Stage[];
  byProducts?: ByProductRow[];
  outputs?: OutputRow[];
};

type OutputRow = { id: string; name: string; outputType: string; quantity: number; unit: string; quantityKg: number; outputLotNumber: string | null; notes: string | null; productId: string | null };
type ByProductRow = { id: string; name: string; quantityKg: number | null; soldKg: number | null; ratePerKg: number | null; product?: { id: string; name: string } | null };

type RawLot = {
  id: string; lotNumber: string | null; farmerName: string | null;
  weightKg: number | null; remainingKg: number | null;
  productId?: string | null;
  purchaseDate?: string | null;
  source?: 'purchase' | 'weighbridge' | 'manual';
  sourceRef?: string | null;
  product?: { name: string } | null;
};

type ProductOption = { id: string; name: string; millCategory?: string | null; baseUnit?: string | null };

const fetcher = (u: string) => api.get(u).then(r => r.data);
const UNITS = [{ k: 'kg', kg: 1 }, { k: 'quintal', kg: 100 }, { k: 'ton', kg: 1000 }, { k: 'g', kg: 0.001 }];
const statusKey = (s: string) => (s === 'closed' ? 'statusClosed' : s === 'in_progress' ? 'statusInProgress' : 'statusOpen');
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const srcKey = (s?: string) => (s === 'weighbridge' ? 'srcWeighbridge' : s === 'purchase' ? 'srcPurchase' : 'srcManual');
function StatusPill({ status }: { status: string }) {
  const t = useTranslations('Mill');
  return <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap', statusTone(status))}>{t(statusKey(status))}</span>;
}
function SourceBadge({ source, ref_ }: { source?: string; ref_?: string | null }) {
  const t = useTranslations('Mill');
  return (
    <span className="whitespace-nowrap">
      <span className={cn('font-bold uppercase text-[10px] px-2 py-0.5 rounded-full',
        source === 'weighbridge' ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300'
          : source === 'purchase' ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300')}>{t(srcKey(source))}</span>
      {ref_ && <span className="ml-1.5 font-mono text-[10px] text-slate-500">{ref_}</span>}
    </span>
  );
}

const statusTone = (s: string) => s === 'closed'
  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
  : s === 'in_progress'
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';

export default function BatchesModule({ mode }: { mode: 'batches' | 'production' }) {
  const t = useTranslations('Mill');
  const searchParams = useSearchParams();
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const { data: batches = [], mutate: refetch, isLoading } = useSWR<Batch[]>(
    activeShopId ? ['/mill/batches', activeShopId] : null,
    ([u]) => fetcher(u),
    { revalidateOnFocus: true }
  );
  const { data: lots = [], mutate: mutateLots } = useSWR<RawLot[]>(
    activeShopId ? ['/mill/raw-lots?status=available', activeShopId] : null,
    ([u]) => fetcher(u),
  );
  const { data: products = [], mutate: mutateProducts } = useSWR<ProductOption[]>(
    activeShopId ? ['/products', activeShopId] : null,
    ([u]) => fetcher(u),
  );

  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Search / filters (client-side over the loaded batches)
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState<string>(mode === 'production' ? 'active' : '');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Deep link from Batches → "Open Production"
  useEffect(() => {
    const b = searchParams?.get('batch');
    if (b) setSelectedId(b);
  }, [searchParams]);

  const openBatch = batches.find(b => b.id === selectedId) || null;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return batches.filter(b => {
      if (statusF === 'active' ? b.status === 'closed' : statusF && b.status !== statusF) return false;
      if (needle) {
        const hay = `${b.batchNumber} ${b.rawLot?.product?.name || ''} ${b.rawLot?.lotNumber || ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      const d = (b.startedAt || b.createdAt || '').slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  }, [batches, q, statusF, dateFrom, dateTo]);
  const filtersOn = !!(q || dateFrom || dateTo || statusF !== (mode === 'production' ? 'active' : ''));

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
            <Factory size={22} className="text-amber-600" /> {mode === 'production' ? t('productionTitle') : t('title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {mode === 'production' ? t('productionSubtitle') : t('subtitle')}
          </p>
        </div>
        {mode === 'batches' && (
          <button
            onClick={() => setCreating(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors"
          >
            <Plus size={18} /> {t('newBatch')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={Wheat} label={t('openInProgress')} value={stats.open} tone="amber" />
        <StatCard icon={CheckCircle2} label={t('closed')} value={stats.closed} tone="emerald" />
        <StatCard icon={Percent} label={t('avgRecovery')} value={stats.avgRecovery != null ? `${stats.avgRecovery}%` : '—'} tone="blue" />
      </div>

      <div className="flex flex-wrap items-end gap-2" data-testid="batch-filters">
        <label className="relative flex-1 min-w-[12rem]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('searchPlaceholder')}
            className="w-full h-10 pl-9 pr-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm" />
        </label>
        <select value={statusF} onChange={e => setStatusF(e.target.value)}
          className="h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm">
          <option value="">{t('allStatuses')}</option>
          <option value="active">{t('activeOnly')}</option>
          <option value="open">{t('statusOpen')}</option>
          <option value="in_progress">{t('statusInProgress')}</option>
          <option value="closed">{t('statusClosed')}</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} aria-label={t('dateFrom')}
          className="h-10 px-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} aria-label={t('dateTo')}
          className="h-10 px-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm" />
        {filtersOn && (
          <button onClick={() => { setQ(''); setDateFrom(''); setDateTo(''); setStatusF(mode === 'production' ? 'active' : ''); }}
            className="h-10 px-3 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white">{t('clearFilters')}</button>
        )}
      </div>

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <Factory size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm text-slate-500">{batches.length === 0 ? (mode === 'production' ? t('noActiveBatches') : t('noBatches')) : t('noMatchingBatches')}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[760px]" data-testid="batch-table">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 font-bold">{t('colBatch')}</th>
                <th className="px-3 py-3 font-bold">{t('colRawMaterial')}</th>
                <th className="px-3 py-3 font-bold text-right">{t('colInput')}</th>
                <th className="px-3 py-3 font-bold">{t('colLot')}</th>
                <th className="px-3 py-3 font-bold text-right">{t('colOutput')}</th>
                <th className="px-3 py-3 font-bold text-right">{t('colRecovery')}</th>
                <th className="px-3 py-3 font-bold">{t('colStatus')}</th>
                <th className="px-3 py-3 font-bold">{t('colDate')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map(b => (
                <tr key={b.id} onClick={() => setSelectedId(b.id)} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors">
                  <td className="px-4 py-2.5 font-black text-slate-900 dark:text-white whitespace-nowrap">{b.batchNumber}</td>
                  <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{b.rawLot?.product?.name || '—'}</td>
                  <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">{(b.inputKg || 0).toLocaleString('en-IN')} Kg</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-300">{b.rawLot?.lotNumber || '—'}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">{b.status === 'closed' && b.outputKg != null ? `${b.outputKg.toLocaleString('en-IN')} Kg` : '—'}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">{b.recoveryPct != null ? `${b.recoveryPct}%` : '—'}</td>
                  <td className="px-3 py-2.5"><StatusPill status={b.status} /></td>
                  <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{fmtDate(b.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <ModalPortal><CreateBatchModal
          lots={lots}
          onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); refetch(); mutateLots(); setSelectedId(id); }}
        /></ModalPortal>
      )}
      {openBatch && (
        <ModalPortal><BatchDetail
          mode={mode}
          batch={openBatch}
          products={products}
          onClose={() => setSelectedId(null)}
          onChanged={() => { refetch(); mutateProducts(); mutateLots(); }}
        /></ModalPortal>
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

function VarianceBadge({ planned, actual, t }: { planned: number; actual: number; t: any }) {
  if (planned <= 0) return null;
  const diffPct = Math.round(((actual - planned) / planned) * 1000) / 10;
  const short = diffPct < -5; // more than 5% under plan
  return (
    <span className={cn(
      'inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full',
      short ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400'
        : diffPct > 0 ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
    )}>
      {t('variance')}: {diffPct > 0 ? '+' : ''}{diffPct}%
    </span>
  );
}

function CreateBatchModal({ lots, onClose, onCreated }: {
  lots: RawLot[]; onClose: () => void; onCreated: (id: string) => void;
}) {
  const t = useTranslations('Mill');
  const [form, setForm] = useState({ rawLotId: lots[0]?.id || '', inputKg: '', unit: 'kg', plannedOutputKg: '', stages: DEFAULT_STAGES_TEXT, batchNumber: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // The lots list can finish loading after this modal mounts; until the user picks one, the select shows (and we use) the first lot.
  const rawLotId = form.rawLotId || lots[0]?.id || '';
  const lot = lots.find(l => l.id === rawLotId);
  const cap = lot?.remainingKg ?? lot?.weightKg ?? 0;
  // Total on hand of the selected raw material across all its lots (informational — the server re-validates the chosen lot).
  const materialTotal = lot?.productId ? lots.filter(l => l.productId === lot.productId).reduce((s, l) => s + (l.remainingKg ?? 0), 0) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = await api.post('/mill/batches', {
        rawLotId: rawLotId || null,
        productId: lot?.productId || undefined,
        inputQuantity: Number(form.inputKg),
        unit: form.unit,
        batchNumber: form.batchNumber.trim() || undefined,
        plannedOutputKg: form.plannedOutputKg || undefined,
        stages: form.stages.split(',').map(x => x.trim()).filter(Boolean),
        notes: form.notes,
      });
      onCreated(res.data.id);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('failedToCreate'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-black">{t('newProductionBatch')}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('rawMaterialLot')}</label>
            <select
              value={rawLotId}
              onChange={e => setForm({ ...form, rawLotId: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
              required
            >
              {lots.length === 0 && <option value="">{t('noAvailableLots')}</option>}
              {lots.map(l => (
                <option key={l.id} value={l.id}>
                  {l.lotNumber || t('unnamedLot')} | {l.product?.name || 'Raw'} | {(l.remainingKg ?? l.weightKg ?? 0).toLocaleString('en-IN')} Kg {t('avail')} | {t(srcKey(l.source))}
                  {l.farmerName ? ` | ${l.farmerName}` : ''}{l.purchaseDate ? ` | ${fmtDate(l.purchaseDate)}` : ''}
                </option>
              ))}
            </select>
            {lot && (
              <p className="text-[11px] text-slate-500 mt-1">
                {t('availableInLot', { qty: cap })}{materialTotal != null && lot.product?.name ? ` · ${t('availableMaterial', { name: lot.product.name, qty: materialTotal })}` : ''}
              </p>
            )}
            {lot && !lot.productId && <p className="text-[11px] text-red-500 mt-1">{t('lotNeedsProduct')}</p>}
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
              {t('inputQuantity')}
              {lot && <span className="ml-2 font-normal text-slate-400 lowercase">{t('maxKgFromLot', { cap })}</span>}
            </label>
            <div className="flex gap-2">
              <input
                type="number" min="0" step="any"
                value={form.inputKg}
                onChange={e => setForm({ ...form, inputKg: e.target.value })}
                className="flex-1 min-w-0 h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
                required
              />
              <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} aria-label={t('unit')}
                className="w-28 h-10 px-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
                {UNITS.map(u => <option key={u.k} value={u.k}>{u.k}</option>)}
              </select>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">{t('consumedOnFinalizeHint')}</p>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('batchNumberOptional')}</label>
            <input
              value={form.batchNumber}
              onChange={e => setForm({ ...form, batchNumber: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
              placeholder="PB-2026-001"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('processingStages')}</label>
            <input
              value={form.stages}
              onChange={e => setForm({ ...form, stages: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
            />
            <p className="text-[10px] text-slate-400 mt-1">{t('processingStagesHint')}</p>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('plannedOutputKgOptional')}</label>
            <input
              type="number" min="0" step="0.01"
              value={form.plannedOutputKg}
              onChange={e => setForm({ ...form, plannedOutputKg: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
              placeholder={t('plannedOutputPlaceholder')}
            />
            <p className="text-[10px] text-slate-400 mt-1">{t('plannedOutputHint')}</p>
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
            disabled={saving || !rawLotId || !form.inputKg || (lot && !lot.productId)}
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

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs py-1">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="font-semibold text-slate-800 dark:text-slate-200 text-right break-words min-w-0">{children}</span>
    </div>
  );
}

function BatchDetail({ mode, batch, products, onClose, onChanged }: { mode: 'batches' | 'production'; batch: Batch; products: ProductOption[]; onClose: () => void; onChanged: () => void }) {
  const t = useTranslations('Mill');
  const [saving, setSaving] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const lot = batch.rawLot;
  const patchStage = async (stage: Stage, patch: any) => {
    setSaving(stage.id);
    try {
      await api.patch(`/mill/batches/${batch.id}/stages/${stage.id}`, patch);
      onChanged();
    } catch (err: any) {
      alert(err?.response?.data?.error || t('failedToUpdateStage'));
    } finally { setSaving(null); }
  };
  // Hand the batch over to Production. Consumes nothing — stock moves only when the batch is finalized.
  const startProduction = async () => {
    setStarting(true); setStartError('');
    try {
      await api.post(`/mill/batches/${batch.id}/start`, {});
      onChanged();
    } catch (err: any) {
      setStartError(err?.response?.data?.detail || err?.response?.data?.error || t('startFailed'));
    } finally { setStarting(false); }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-slate-50 dark:bg-slate-900 w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col h-[92vh] sm:h-auto sm:max-h-[92vh]">
        <div className="p-5 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sm:rounded-t-2xl flex items-start justify-between shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-900 dark:text-white">{batch.batchNumber}</h2>
              <StatusPill status={batch.status} />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {lot?.product?.name && `${lot.product.name} · `}
              {lot?.lotNumber && `${t('lot')} ${lot.lotNumber} · `}
              {t('input')} {batch.inputKg || 0} Kg · {t('started')} {new Date(batch.startedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Batch information + raw material (both screens) */}
          <div className="grid sm:grid-cols-2 gap-3" data-testid="batch-info">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">{t('sectionBatch')}</p>
              <InfoRow label={t('colBatch')}>{batch.batchNumber}</InfoRow>
              <InfoRow label={t('colDate')}>{fmtDate(batch.startedAt)}</InfoRow>
              <InfoRow label={t('colRawMaterial')}>{lot?.product?.name || '—'}</InfoRow>
              <InfoRow label={t('colInput')}>{(batch.inputKg || 0).toLocaleString('en-IN')} Kg</InfoRow>
              <InfoRow label={t('colStatus')}><StatusPill status={batch.status} /></InfoRow>
              <InfoRow label={t('createdAt')}>{fmtDate(batch.createdAt || batch.startedAt)}</InfoRow>
              {batch.plannedOutputKg != null && <InfoRow label={t('plannedOutput')}>{batch.plannedOutputKg} Kg</InfoRow>}
              {batch.notes && <InfoRow label={t('notesOptional')}>{batch.notes}</InfoRow>}
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">{t('sectionRawMaterial')}</p>
              <InfoRow label={t('colLot')}>{lot?.lotNumber || '—'}</InfoRow>
              <InfoRow label={t('source')}><SourceBadge source={lot?.source} ref_={lot?.sourceRef} /></InfoRow>
              <InfoRow label={t('vendor')}>{lot?.farmerName || lot?.supplier?.name || '—'}</InfoRow>
              <InfoRow label={t('lotAvailableNow')}>{lot?.remainingKg != null ? `${lot.remainingKg.toLocaleString('en-IN')} / ${(lot.weightKg ?? 0).toLocaleString('en-IN')} Kg` : '—'}</InfoRow>
              <InfoRow label={t('rate')}>{lot?.ratePerKg != null ? `₹${lot.ratePerKg}/Kg` : '—'}</InfoRow>
              <InfoRow label={t('moisture')}>{lot?.moisturePct != null ? `${lot.moisturePct}%` : '—'}</InfoRow>
            </div>
          </div>

          {/* Stages: read-only summary on Batches, executable on Production */}
          {mode === 'batches' && batch.stages.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">{t('sectionStages')}</p>
              <div className="flex flex-wrap gap-2">
                {batch.stages.map((st, i) => (
                  <span key={st.id} className={cn('text-xs font-semibold px-2.5 py-1 rounded-full border',
                    st.completedAt ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : st.stageName === batch.currentStage && batch.status !== 'closed' ? 'border-amber-300 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500')}>
                    {i + 1}. {stageLabel(t, st.stageName)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {batch.status === 'closed' && <ClosedSummary batch={batch} />}

          {/* Handoff */}
          {batch.status !== 'closed' && mode === 'batches' && (
            <div className="rounded-xl border border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 p-4 space-y-2" data-testid="handoff">
              <p className="text-xs text-slate-600 dark:text-slate-300">{batch.status === 'open' ? t('handoffReady') : t('handoffInProgress')}</p>
              {startError && <p className="text-sm text-red-500">{startError}</p>}
              {batch.status === 'open' ? (
                <button onClick={startProduction} disabled={starting}
                  className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
                  {starting ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />} {t('startProduction')}
                </button>
              ) : (
                <Link href={`/production?batch=${batch.id}` as any}
                  className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center justify-center gap-2">
                  <ArrowRight size={15} /> {t('openProduction')}
                </Link>
              )}
            </div>
          )}

          {mode === 'production' && batch.status === 'open' && (
            <div className="rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-4 space-y-2" data-testid="start-here">
              <p className="text-xs text-slate-600 dark:text-slate-300">{t('notStartedHint')}</p>
              {startError && <p className="text-sm text-red-500">{startError}</p>}
              <button onClick={startProduction} disabled={starting}
                className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
                {starting ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />} {t('startProduction')}
              </button>
            </div>
          )}

          {mode === 'production' && batch.status === 'in_progress' && (
            <>
              <div className="text-xs font-bold uppercase text-slate-500 mb-2">{t('stageWorkflow')}</div>
              {batch.stages.map((stage, idx) => (
                <StageCard
                  key={stage.id}
                  stage={stage}
                  index={idx}
                  isActive={stage.stageName === batch.currentStage}
                  batchClosed={false}
                  saving={saving === stage.id}
                  onSave={patchStage}
                />
              ))}
              <FinalizePanel batch={batch} products={products} onDone={onChanged} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

type OutRow = { key: number; outputType: string; productId: string; name: string; quantity: string; unit: string; lot: string; notes: string };

const WEIGHT_UNITS = ['kg', 'quintal', 'ton', 'g'];
const fmtKg = (n: number) => `${Math.round(n * 1000) / 1000}`;
const toKgClient = (q: number, u: string) => q * ({ kg: 1, g: 0.001, quintal: 100, ton: 1000 } as Record<string, number>)[u];

function FinalizePanel({ batch, products, onDone }: { batch: Batch; products: ProductOption[]; onDone: () => void }) {
  const t = useTranslations('Mill');
  const [rows, setRows] = useState<OutRow[]>([{ key: 1, outputType: 'finished_good', productId: '', name: '', quantity: '', unit: 'kg', lot: '', notes: '' }]);
  const [lossKg, setLossKg] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newFor, setNewFor] = useState<number | null>(null);   // row key that is creating a new product
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const input = Number(batch.inputKg) || 0;
  const outputsKg = rows.reduce((s, r) => s + (Number(r.quantity) > 0 ? toKgClient(Number(r.quantity), r.unit) : 0), 0);
  const loss = Number(lossKg) || 0;
  const diff = Math.round((input - outputsKg - loss) * 1000) / 1000;   // display only — the server re-checks the balance
  const balanced = Math.abs(diff) <= 0.005;

  const setRow = (key: number, patch: Partial<OutRow>) => setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r));
  const addRow = () => setRows(rs => [...rs, { key: Math.max(0, ...rs.map(r => r.key)) + 1, outputType: 'finished_good', productId: '', name: '', quantity: '', unit: 'kg', lot: '', notes: '' }]);

  // Only after the user confirms: create the product in Product Master, then link it to this output row.
  const createProduct = async (row: OutRow) => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true); setError('');
    try {
      const millCategory = row.outputType === 'by_product' ? 'by_product' : 'finished_goods';
      const res = await api.post('/products', { name, category: millCategory === 'by_product' ? 'By-Products' : 'Finished Goods', millCategory, baseUnit: 'kg', currentStock: 0, sellingPrice: 0 });
      setRow(row.key, { productId: res.data.id, name });
      products.push({ id: res.data.id, name, millCategory, baseUnit: 'kg' });
      setNewFor(null); setNewName('');
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || t('failedToCreateProduct'));
    } finally { setCreating(false); }
  };

  const finalize = async () => {
    setSaving(true); setError('');
    try {
      await api.post(`/mill/batches/${batch.id}/finalize`, {
        outputs: rows.map(r => ({
          outputType: r.outputType, productId: r.productId || null, name: r.name,
          quantity: Number(r.quantity), unit: r.unit, outputLotNumber: r.lot || null, notes: r.notes || null,
        })),
        lossKg: loss,
      });
      onDone();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || t('failedToClose'));
    } finally { setSaving(false); }
  };

  const canSubmit = rows.length > 0 && rows.every(r => Number(r.quantity) > 0 && (r.outputType !== 'finished_good' || r.productId) && (r.productId || r.name.trim())) && balanced && !saving;

  return (
    <div className="rounded-xl border border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 p-4 space-y-3" data-testid="finalize-panel">
      <div className="flex items-center gap-2">
        <Package size={16} className="text-emerald-600" />
        <span className="text-sm font-bold text-emerald-800 dark:text-emerald-300">{t('finalizeTitle')}</span>
      </div>
      <p className="text-[11px] text-slate-600 dark:text-slate-400">{t('finalizeHint', { qty: fmtKg(input) })}</p>

      {rows.map((r, i) => (
        <div key={r.key} className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 space-y-2" data-testid="output-row">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="block col-span-2 sm:col-span-1">
              <span className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">{t('outputType')}</span>
              <select value={r.outputType} onChange={e => setRow(r.key, { outputType: e.target.value })}
                className="w-full h-9 px-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-950 text-sm">
                {OUTPUT_TYPES.map(o => <option key={o} value={o}>{t(`type_${o}`)}</option>)}
              </select>
            </label>
            <label className="block col-span-2">
              <span className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">{t('outputProduct')}</span>
              <select
                value={newFor === r.key ? '__new__' : r.productId}
                onChange={e => {
                  if (e.target.value === '__new__') { setNewFor(r.key); setNewName(r.name); }
                  else { setNewFor(null); const p = products.find(x => x.id === e.target.value); setRow(r.key, { productId: e.target.value, name: p?.name || r.name }); }
                }}
                className="w-full h-9 px-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-950 text-sm">
                <option value="">{r.outputType === 'finished_good' ? t('selectProduct') : t('notTracked')}</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                <option value="__new__">{t('createNewProduct')}</option>
              </select>
            </label>
            <div className="flex items-end justify-end">
              {rows.length > 1 && (
                <button onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))} className="h-9 px-2 text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md">{t('removeOutput')}</button>
              )}
            </div>
          </div>
          {newFor === r.key && (
            <div className="flex flex-wrap items-end gap-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-md p-2">
              <label className="block flex-1 min-w-[10rem]">
                <span className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">{t('newProductName')}</span>
                <input value={newName} onChange={e => setNewName(e.target.value)} className="w-full h-9 px-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-950 text-sm" />
              </label>
              <button onClick={() => createProduct(r)} disabled={creating || !newName.trim()} className="h-9 px-3 text-xs font-bold rounded-md bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50">
                {creating ? <Loader2 size={12} className="animate-spin" /> : t('confirmCreateProduct')}
              </button>
              <button onClick={() => setNewFor(null)} className="h-9 px-2 text-xs font-semibold text-slate-500">{t('cancelBtn')}</button>
              <p className="basis-full text-[10px] text-amber-700 dark:text-amber-400">{t('newProductHint')}</p>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {!r.productId && (
              <TextInput label={t('outputName')} value={r.name} onChange={v => setRow(r.key, { name: v })} />
            )}
            <NumInput label={t('quantity')} value={r.quantity} onChange={v => setRow(r.key, { quantity: v })} required />
            <label className="block">
              <span className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">{t('unit')}</span>
              <select value={r.unit} onChange={e => setRow(r.key, { unit: e.target.value })}
                className="w-full h-9 px-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-950 text-sm">
                {WEIGHT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
            <TextInput label={t('outputLot')} value={r.lot} placeholder={batch.batchNumber} onChange={v => setRow(r.key, { lot: v })} />
            <TextInput label={t('notesOptional')} value={r.notes} onChange={v => setRow(r.key, { notes: v })} />
          </div>
          <span className="sr-only">{i}</span>
        </div>
      ))}

      <button onClick={addRow} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
        <Plus size={13} /> {t('addOutput')}
      </button>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
        <NumInput label={t('lossKg')} value={lossKg} onChange={setLossKg} />
        <div className="col-span-2 sm:col-span-3 text-[11px] leading-relaxed" data-testid="balance-line">
          <span className="text-slate-600 dark:text-slate-300">{t('balanceInput')} <strong>{fmtKg(input)}</strong> kg</span>
          {' = '}<span className="text-slate-600 dark:text-slate-300">{t('balanceOutputs')} <strong>{fmtKg(outputsKg)}</strong></span>
          {' + '}<span className="text-slate-600 dark:text-slate-300">{t('balanceLoss')} <strong>{fmtKg(loss)}</strong></span>
          <span className={cn('ml-2 font-bold', balanced ? 'text-emerald-600' : 'text-red-500')}>
            {balanced ? t('balanced') : diff > 0 ? t('unaccounted', { qty: fmtKg(diff) }) : t('exceedsInput', { qty: fmtKg(Math.abs(diff)) })}
          </span>
        </div>
      </div>

      {error && <p className="text-sm text-red-500" data-testid="finalize-error">{error}</p>}
      <button
        onClick={finalize}
        disabled={!canSubmit}
        className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
        {t('finalizeBtn')}
      </button>
    </div>
  );
}

function ClosedSummary({ batch }: { batch: Batch }) {
  const t = useTranslations('Mill');
  const outs = batch.outputs || [];
  return (
    <div className="rounded-xl border border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 p-4 space-y-3" data-testid="closed-summary">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={18} className="text-emerald-600" />
        <span className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
          {t('closed')} {batch.closedAt ? `· ${new Date(batch.closedAt).toLocaleDateString('en-IN')}` : ''}
        </span>
      </div>
      <div className="text-xs space-y-1">
        <p className="font-bold uppercase text-[10px] text-slate-500">{t('input')}</p>
        <p className="text-slate-800 dark:text-slate-200">{batch.rawLot?.product?.name || t('rawMaterialLot')} · {t('lot')} {batch.rawLot?.lotNumber || '—'} — <strong>{fmtKg(Number(batch.inputKg) || 0)} kg</strong></p>
      </div>
      <div className="text-xs space-y-1">
        <p className="font-bold uppercase text-[10px] text-slate-500">{t('outputsTitle')}</p>
        <ul className="space-y-1">
          {outs.map(o => (
            <li key={o.id} className="flex items-center justify-between gap-2 bg-white dark:bg-slate-900 rounded-md px-3 py-1.5 border border-slate-200 dark:border-slate-800">
              <span className="min-w-0 truncate"><strong>{o.name}</strong> <span className="text-[10px] uppercase text-slate-500">· {t(`type_${o.outputType}`)}{o.outputLotNumber ? ` · ${o.outputLotNumber}` : ''}</span></span>
              <span className="font-bold shrink-0">{fmtKg(o.quantity)} {o.unit}</span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-2 bg-white dark:bg-slate-900 rounded-md px-3 py-1.5 border border-slate-200 dark:border-slate-800">
            <span className="capitalize"><strong>{t('balanceLoss')}</strong></span>
            <span className="font-bold">{fmtKg(Number(batch.wastageKg) || 0)} kg</span>
          </li>
        </ul>
      </div>
      <div className="grid grid-cols-2 gap-3 text-center">
        <StatMini label={t('output')} v={batch.outputKg} unit="Kg" />
        <StatMini label={t('recovery')} v={batch.recoveryPct} unit="%" bold />
      </div>
      {batch.plannedOutputKg != null && batch.outputKg != null && (
        <div className="pt-2 border-t border-emerald-200 dark:border-emerald-500/20">
          <VarianceBadge planned={batch.plannedOutputKg} actual={batch.outputKg} t={t} />
          <span className="text-[11px] text-slate-500 ml-2">{t('plannedOutput')} {batch.plannedOutputKg} Kg</span>
        </div>
      )}
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
    extras: (stage.extras || []).map(e => ({ name: e.name, kg: String(e.kg) })),
  });
  const isDone = !!stage.completedAt;
  // The mill's own extra columns for this stage (tukada, kani, bhusa …). The server validates them again.
  const extrasPayload = form.extras.filter(e => e.name.trim() || e.kg !== '').map(e => ({ name: e.name.trim(), kg: Number(e.kg) }));
  const extrasKg = form.extras.reduce((a, e) => a + (Number(e.kg) > 0 ? Number(e.kg) : 0), 0);
  const stageIn = Number(form.inputKg) || 0;
  const stageLeft = Math.round((stageIn - (Number(form.outputKg) || 0) - (Number(form.wastageKg) || 0) - extrasKg) * 1000) / 1000;

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
          <span className="text-sm font-bold text-slate-900 dark:text-white">{stageLabel(t, stage.stageName)}</span>
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
          <div className="space-y-2" data-testid="stage-extras">
            {form.extras.map((ex, i) => (
              <div key={i} className="grid grid-cols-[1fr_7rem_auto] gap-2 items-end">
                <TextInput label={t('extraName')} value={ex.name} placeholder={t('extraNamePlaceholder')} onChange={v => setForm(f => ({ ...f, extras: f.extras.map((x, j) => j === i ? { ...x, name: v } : x) }))} />
                <NumInput label="Kg" value={ex.kg} onChange={v => setForm(f => ({ ...f, extras: f.extras.map((x, j) => j === i ? { ...x, kg: v } : x) }))} />
                <button type="button" onClick={() => setForm(f => ({ ...f, extras: f.extras.filter((_, j) => j !== i) }))} aria-label="Remove"
                  className="h-9 w-9 flex items-center justify-center rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"><X size={14} /></button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => setForm(f => ({ ...f, extras: [...f.extras, { name: '', kg: '' }] }))}
                className="text-xs font-bold px-3 py-1.5 rounded-lg border border-dashed border-emerald-400 text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                <Plus size={12} /> {t('addExtraColumn')}
              </button>
              {stageIn > 0 && (
                <span className={cn('text-[11px] font-semibold', Math.abs(stageLeft) <= 0.005 ? 'text-emerald-600' : stageLeft < 0 ? 'text-red-500' : 'text-slate-500')}>
                  {stageLeft < -0.005 ? t('stageOver', { qty: Math.abs(stageLeft) }) : t('stageLeft', { qty: stageLeft })}
                </span>
              )}
            </div>
          </div>
          <TextInput label={t('notesOptional')} value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => onSave(stage, { ...form, inputKg: Number(form.inputKg) || null, outputKg: Number(form.outputKg) || null, wastageKg: Number(form.wastageKg) || null, operatorName: form.operatorName || null, notes: form.notes || null, extras: extrasPayload })}
              disabled={saving}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : t('saveStage')}
            </button>
            {!isDone ? (
              <button
                onClick={() => onSave(stage, { ...form, inputKg: Number(form.inputKg) || null, outputKg: Number(form.outputKg) || null, wastageKg: Number(form.wastageKg) || null, operatorName: form.operatorName || null, notes: form.notes || null, extras: extrasPayload, completed: true })}
                disabled={saving || !form.outputKg}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1"
              >
                {t('markAsCompleted')} <ArrowRight size={12} />
              </button>
            ) : (
              <button
                onClick={() => onSave(stage, { ...form, inputKg: Number(form.inputKg) || null, outputKg: Number(form.outputKg) || null, wastageKg: Number(form.wastageKg) || null, operatorName: form.operatorName || null, notes: form.notes || null, extras: extrasPayload, completed: false })}
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
          {(stage.extras || []).map(e => <span key={e.name}>{e.name}: <strong>{e.kg} Kg</strong></span>)}
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

function TextInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
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
