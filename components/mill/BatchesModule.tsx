'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Link } from '@/i18n/routing';
import ModalPortal from '@/components/mill/ModalPortal';
import useSWR, { useSWRConfig } from 'swr';
import {
  Plus, X, Loader2, ArrowRight, CheckCircle2, Factory, Wheat, Package, Percent, Clock, Layers, Search, Download, FileText,
} from 'lucide-react';
import api, { downloadBlob } from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { stageLabel } from '@/lib/millLabels';
import ProductionStageBuilder, { getProductSmartSuggestions } from './ProductionStageBuilder';
import StageTimeline from './StageTimeline';
import StageExecutionPanel from './StageExecutionPanel';
import DynamicExecutionFields from './DynamicExecutionFields';

// Stage names are the mill's own (rice, wheat, millet … differ). A name is translated only when it happens to be one of these
// built-in keys; anything the user typed is shown exactly as typed.
const DEFAULT_STAGES_TEXT = 'Cleaning, Processing, Packing';
const OUTPUT_TYPES = ['finished_good', 'wip', 'by_product', 'rejection'] as const;

type Stage = {
  id: string; stageName: string; sequence: number;
  inputKg: number | null; outputKg: number | null; wastageKg: number | null;
  operatorName: string | null; notes: string | null;
  startedAt: string; completedAt: string | null;
  extras?: { name: string; kg: number }[] | null;
};

type Batch = {
  id: string; batchNumber: string; status: 'open' | 'in_progress' | 'closed';
  batchType?: string; rejectionLotId?: string | null;
  currentStage: string; startedAt: string; closedAt: string | null;
  inputKg: number | null; outputKg: number | null; wastageKg: number | null;
  brokenKg: number | null; branKg: number | null; huskKg: number | null; recoveryPct: number | null;
  plannedOutputKg: number | null;
  notes: string | null; outputProductId: string | null;
  rawLot?: { id: string; lotNumber: string | null; farmerName: string | null; quantity: number | null; remainingQuantity?: number | null;
    allocatedKg?: number | null; availableKg?: number | null; consumedKg?: number | null; receivedDate?: string | null;
    moisturePct?: number | null; ratePerUnit?: number | null; purchaseDate?: string | null; source?: 'purchase' | 'weighbridge' | 'manual'; sourceRef?: string | null;
    product?: { id?: string; name: string } | null; supplier?: { name: string } | null };
  createdAt?: string | null;
  stages: Stage[];
  byProducts?: ByProductRow[];
  outputs?: OutputRow[];
  jobWorkOrder?: {
    id: string;
    orderNumber: string;
    materialDescription: string;
    inputWeightKg: number;
    byproductRetainedByMill: boolean;
    customer?: { id: string; name: string; mobile?: string | null };
  } | null;
  inputLots?: any[];
  wipLots?: any[];
  finishedGoodsLots?: any[];
  byProductLots?: any[];
  rejectionLots?: any[];
};

type OutputRow = { id: string; name: string; outputType: string; quantity: number; unit: string; quantityKg: number; outputLotNumber: string | null; notes: string | null; productId: string | null };
type ByProductRow = { id: string; name: string; quantityKg: number | null; soldKg: number | null; ratePerUnit: number | null; product?: { id: string; name: string } | null };

type RawLot = {
  id: string; lotNumber: string | null; farmerName: string | null;
  quantity: number | null; remainingQuantity: number | null;
  allocatedKg?: number | null; availableKg?: number | null; consumedKg?: number | null;
  productId?: string | null;
  purchaseDate?: string | null;
  receivedDate?: string | null;
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
  const { mutate: globalMutate } = useSWRConfig();

  // Targeted lot revalidation — only invalidates raw-lots keys, not the entire SWR cache.
  const mutateAllLots = () => {
    mutateLots();
    globalMutate(
      (key: any) => Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith('/mill/raw-lots'),
      undefined,
      { revalidate: true }
    );
  };

  // Optimistic patch: update the SWR batches cache directly from the API response,
  // avoiding an extra network round-trip for the list re-fetch.
  const patchBatchInCache = (updated: Batch) => {
    refetch(
      (current = []) => current.map(b => (b.id === updated.id ? { ...b, ...updated } : b)),
      { revalidate: false } // update cache immediately; background revalidation happens via scheduleRevalidateAll
    );
  };
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
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                    {b.rawLot?.id ? (
                      <Link
                        href={`/raw-material?lot=${b.rawLot.id}` as any}
                        onClick={e => e.stopPropagation()}
                        className="text-emerald-600 dark:text-emerald-400 hover:underline font-bold"
                        title="View Raw Material Lot"
                      >
                        {b.rawLot.lotNumber || 'Lot Details'}
                      </Link>
                    ) : (
                      b.rawLot?.lotNumber || '—'
                    )}
                  </td>
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
          onCreated={(id) => { setCreating(false); refetch(); mutateAllLots(); setSelectedId(id); }}
        /></ModalPortal>
      )}
      {openBatch && (
        <ModalPortal><BatchDetail
          mode={mode}
          batch={openBatch}
          products={products}
          onClose={() => setSelectedId(null)}
          onChanged={() => { refetch(); mutateProducts(); mutateAllLots(); }}
          onBatchUpdated={patchBatchInCache}
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
  const [sourceType, setSourceType] = useState<'raw_lot' | 'job_work'>('raw_lot');
  const [form, setForm] = useState({ rawLotId: lots[0]?.id || '', inputKg: '', unit: 'kg', plannedOutputKg: '', batchNumber: '', notes: '' });
  const [jobWorkOrderId, setJobWorkOrderId] = useState<string>('');
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [templateLoaded, setTemplateLoaded] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);

  // Fetch active Job Work orders
  const { data: jobWorkOrders = [] } = useSWR<any[]>('/mill/job-work');
  const activeJwOrders = jobWorkOrders.filter((j: any) => j.status === 'received' || j.status === 'processing');

  const rawLotId = form.rawLotId || lots[0]?.id || '';
  const lot = lots.find(l => l.id === rawLotId);
  const cap = lot?.availableKg ?? lot?.remainingQuantity ?? lot?.quantity ?? 0;
  const materialTotal = lot?.productId ? lots.filter(l => l.productId === lot.productId).reduce((s, l) => s + (l.availableKg ?? l.remainingQuantity ?? 0), 0) : null;

  const selectedJw = activeJwOrders.find((j: any) => j.id === jobWorkOrderId);

  // Auto-fill Job Work initial selection
  useEffect(() => {
    if (sourceType === 'job_work' && !jobWorkOrderId && activeJwOrders.length > 0) {
      const first = activeJwOrders[0];
      setJobWorkOrderId(first.id);
      setForm(f => ({ ...f, inputKg: String(first.inputWeightKg || '') }));
      setSelectedStages(getProductSmartSuggestions(first.materialDescription || 'Paddy'));
    }
  }, [sourceType, activeJwOrders, jobWorkOrderId]);

  // When selected lot changes (for raw lot source), fetch product stage template or set smart suggestions
  useEffect(() => {
    if (sourceType === 'job_work') {
      if (selectedJw) {
        setSelectedStages(getProductSmartSuggestions(selectedJw.materialDescription || 'Paddy'));
      }
      return;
    }
    const productId = lot?.productId;
    if (!productId) {
      setTemplateLoaded(false);
      setSelectedStages(getProductSmartSuggestions(lot?.product?.name));
      return;
    }
    let cancelled = false;
    setTemplateLoading(true);
    api.get(`/mill/stage-templates/${productId}`)
      .then((r) => {
        if (cancelled) return;
        const stages: string[] = r.data.stages ?? [];
        if (stages.length > 0) {
          setSelectedStages(stages);
          setTemplateLoaded(true);
        } else {
          setSelectedStages(getProductSmartSuggestions(lot?.product?.name));
          setTemplateLoaded(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedStages(getProductSmartSuggestions(lot?.product?.name));
          setTemplateLoaded(false);
        }
      })
      .finally(() => { if (!cancelled) setTemplateLoading(false); });
    return () => { cancelled = true; };
  }, [lot?.productId, sourceType, selectedJw]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStages.length === 0) {
      setError('Please select or add at least one production stage.');
      return;
    }
    setSaving(true); setError('');
    try {
      if (sourceType === 'raw_lot' && saveAsDefault && lot?.productId) {
        try {
          await api.put(`/mill/stage-templates/${lot.productId}`, { stages: selectedStages });
        } catch (err) {
          // Ignore non-fatal template save error
        }
      }

      if (sourceType === 'job_work') {
        if (!jobWorkOrderId) {
          setError('Please select an active Job Work order.');
          return;
        }
        const res = await api.post('/mill/batches', {
          jobWorkOrderId,
          inputQuantity: Number(form.inputKg),
          unit: form.unit,
          batchNumber: form.batchNumber.trim() || undefined,
          plannedOutputKg: form.plannedOutputKg || undefined,
          stages: selectedStages,
          notes: form.notes,
        });
        onCreated(res.data.id);
      } else {
        const res = await api.post('/mill/batches', {
          rawLotId: rawLotId || null,
          productId: lot?.productId || undefined,
          inputQuantity: Number(form.inputKg),
          unit: form.unit,
          batchNumber: form.batchNumber.trim() || undefined,
          plannedOutputKg: form.plannedOutputKg || undefined,
          stages: selectedStages,
          notes: form.notes,
        });
        onCreated(res.data.id);
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('failedToCreate'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-black">{t('newProductionBatch')}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {/* Source Selector: Own Raw Material Lot vs Job Work Order */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Material Source</label>
            <div className="flex rounded-xl p-1 bg-slate-100 dark:bg-slate-800 gap-1">
              <button
                type="button"
                onClick={() => setSourceType('raw_lot')}
                className={cn(
                  "flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5",
                  sourceType === 'raw_lot'
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm border border-slate-200/50 dark:border-slate-700/50"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                )}
              >
                🏢 Purchase / Mill Lot
              </button>
              <button
                type="button"
                onClick={() => {
                  setSourceType('job_work');
                  if (!jobWorkOrderId && activeJwOrders.length > 0) {
                    setJobWorkOrderId(activeJwOrders[0].id);
                    setForm(f => ({ ...f, inputKg: String(activeJwOrders[0].inputWeightKg || '') }));
                  }
                }}
                className={cn(
                  "flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5",
                  sourceType === 'job_work'
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm border border-slate-200/50 dark:border-slate-700/50"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                )}
              >
                🌾 Job Work (Customer Material)
              </button>
            </div>
          </div>

          {sourceType === 'raw_lot' ? (
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
                    {l.lotNumber || t('unnamedLot')} | {l.product?.name || 'Raw'} | {(l.availableKg ?? l.remainingQuantity ?? l.quantity ?? 0).toLocaleString('en-IN')} Kg Available | {t(srcKey(l.source))}
                    {l.farmerName ? ` | ${l.farmerName}` : ''}{l.receivedDate || l.purchaseDate ? ` | ${fmtDate(l.receivedDate || l.purchaseDate)}` : ''}
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
          ) : (
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Select Job Work Order *</label>
              <select
                value={jobWorkOrderId}
                onChange={e => {
                  const val = e.target.value;
                  setJobWorkOrderId(val);
                  const jw = activeJwOrders.find((j: any) => j.id === val);
                  if (jw) {
                    setForm(f => ({ ...f, inputKg: String(jw.inputWeightKg || '') }));
                  }
                }}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
                required
              >
                {activeJwOrders.length === 0 && <option value="">No pending Job Work orders</option>}
                {activeJwOrders.map((j: any) => (
                  <option key={j.id} value={j.id}>
                    {j.orderNumber} | {j.customer?.name || 'Customer'} | {j.materialDescription} ({j.inputWeightKg} Kg)
                  </option>
                ))}
              </select>
              {selectedJw ? (
                <div className="mt-2 p-3 rounded-xl border border-purple-200 dark:border-purple-800/50 bg-purple-50/50 dark:bg-purple-950/20 text-xs space-y-1">
                  <div className="flex justify-between font-semibold text-purple-900 dark:text-purple-300">
                    <span>Customer: {selectedJw.customer?.name || '—'}</span>
                    <span>Rate: ₹{selectedJw.ratePerKg}/Kg</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Material: {selectedJw.materialDescription}</span>
                    <span>Received: {selectedJw.inputWeightKg} Kg</span>
                  </div>
                  <div className="text-[11px] text-purple-700 dark:text-purple-300 font-medium pt-1 border-t border-purple-100 dark:border-purple-800/30">
                    🌾 Deal: {selectedJw.byproductRetainedByMill ? t('byproduct_mill_keeps') : t('byproduct_customer_receives')}
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-amber-600 mt-1">Create an order in Job Work first if none available.</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
              {t('inputQuantity')}
              {sourceType === 'raw_lot' && lot && <span className="ml-2 font-normal text-slate-400 lowercase">{t('maxKgFromLot', { cap })}</span>}
              {sourceType === 'job_work' && selectedJw && <span className="ml-2 font-normal text-purple-600 lowercase">(Total {selectedJw.inputWeightKg} Kg from customer)</span>}
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
              placeholder="Auto-generated if empty (e.g. PB-2026-001)"
            />
            <p className="text-[10px] text-slate-400 mt-1">Leave empty to auto-generate, or type your own batch number</p>
          </div>

          {/* Configurable Production Stage Workflow Builder */}
          <ProductionStageBuilder
            productId={sourceType === 'raw_lot' ? (lot?.productId || undefined) : undefined}
            productName={sourceType === 'raw_lot' ? (lot?.product?.name || undefined) : (selectedJw?.materialDescription || 'Paddy')}
            selectedStages={selectedStages}
            onChange={setSelectedStages}
            saveAsDefault={saveAsDefault}
            onSaveAsDefaultChange={setSaveAsDefault}
            isLoadingTemplate={templateLoading}
            isTemplateLoaded={templateLoaded}
          />

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
            disabled={saving || (sourceType === 'raw_lot' && (!rawLotId || !form.inputKg || (lot && !lot.productId))) || (sourceType === 'job_work' && (!jobWorkOrderId || !form.inputKg))}
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



function BatchDetail({ mode, batch, products, onClose, onChanged, onBatchUpdated }: {
  mode: 'batches' | 'production';
  batch: Batch;
  products: ProductOption[];
  onClose: () => void;
  onChanged: () => void;
  /** Fast path: patch a single batch in the SWR cache without a full list re-fetch. */
  onBatchUpdated?: (updated: Batch) => void;
}) {
  const t = useTranslations('Mill');
  const [saving, setSaving] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const lot = batch.rawLot;
  const patchStage = async (stage: Stage, patch: any) => {
    setSaving(stage.id);
    try {
      const res = await api.patch(`/mill/batches/${batch.id}/stages/${stage.id}`, patch);
      // Use the returned batch to update the cache in-place — avoids a full list re-fetch
      if (onBatchUpdated) {
        onBatchUpdated(res.data);
      } else {
        onChanged();
      }
    } catch (err: any) {
      alert(err?.response?.data?.error || t('failedToUpdateStage'));
    } finally { setSaving(null); }
  };

  /**
   * Hand the batch to Production: open → in_progress.
   * Uses optimistic cache patching so the status flips immediately on screen
   * without waiting for a full list re-fetch.
   */
  const startProduction = async () => {
    setStarting(true); setStartError('');
    try {
      const res = await api.post(`/mill/batches/${batch.id}/start`, {});
      const updated: Batch = res.data;
      // Fast path: patch only this batch in the SWR list cache, no network round-trip.
      if (onBatchUpdated) {
        onBatchUpdated(updated);
      } else {
        // Fallback for callers that don't support the fast path.
        onChanged();
      }
    } catch (err: any) {
      setStartError(err?.response?.data?.detail || err?.response?.data?.error || t('startFailed'));
    } finally { setStarting(false); }
  };

  const deleteBatch = async () => {
    if (!confirm('Cancel and delete this batch? The allocated raw material will be safely released back to available.')) return;
    setDeleting(true); setDeleteError('');
    try {
      await api.delete(`/mill/batches/${batch.id}`);
      onClose();
      onChanged();
    } catch (err: any) {
      setDeleteError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || 'Failed to delete batch');
    } finally { setDeleting(false); }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-slate-50 dark:bg-slate-900 w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col h-[92vh] sm:h-auto sm:max-h-[92vh]">
        <div className="p-5 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sm:rounded-t-2xl flex items-start justify-between shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-black text-slate-900 dark:text-white">{batch.batchNumber}</h2>
              <StatusPill status={batch.status} />
              {(batch.batchType === 'REPROCESSING' || batch.rejectionLotId) && (
                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-full bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300">
                  REPROCESSING BATCH
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {lot?.product?.name && `${lot.product.name} · `}
              {lot?.lotNumber && `${t('lot')} ${lot.lotNumber} · `}
              {t('input')} {batch.inputKg || 0} Kg · {t('started')} {new Date(batch.startedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <BatchReportButton batchId={batch.id} batchNumber={batch.batchNumber} stages={batch.stages || []} />
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Stage Timeline */}
          <StageTimeline
            stages={batch.stages}
            currentStageId={batch.currentStage}
            onSelectStage={setSelectedStageId}
          />
          {selectedStageId && (
            <StageExecutionPanel
              batch={batch}
              stageId={selectedStageId}
              products={products}
              onStageUpdated={onChanged}
            />
          )}
          {/* Batch information + raw material (both screens) */}
          <div className="grid sm:grid-cols-2 gap-3" data-testid="batch-info">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">{t('sectionBatch')}</p>
              <InfoRow label={t('colBatch')}>{batch.batchNumber}</InfoRow>
              <InfoRow label={t('colDate')}>{fmtDate(batch.startedAt)}</InfoRow>
              <InfoRow label={t('colRawMaterial')}>{lot?.product?.name || '—'}</InfoRow>
              <InfoRow label={t('colInput')}>
                <span>
                  {(batch.inputKg || 0).toLocaleString('en-IN')} Kg
                  <span className="ml-1 text-[11px] font-normal text-slate-400">
                    ({batch.status === 'closed' ? 'Consumed' : 'Allocated / Reserved'})
                  </span>
                </span>
              </InfoRow>
              <InfoRow label={t('colStatus')}><StatusPill status={batch.status} /></InfoRow>
              <InfoRow label={t('createdAt')}>{fmtDate(batch.createdAt || batch.startedAt)}</InfoRow>
              {batch.plannedOutputKg != null && <InfoRow label={t('plannedOutput')}>{batch.plannedOutputKg} Kg</InfoRow>}
              {batch.notes && <InfoRow label={t('notesOptional')}>{batch.notes}</InfoRow>}
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                {batch.jobWorkOrder ? 'CUSTOMER / JOB WORK MATERIAL' : t('sectionRawMaterial')}
              </p>
              {batch.jobWorkOrder ? (
                <>
                  <InfoRow label="Job Work Order">
                    <Link
                      href={`/job-work` as any}
                      className="text-purple-600 dark:text-purple-400 hover:underline font-bold font-mono inline-flex items-center gap-1"
                    >
                      {batch.jobWorkOrder.orderNumber} →
                    </Link>
                  </InfoRow>
                  <InfoRow label="Customer / Farmer">
                    {batch.jobWorkOrder.customer?.name || '—'} {batch.jobWorkOrder.customer?.mobile ? `(${batch.jobWorkOrder.customer.mobile})` : ''}
                  </InfoRow>
                  <InfoRow label="Customer Material">
                    {batch.jobWorkOrder.materialDescription} ({batch.jobWorkOrder.inputWeightKg} Kg)
                  </InfoRow>
                  <InfoRow label="Byproduct Deal">
                    <span className={batch.jobWorkOrder.byproductRetainedByMill ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>
                      {batch.jobWorkOrder.byproductRetainedByMill ? t('byproduct_mill_keeps') : t('byproduct_customer_receives')}
                    </span>
                  </InfoRow>
                  <InfoRow label="Material Ownership">
                    <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                      🌾 Customer-Owned Material
                    </span>
                  </InfoRow>
                </>
              ) : (
                <>
                  <InfoRow label={t('colLot')}>
                    {lot?.id ? (
                      <Link
                        href={`/raw-material?lot=${lot.id}` as any}
                        className="text-emerald-600 dark:text-emerald-400 hover:underline font-bold font-mono inline-flex items-center gap-1"
                      >
                        {lot.lotNumber || 'View Lot Details'} →
                      </Link>
                    ) : (
                      lot?.lotNumber || '—'
                    )}
                  </InfoRow>
                  <InfoRow label={t('source')}><SourceBadge source={lot?.source} ref_={lot?.sourceRef} /></InfoRow>
                  <InfoRow label={t('vendor')}>{lot?.farmerName || lot?.supplier?.name || '—'}</InfoRow>
                  <InfoRow label={t('lotAvailableNow')}>
                    {lot ? (
                      <span>
                        <span className="font-bold text-amber-600 dark:text-amber-400">
                          {(lot.availableKg ?? lot.remainingQuantity ?? 0).toLocaleString('en-IN')} Kg
                        </span>
                        <span className="text-slate-400 text-xs font-normal"> / {(lot.quantity ?? 0).toLocaleString('en-IN')} Kg received</span>
                      </span>
                    ) : '—'}
                  </InfoRow>
                  <InfoRow label={t('rate')}>{lot?.ratePerUnit != null ? `₹${lot.ratePerUnit}/Kg` : '—'}</InfoRow>
                  <InfoRow label={t('moisture')}>{lot?.moisturePct != null ? `${lot.moisturePct}%` : '—'}</InfoRow>
                </>
              )}
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

          {/* WIP Material Section */}
          {batch.wipLots && batch.wipLots.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{t('sect_wip')}</p>
                <span className="text-xs font-bold text-slate-400">{t('lot_count', { count: batch.wipLots.length })}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                      <th className="py-2 px-2">{t('col_wipLot')}</th>
                      <th className="py-2 px-2">{t('col_product')}</th>
                      <th className="py-2 px-2 text-right">{t('col_originalQty')}</th>
                      <th className="py-2 px-2 text-right">{t('col_availableQty')}</th>
                      <th className="py-2 px-2">{t('col_status')}</th>
                      <th className="py-2 px-2">{t('col_sourceStage')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {batch.wipLots.map((wip: any) => (
                      <tr key={wip.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="py-2 px-2 font-mono font-bold text-slate-800 dark:text-slate-200">{wip.lotNumber}</td>
                        <td className="py-2 px-2 font-medium">{wip.product?.name || t('fallback_intermediateMaterial')}</td>
                        <td className="py-2 px-2 text-right font-mono">{wip.quantity} {wip.unit}</td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{wip.availableQuantity} {wip.unit}</td>
                        <td className="py-2 px-2">
                          <span className={cn(
                            'px-2 py-0.5 text-[10px] font-bold rounded-full uppercase',
                            wip.status === 'AVAILABLE' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300' :
                            wip.status === 'PARTIALLY_CONSUMED' ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' :
                            wip.status === 'FULLY_CONSUMED' ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400' :
                            'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300'
                          )}>
                            {wip.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-slate-500">{wip.sourceBatchStage?.stageName ? stageLabel(t, wip.sourceBatchStage.stageName) : t('fallback_stageOutput')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Finished Goods Section */}
          {batch.finishedGoodsLots && batch.finishedGoodsLots.length > 0 && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-white dark:bg-slate-900 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">{t('sect_fg')}</p>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{t('fg_lot_count', { count: batch.finishedGoodsLots.length })}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                      <th className="py-2 px-2">{t('col_fgLot')}</th>
                      <th className="py-2 px-2">{t('col_product')}</th>
                      <th className="py-2 px-2 text-right">{t('col_quantity')}</th>
                      <th className="py-2 px-2">{t('col_godown')}</th>
                      <th className="py-2 px-2">{t('col_status')}</th>
                      <th className="py-2 px-2">{t('col_sourceStage')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {batch.finishedGoodsLots.map((fg: any) => (
                      <tr key={fg.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="py-2 px-2 font-mono font-bold text-emerald-700 dark:text-emerald-300">{fg.lotNumber}</td>
                        <td className="py-2 px-2 font-medium text-slate-800 dark:text-slate-200">{fg.product?.name || t('fallback_finishedProduct')}</td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-slate-800 dark:text-slate-200">{fg.quantity} {fg.unit}</td>
                        <td className="py-2 px-2 text-slate-600 dark:text-slate-400">{fg.godown?.name || t('fallback_mainStock')}</td>
                        <td className="py-2 px-2">
                          <span className={cn(
                            'px-2 py-0.5 text-[10px] font-bold rounded-full uppercase',
                            fg.status === 'AVAILABLE' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300' :
                            fg.status === 'PARTIALLY_DISPATCHED' ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' :
                            'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                          )}>
                            {fg.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-slate-500">{fg.sourceBatchStage?.stageName ? stageLabel(t, fg.sourceBatchStage.stageName) : t('fallback_finalStage')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* By-Products Section */}
          {batch.byProductLots && batch.byProductLots.length > 0 && (
            <div className="rounded-xl border border-blue-200 dark:border-blue-800/40 bg-white dark:bg-slate-900 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-400">{t('sect_bp')}</p>
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{t('bp_lot_count', { count: batch.byProductLots.length })}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                      <th className="py-2 px-2">{t('col_lot')}</th>
                      <th className="py-2 px-2">{t('col_product')}</th>
                      <th className="py-2 px-2 text-right">{t('col_quantity')}</th>
                      <th className="py-2 px-2 text-right">{t('col_available')}</th>
                      <th className="py-2 px-2">{t('col_godown')}</th>
                      <th className="py-2 px-2">{t('col_stockable')}</th>
                      <th className="py-2 px-2">{t('col_sourceStage')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {batch.byProductLots.map((bp: any) => (
                      <tr key={bp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="py-2 px-2 font-mono font-bold text-blue-700 dark:text-blue-300">{bp.lotNumber}</td>
                        <td className="py-2 px-2 font-medium text-slate-800 dark:text-slate-200">{bp.product?.name || t('fallback_byProduct')}</td>
                        <td className="py-2 px-2 text-right font-mono text-slate-800 dark:text-slate-200">{bp.quantity} {bp.unit}</td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-blue-600 dark:text-blue-400">{bp.availableQuantity} {bp.unit}</td>
                        <td className="py-2 px-2 text-slate-600 dark:text-slate-400">{bp.godown?.name || t('fallback_mainStock')}</td>
                        <td className="py-2 px-2">
                          <span className={cn('px-2 py-0.5 text-[10px] font-bold rounded-full uppercase', bp.isStockable ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600')}>
                            {bp.isStockable ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-slate-500">{bp.sourceBatchStage?.stageName ? stageLabel(t, bp.sourceBatchStage.stageName) : t('fallback_stageOutput')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Rejections Section */}
          {batch.rejectionLots && batch.rejectionLots.length > 0 && (
            <div className="rounded-xl border border-red-200 dark:border-red-800/40 bg-white dark:bg-slate-900 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-wider text-red-700 dark:text-red-400">REJECTIONS HOLDING</p>
                <span className="text-xs font-bold text-red-600 dark:text-red-400">{batch.rejectionLots.length} Rejection Lot(s)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                      <th className="py-2 px-2">Lot</th>
                      <th className="py-2 px-2">Product</th>
                      <th className="py-2 px-2 text-right">Quantity</th>
                      <th className="py-2 px-2 text-right">Available</th>
                      <th className="py-2 px-2">Reason</th>
                      <th className="py-2 px-2">Status</th>
                      <th className="py-2 px-2">Source Stage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {batch.rejectionLots.map((rj: any) => (
                      <tr key={rj.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="py-2 px-2 font-mono font-bold text-red-700 dark:text-red-300">{rj.lotNumber}</td>
                        <td className="py-2 px-2 font-medium text-slate-800 dark:text-slate-200">{rj.product?.name || 'Rejected Material'}</td>
                        <td className="py-2 px-2 text-right font-mono text-slate-800 dark:text-slate-200">{rj.quantity} {rj.unit}</td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-red-600 dark:text-red-400">{rj.availableQuantity} {rj.unit}</td>
                        <td className="py-2 px-2 text-slate-600 dark:text-slate-300">{rj.rejectionReason || 'Quality Failure'}</td>
                        <td className="py-2 px-2">
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full uppercase bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300">
                            {rj.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-slate-500">{rj.sourceBatchStage?.stageName ? stageLabel(t, rj.sourceBatchStage.stageName) : t('fallback_stageOutput')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Waste / Loss Section */}
          {batch.outputs && batch.outputs.filter((o: any) => o.outputType === 'WASTE' || o.outputType === 'waste').length > 0 && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-white dark:bg-slate-900 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">WASTE / PRODUCTION LOSS</p>
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                  Total: {batch.outputs.filter((o: any) => o.outputType === 'WASTE' || o.outputType === 'waste').reduce((s: number, o: any) => s + (o.quantity || 0), 0)} Kg
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                      <th className="py-2 px-2">Waste Name / Type</th>
                      <th className="py-2 px-2 text-right">Quantity</th>
                      <th className="py-2 px-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {batch.outputs.filter((o: any) => o.outputType === 'WASTE' || o.outputType === 'waste').map((w: any) => (
                      <tr key={w.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="py-2 px-2 font-medium text-slate-800 dark:text-slate-200">{w.name || 'Scrap / Loss'}</td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-amber-600 dark:text-amber-400">{w.quantity} {w.unit || 'kg'}</td>
                        <td className="py-2 px-2 text-slate-500">{w.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                  previousStageOutputKg={idx > 0 ? batch.stages[idx - 1].outputKg : null}
                  batchId={batch.id}
                  batch={batch}
                  products={products}
                  onRefreshBatch={onChanged}
                />
              ))}
              <FinalizePanel batch={batch} products={products} onDone={onChanged} />
            </>
          )}

          {/* Cancel / Delete Batch to Release Allocation */}
          {batch.status !== 'closed' && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={deleteBatch}
                disabled={deleting}
                className="px-3 py-1.5 text-xs font-bold text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-900/40 transition-colors flex items-center gap-1.5"
              >
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                Cancel Batch & Release Allocation
              </button>
              {deleteError && <span className="text-xs text-red-500 font-semibold">{deleteError}</span>}
            </div>
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

// Map outputType → millCategory for filtering the product dropdown.
// finished_good uses null (show all) so the batch's output product is always visible.
const OUTPUT_TYPE_CATEGORY: Record<string, string | null> = {
  finished_good: null,        // show all — batch product may not have millCategory set
  by_product:    'by_product',
  rejection:     'waste',
  wip:           null,
};
// Map outputType → millCategory when creating a new product on the fly
const OUTPUT_TYPE_NEW_CATEGORY: Record<string, string> = {
  finished_good: 'finished_goods',
  by_product:    'by_product',
  rejection:     'waste',
  wip:           'finished_goods',
};

// Field codes from execution that map to by-product or rejection output types.
// Add more codes here as new mill workflow templates are created.
const BY_PRODUCT_EXEC_CODES: Record<string, string> = {
  bran_byproduct_qty:   'Bran',
  bran_qty:             'Bran',
  husk_qty:             'Husk',
  husk_byproduct_qty:   'Husk',
  coarse_broken_qty:    'Coarse / Broken',
  broken_rice_qty:      'Broken Rice',
  byproduct_qty:        'By-Product',
  byproduct_1_qty:      'By-Product',
  byproduct_2_qty:      'By-Product 2',
  dust_qty:             'Dust',
  polishing_waste_qty:  'Polishing Waste',
  stone_qty:            'Stones',
};
const REJECTION_EXEC_CODES: Record<string, string> = {
  rejected_qty:         'Rejection',
  rejection_qty:        'Rejection',
  waste_qty:            'Waste',
  loss_qty:             'Loss',
};

function FinalizePanel({ batch, products, onDone }: { batch: Batch; products: ProductOption[]; onDone: () => void }) {
  const t = useTranslations('Mill');

  // Pre-populate the first row with the batch's designated output product (if set)
  const initProductId = batch.outputProductId || '';
  const initName = products.find(p => p.id === initProductId)?.name || '';

  // Auto-fill quantity from the last completed stage's outputKg (e.g. packed_qty from Packing)
  const lastCompletedStage = [...(batch.stages || [])].reverse().find((s) => s.completedAt && s.outputKg != null);
  const autoQty = lastCompletedStage?.outputKg != null ? String(lastCompletedStage.outputKg) : '';
  const autoLoss = (batch.inputKg != null && lastCompletedStage?.outputKg != null)
    ? String(Math.max(0, Number(batch.inputKg) - Number(lastCompletedStage.outputKg)))
    : '';

  const [rows, setRows] = useState<OutRow[]>([{ key: 1, outputType: 'finished_good', productId: initProductId, name: initName, quantity: autoQty, unit: 'kg', lot: '', notes: '' }]);
  const [lossKg, setLossKg] = useState(autoLoss);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newFor, setNewFor] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const byProductsLoaded = useRef(false);

  // Fetch execution fields for all completed stages once on mount and auto-populate by-product / rejection rows.
  // Quantities for the same fieldCode are SUMMED across stages to avoid duplicate rows.
  useEffect(() => {
    if (byProductsLoaded.current) return;
    byProductsLoaded.current = true;
    const completedStages = (batch.stages || []).filter((s) => s.completedAt);
    if (completedStages.length === 0) return;

    const findProduct = (millCat: string, labelHint: string): { id: string; name: string } | null => {
      const pool = products.filter((p) => p.millCategory === millCat);
      if (pool.length === 0) return null;
      const lower = labelHint.toLowerCase();
      return (
        pool.find((p) => p.name.toLowerCase() === lower) ||
        pool.find((p) => p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase())) ||
        pool[0]
      );
    };

    Promise.all(
      completedStages.map((s) =>
        api.get(`/mill/batches/${batch.id}/stages/${s.id}/execution`).then((r) => r.data || []).catch(() => [])
      )
    ).then((allFieldArrays: any[][]) => {
      // Aggregate by resolved product identity (product ID or normalized label) — prevents
      // duplicate rows when multiple field codes resolve to the same by-product (e.g. bran_qty + bran_byproduct_qty → Bran).
      type AggEntry = { outputType: string; matched: { id: string; name: string } | null; label: string; total: number };
      const aggregated = new Map<string, AggEntry>();

      for (const fields of allFieldArrays) {
        for (const f of fields) {
          const val = Number(f.actualValue);
          if (isNaN(val) || val <= 0) continue;
          const code = f.fieldCode as string;
          const isByProduct = !!BY_PRODUCT_EXEC_CODES[code];
          const isRejection = !!REJECTION_EXEC_CODES[code];
          if (!isByProduct && !isRejection) continue;

          const outputType = isByProduct ? 'by_product' : 'rejection';
          const label = f.fieldLabel || (isByProduct ? BY_PRODUCT_EXEC_CODES[code] : REJECTION_EXEC_CODES[code]);
          const millCat = isByProduct ? 'by_product' : 'waste';
          const matched = findProduct(millCat, label);
          // Key = outputType + product id (if matched) or normalised label — deduplicates across field codes
          const aggKey = `${outputType}:${matched ? matched.id : label.toLowerCase().replace(/\s+/g, '_')}`;

          const existing = aggregated.get(aggKey);
          if (existing) {
            existing.total += val;
          } else {
            aggregated.set(aggKey, { outputType, matched, label, total: val });
          }
        }
      }

      const extraRows: OutRow[] = [];
      let keyCounter = 100;
      for (const { outputType, matched, label, total } of aggregated.values()) {
        extraRows.push({
          key: keyCounter++,
          outputType,
          productId: matched?.id || '',
          name: matched?.name || label,
          quantity: String(total),
          unit: 'kg',
          lot: '',
          notes: '',
        });
      }

      if (extraRows.length > 0) {
        setRows((prev) => {
          const merged = [...prev, ...extraRows];
          const totalOutputs = merged.reduce((s, r) => s + (Number(r.quantity) > 0 ? Number(r.quantity) : 0), 0);
          setLossKg(String(Math.max(0, Number(batch.inputKg || 0) - totalOutputs)));
          return merged;
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch.id]);
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
      const millCategory = OUTPUT_TYPE_NEW_CATEGORY[row.outputType] || 'finished_goods';
      const categoryName =
        millCategory === 'by_product' ? 'By-Products' :
        millCategory === 'waste' ? 'Waste / Rejection' :
        millCategory === 'finished_goods' ? 'Finished Goods' : 'Finished Goods';
      const res = await api.post('/products', { name, category: categoryName, millCategory, baseUnit: 'kg', currentStock: 0, sellingPrice: 0 });
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

  const canSubmit = rows.length > 0 && rows.every(r => Number(r.quantity) > 0 && ((r.outputType !== 'finished_good' && r.outputType !== 'wip') || r.productId) && (r.productId || r.name.trim())) && balanced && !saving;

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
              {(() => {
                const filterCat = OUTPUT_TYPE_CATEGORY[r.outputType];
                const filtered = filterCat ? products.filter(p => p.millCategory === filterCat) : products;
                const allCount = products.length;
                const selectedInFiltered = !r.productId || filtered.some(p => p.id === r.productId);
                const selectedProduct = !selectedInFiltered ? products.find(p => p.id === r.productId) : null;
                const showAllFallback = filtered.length < allCount && (r.outputType === 'finished_good' || r.outputType === 'wip');
                const isOptionalProduct = r.outputType === 'by_product' || r.outputType === 'rejection';
                return (
                  <select
                    value={newFor === r.key ? '__new__' : r.productId}
                    onChange={e => {
                      if (e.target.value === '__new__') { setNewFor(r.key); setNewName(r.name); }
                      else { setNewFor(null); const p = products.find(x => x.id === e.target.value); setRow(r.key, { productId: e.target.value, name: p?.name || r.name }); }
                    }}
                    className={`w-full h-9 px-2 border rounded-md bg-white dark:bg-slate-950 text-sm ${!r.productId && !isOptionalProduct ? 'border-amber-400 dark:border-amber-600' : 'border-slate-300 dark:border-slate-700'}`}>
                    <option value="">{isOptionalProduct ? '— Not tracked as stock (optional) —' : t('selectProduct')}</option>
                    {selectedProduct && <option key={selectedProduct.id} value={selectedProduct.id}>{selectedProduct.name}</option>}
                    {filtered.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    {showAllFallback && <option disabled>── All Products ──</option>}
                    {showAllFallback && products.filter(p => !filtered.includes(p) && p.id !== selectedProduct?.id).map(p => <option key={p.id + '_all'} value={p.id}>{p.name}</option>)}
                    <option value="__new__">{t('createNewProduct')}</option>
                  </select>
                );
              })()}
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

function StageCard({ stage, index, isActive, batchClosed, saving, onSave, previousStageOutputKg, batchId, batch, products, onRefreshBatch }: {
  stage: Stage; index: number; isActive: boolean; batchClosed: boolean; saving: boolean;
  onSave: (stage: Stage, patch: any) => void;
  /** Output kg of the previous stage — used as a suggested input for this stage. */
  previousStageOutputKg?: number | null;
  batchId?: string;
  batch?: any;
  products?: any[];
  onRefreshBatch?: () => void;
}) {
  const t = useTranslations('Mill');
  const isDone = !!stage.completedAt;

  return (
    <div className={cn(
      'rounded-xl border p-4 space-y-4 transition-all',
      isDone ? 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-500/5'
        : isActive ? 'border-amber-300 dark:border-amber-500/40 bg-amber-50/20 dark:bg-amber-500/5 shadow-sm ring-1 ring-amber-400/20'
          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shadow-sm',
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
        <div className="space-y-4">
          {/* Dynamic Execution Fields Workflow */}
          {batchId && (
            <DynamicExecutionFields
              batchId={batchId}
              stageId={stage.id}
              isReadOnly={batchClosed || isDone}
              onRefreshBatch={onRefreshBatch || (() => {})}
              products={products}
              batch={batch}
            />
          )}

          {/* Stage Completion Action Buttons */}
          <div className="flex gap-2 justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
            {/* Download stage report */}
            <StageReportButton batchId={batchId!} stageId={stage.id} stageName={stage.stageName} />

            <div className="flex gap-2">
              {!isDone ? (
                <button
                  type="button"
                  onClick={() => onSave(stage, { completed: true })}
                  disabled={saving}
                  className="text-xs font-bold px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white flex items-center gap-1.5 shadow transition"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  {t('markAsCompleted')} <ArrowRight size={12} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onSave(stage, { completed: false })}
                  disabled={saving}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-500/30 transition"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : null} Reopen Stage
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {batchClosed && (
        <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg">
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

/** Download a single stage's execution report as PDF. */
function StageReportButton({ batchId, stageId, stageName }: { batchId: string; stageId: string; stageName: string }) {
  const [loading, setLoading] = useState(false);

  const download = async () => {
    setLoading(true);
    try {
      const blob = await downloadBlob(`/mill/batches/${batchId}/stages/${stageId}/report?format=pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Stage_${stageName}_Report.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to download stage report.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={download}
      disabled={loading}
      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5 transition disabled:opacity-50"
      title="Download stage report PDF"
    >
      {loading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
      Stage Report
    </button>
  );
}

/** Dropdown button for full batch report (all stages) or per-stage selection. */
function BatchReportButton({ batchId, batchNumber, stages }: { batchId: string; batchNumber: string; stages: Stage[] }) {
  const t = useTranslations('Mill');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  const downloadStage = async (stageId: string, stageName: string) => {
    setLoading(stageId);
    setOpen(false);
    try {
      const blob = await downloadBlob(`/mill/batches/${batchId}/stages/${stageId}/report?format=pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${batchNumber}_${stageName}_Report.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to download report.');
    } finally {
      setLoading(null);
    }
  };

  const downloadFull = async () => {
    setLoading('full');
    setOpen(false);
    try {
      const blob = await downloadBlob(`/mill/batches/${batchId}/report?format=pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${batchNumber}_Full_Process_Report.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to download full batch report.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={loading !== null}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-300 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition disabled:opacity-50"
        title="Download batch report"
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
        Reports
        <span className="text-[10px]">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
          {/* Full batch report */}
          <button
            type="button"
            onClick={downloadFull}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border-b border-slate-100 dark:border-slate-700"
          >
            <Download size={13} /> Full Process Report (All Stages)
          </button>

          {/* Per-stage */}
          <div className="py-1">
            <p className="px-4 py-1 text-[10px] font-bold uppercase text-slate-400 tracking-wide">Individual Stages</p>
            {stages.map((st, i) => (
              <button
                key={st.id}
                type="button"
                onClick={() => downloadStage(st.id, st.stageName)}
                className="w-full flex items-center gap-2 px-4 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                  st.completedAt ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700'
                )}>{i + 1}</span>
                <span className="capitalize">{stageLabel(t, st.stageName)}</span>
                {st.completedAt && <span className="ml-auto text-[10px] text-emerald-600">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Close dropdown on outside click */}
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
    </div>
  );
}
