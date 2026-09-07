'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, X, Loader2, Scale, CheckCircle2, ArrowRight } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useSearchParams, useRouter, useParams } from 'next/navigation';

type WeighbridgeEntry = {
  id: string; slipNumber: string; vehicleNumber: string; materialDescription: string | null;
  grossWeightKg: number | null; tareWeightKg: number | null; netWeightKg: number | null;
  moisturePct: number | null; ratePerKg: number | null;
  status: 'first_weighed' | 'completed' | 'converted';
  gateEntryId: string | null; createdAt: string;
  gateEntry?: { id: string; entryNumber: string } | null;
  product?: { id: string; name: string } | null;
  supplier?: { id: string; name: string } | null;
};

type Product = { id: string; name: string; millCategory?: string | null };
type Supplier = { id: string; name: string };

const fetcher = (u: string) => api.get(u).then(r => r.data);

const statusTone = (s: string) => s === 'converted'
  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
  : s === 'completed'
    ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
    : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300';

export default function WeighbridgePage() {
  const t = useTranslations('Weighbridge');
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const searchParams = useSearchParams();
  const prefilledGateEntryId = searchParams.get('gateEntryId');
  const activeShopId = useBusinessStore(s => s.activeShopId);

  const { data: entries = [], mutate: refetch, isLoading } = useSWR<WeighbridgeEntry[]>(
    activeShopId ? ['/mill/weighbridge', activeShopId] : null,
    ([u]) => fetcher(u),
    { revalidateOnFocus: true }
  );
  const { data: products = [] } = useSWR<Product[]>(
    activeShopId ? ['/products', activeShopId] : null,
    ([u]) => fetcher(u),
  );
  const { data: suppliers = [] } = useSWR<Supplier[]>(
    activeShopId ? ['/suppliers', activeShopId] : null,
    ([u]) => fetcher(u),
  );
  const rawMaterialProducts = products.filter(p => p.millCategory === 'raw_material');

  const [creating, setCreating] = useState(!!prefilledGateEntryId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = entries.find(e => e.id === selectedId) || null;

  const stats = {
    pending: entries.filter(e => e.status === 'first_weighed').length,
    completed: entries.filter(e => e.status === 'completed').length,
    converted: entries.filter(e => e.status === 'converted').length,
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Scale size={22} className="text-blue-600" /> {t('title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors"
        >
          <Plus size={18} /> {t('newWeighment')}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label={t('statPending')} value={stats.pending} tone="amber" />
        <StatCard label={t('statCompleted')} value={stats.completed} tone="blue" />
        <StatCard label={t('statConverted')} value={stats.converted} tone="emerald" />
      </div>

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <Scale size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm text-slate-500">{t('noEntries')}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {entries.map(e => (
              <li key={e.id} onClick={() => setSelectedId(e.id)} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-slate-900 dark:text-white">{e.slipNumber}</span>
                      <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full', statusTone(e.status))}>{t(e.status)}</span>
                      <span className="text-xs font-semibold text-slate-500">{e.vehicleNumber}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {e.supplier?.name ? `${e.supplier.name} · ` : ''}
                      {e.product?.name ? `${e.product.name} · ` : (e.materialDescription ? `${e.materialDescription} · ` : '')}
                      {t('gross')} {e.grossWeightKg ?? '—'} Kg
                      {e.tareWeightKg != null && ` · ${t('tare')} ${e.tareWeightKg} Kg`}
                      {e.netWeightKg != null && ` · ${t('net')} ${e.netWeightKg} Kg`}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {creating && (
        <CreateWeighmentModal
          products={rawMaterialProducts}
          suppliers={suppliers}
          prefilledGateEntryId={prefilledGateEntryId}
          onClose={() => { setCreating(false); router.replace(`/${locale}/weighbridge`); }}
          onCreated={(id) => { setCreating(false); refetch(); setSelectedId(id); router.replace(`/${locale}/weighbridge`); }}
        />
      )}

      {selected && (
        <WeighmentDetailModal
          entry={selected}
          onClose={() => setSelectedId(null)}
          onChanged={refetch}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'amber' | 'blue' | 'emerald' }) {
  const map = { amber: 'text-amber-500', blue: 'text-blue-500', emerald: 'text-emerald-500' };
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <p className={cn('text-2xl font-black', map[tone])}>{value}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

function CreateWeighmentModal({ products, suppliers, prefilledGateEntryId, onClose, onCreated }: {
  products: Product[]; suppliers: Supplier[]; prefilledGateEntryId: string | null;
  onClose: () => void; onCreated: (id: string) => void;
}) {
  const t = useTranslations('Weighbridge');
  const [form, setForm] = useState({
    vehicleNumber: '', productId: '', materialDescription: '', supplierId: '',
    grossWeightKg: '', moisturePct: '', ratePerKg: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = await api.post('/mill/weighbridge', {
        gateEntryId: prefilledGateEntryId || null,
        vehicleNumber: form.vehicleNumber,
        productId: form.productId || null,
        materialDescription: form.materialDescription,
        supplierId: form.supplierId || null,
        grossWeightKg: Number(form.grossWeightKg),
        moisturePct: form.moisturePct || null,
        ratePerKg: form.ratePerKg || null,
        notes: form.notes,
      });
      onCreated(res.data.id);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('failedToCreate'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900">
          <h2 className="text-lg font-black">{t('firstWeighmentTitle')}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {prefilledGateEntryId && (
            <p className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 rounded-lg px-3 py-2">{t('linkedFromGateEntry')}</p>
          )}
          <Field label={t('vehicleNumber')} required>
            <input autoFocus value={form.vehicleNumber} onChange={e => setForm(f => ({ ...f, vehicleNumber: e.target.value.toUpperCase() }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" placeholder="MH12AB1234" required />
          </Field>
          <Field label={t('materialProduct')}>
            <select value={form.productId} onChange={e => setForm(f => ({ ...f, productId: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
              <option value="">{t('noProduct')}</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label={t('materialDescription')}>
            <input value={form.materialDescription} onChange={e => setForm(f => ({ ...f, materialDescription: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" placeholder={t('materialPlaceholder')} />
          </Field>
          <Field label={t('supplier')}>
            <select value={form.supplierId} onChange={e => setForm(f => ({ ...f, supplierId: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
              <option value="">{t('noSupplier')}</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('grossWeightKg')} required>
              <input type="number" min="0" step="0.01" value={form.grossWeightKg} onChange={e => setForm(f => ({ ...f, grossWeightKg: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required />
            </Field>
            <Field label={t('moisturePct')}>
              <input type="number" min="0" max="100" step="0.1" value={form.moisturePct} onChange={e => setForm(f => ({ ...f, moisturePct: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </Field>
          </div>
          <Field label={t('ratePerKg')}>
            <input type="number" min="0" step="0.01" value={form.ratePerKg} onChange={e => setForm(f => ({ ...f, ratePerKg: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </Field>
          <Field label={t('notesOptional')}>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </Field>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving || !form.vehicleNumber || !form.grossWeightKg}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {t('recordGrossWeight')}
          </button>
        </form>
      </div>
    </div>
  );
}

function WeighmentDetailModal({ entry, onClose, onChanged }: {
  entry: WeighbridgeEntry; onClose: () => void; onChanged: () => void;
}) {
  const t = useTranslations('Weighbridge');
  const [tareWeightKg, setTareWeightKg] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [lotForm, setLotForm] = useState({ lotNumber: '', farmerName: '', ratePerKg: String(entry.ratePerKg ?? '') });
  const [converting, setConverting] = useState(false);
  const [convertResult, setConvertResult] = useState<any | null>(null);

  const recordTare = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.patch(`/mill/weighbridge/${entry.id}`, { tareWeightKg: Number(tareWeightKg) });
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data?.detail || t('failedToUpdate'));
    } finally { setSaving(false); }
  };

  const convertToLot = async (e: React.FormEvent) => {
    e.preventDefault();
    setConverting(true); setError('');
    try {
      const res = await api.post(`/mill/weighbridge/${entry.id}/convert-to-lot`, lotForm);
      setConvertResult(res.data);
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || t('failedToConvert'));
    } finally { setConverting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900">
          <div>
            <h2 className="text-lg font-black flex items-center gap-2">
              {entry.slipNumber}
              <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full', statusTone(entry.status))}>{t(entry.status)}</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">{entry.vehicleNumber}</p>
          </div>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <StatMini label={t('gross')} v={entry.grossWeightKg} />
            <StatMini label={t('tare')} v={entry.tareWeightKg} />
            <StatMini label={t('net')} v={entry.netWeightKg} bold />
          </div>

          {entry.status === 'first_weighed' && (
            <form onSubmit={recordTare} className="rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-4 space-y-3">
              <p className="text-xs font-bold text-amber-800 dark:text-amber-300">{t('recordTareTitle')}</p>
              <input type="number" min="0" step="0.01" required autoFocus value={tareWeightKg} onChange={e => setTareWeightKg(e.target.value)}
                placeholder={t('tareWeightKg')}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-sm" />
              <button type="submit" disabled={saving || !tareWeightKg}
                className="w-full h-10 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                {t('recordTareBtn')}
              </button>
            </form>
          )}

          {entry.status === 'completed' && !convertResult && (
            <form onSubmit={convertToLot} className="rounded-xl border border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 p-4 space-y-3">
              <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">{t('convertTitle')}</p>
              <input value={lotForm.lotNumber} onChange={e => setLotForm(f => ({ ...f, lotNumber: e.target.value }))}
                placeholder={t('lotNumberOptional')}
                className="w-full h-9 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-sm" />
              <input value={lotForm.farmerName} onChange={e => setLotForm(f => ({ ...f, farmerName: e.target.value }))}
                placeholder={t('farmerNameOptional')}
                className="w-full h-9 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-sm" />
              <input type="number" min="0" step="0.01" value={lotForm.ratePerKg} onChange={e => setLotForm(f => ({ ...f, ratePerKg: e.target.value }))}
                placeholder={t('ratePerKg')}
                className="w-full h-9 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-sm" />
              <button type="submit" disabled={converting}
                className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
                {converting ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
                {t('convertBtn')}
              </button>
            </form>
          )}

          {(entry.status === 'converted' || convertResult) && (
            <div className="rounded-xl border border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 p-4 text-center">
              <CheckCircle2 size={24} className="mx-auto text-emerald-600" />
              <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300 mt-2">{t('convertedSuccess')}</p>
              <p className="text-xs text-slate-500 mt-1">{t('convertedHint')}</p>
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function StatMini({ label, v, bold }: { label: string; v: number | null; bold?: boolean }) {
  return (
    <div>
      <p className={cn('text-lg font-black', bold ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white')}>
        {v != null ? v : '—'}
        {v != null && <span className="text-[10px] font-normal text-slate-500 ml-0.5">Kg</span>}
      </p>
      <p className="text-[10px] text-slate-500">{label}</p>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{label}{required && ' *'}</span>
      {children}
    </label>
  );
}
