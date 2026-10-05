'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import DeleteButton from '@/components/mill/DeleteButton';
import { Plus, X, Loader2, Scale, CheckCircle2, ArrowRight, Search, LogOut } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import ModalPortal from '@/components/mill/ModalPortal';
import { useTranslations } from 'next-intl';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
import { ExportButton } from '@/lib/hooks/useExport';

type WeighbridgeEntry = {
  id: string; slipNumber: string; vehicleNumber: string; materialDescription: string | null;
  grossWeightKg: number | null; tareWeightKg: number | null; netWeightKg: number | null;
  moisturePct: number | null; ratePerKg: number | null;
  status: 'first_weighed' | 'completed' | 'converted';
  gateEntryId: string | null; createdAt: string;
  gateEntry?: { id: string; entryNumber: string; status?: string } | null;
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

type DateFilter = 'today' | 'yesterday' | '7d' | '30d' | 'all' | 'custom';

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Same date-filter → from/to resolver as Gate Entry, kept local to avoid a
 *  cross-page import just for this one small helper. */
function resolveRange(filter: DateFilter, customFrom: string, customTo: string): { from: string | null; to: string | null } {
  const now = new Date();
  switch (filter) {
    case 'today': return { from: isoDate(now), to: isoDate(now) };
    case 'yesterday': { const d = new Date(now); d.setDate(d.getDate() - 1); return { from: isoDate(d), to: isoDate(d) }; }
    case '7d': { const d = new Date(now); d.setDate(d.getDate() - 6); return { from: isoDate(d), to: isoDate(now) }; }
    case '30d': { const d = new Date(now); d.setDate(d.getDate() - 29); return { from: isoDate(d), to: isoDate(now) }; }
    case 'custom': return { from: customFrom || null, to: customTo || null };
    case 'all': default: return { from: null, to: null };
  }
}

export default function WeighbridgePage() {
  const t = useTranslations('Weighbridge');
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const searchParams = useSearchParams();
  const prefilledGateEntryId = searchParams.get('gateEntryId');
  const activeShopId = useBusinessStore(s => s.activeShopId);

  const [dateFilter, setDateFilter] = useState<DateFilter>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'first_weighed' | 'completed' | 'converted'>('');

  const { from, to } = useMemo(() => resolveRange(dateFilter, customFrom, customTo), [dateFilter, customFrom, customTo]);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (search.trim()) p.set('search', search.trim());
    if (statusFilter) p.set('status', statusFilter);
    const qs = p.toString();
    return qs ? `?${qs}` : '';
  }, [from, to, search, statusFilter]);

  const { data: entries = [], mutate: refetch, isLoading } = useSWR<WeighbridgeEntry[]>(
    activeShopId ? ['/mill/weighbridge', activeShopId, queryString] : null,
    ([u, , qs]) => fetcher(`${u}${qs}`),
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

  const exportRows = useMemo(() => entries.map(e => ({
    slipNumber: e.slipNumber,
    date: e.createdAt,
    vehicleNumber: e.vehicleNumber,
    productMaterial: e.product?.name || e.materialDescription || '',
    supplier: e.supplier?.name || '',
    gross: e.grossWeightKg ?? '',
    tare: e.tareWeightKg ?? '',
    net: e.netWeightKg ?? '',
    moisture: e.moisturePct ?? '',
    rate: e.ratePerKg ?? '',
    status: t(e.status),
  })), [entries, t]);

  const dateRangeLabel = dateFilter === 'all'
    ? t('dateAllTime')
    : from && to
      ? (from === to ? new Date(from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : `${new Date(from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${new Date(to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`)
      : undefined;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Scale size={22} className="text-blue-600" /> {t('title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportButton
            filename="weighbridge_register"
            title={t('registerTitle')}
            dateRange={dateRangeLabel}
            summary={[
              { label: t('statTotalEntries'), value: String(entries.length) },
              { label: t('statCompleted'), value: String(stats.completed + stats.converted) },
              { label: t('statConverted'), value: String(stats.converted) },
            ]}
            columns={[
              { key: 'slipNumber', label: t('colSlipNo') },
              { key: 'date', label: t('colDate'), type: 'date' },
              { key: 'vehicleNumber', label: t('vehicleNumber') },
              { key: 'productMaterial', label: t('colProductMaterial') },
              { key: 'supplier', label: t('colSupplier') },
              { key: 'gross', label: t('colGross'), type: 'number' },
              { key: 'tare', label: t('colTare'), type: 'number' },
              { key: 'net', label: t('colNet'), type: 'number' },
              { key: 'moisture', label: t('colMoisture'), type: 'number' },
              { key: 'rate', label: t('colRate'), type: 'currency' },
              { key: 'status', label: t('colStatus') },
            ]}
            data={exportRows}
            // 11 columns — same "too wide for A4 portrait" fix as the Gate
            // Entry register (see that page's ExportButton for the full
            // reasoning).
            orientation="landscape"
          />
          <button
            onClick={() => setCreating(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors"
          >
            <Plus size={18} /> {t('newWeighment')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label={t('statPending')} value={stats.pending} tone="amber" />
        <StatCard label={t('statCompleted')} value={stats.completed} tone="blue" />
        <StatCard label={t('statConverted')} value={stats.converted} tone="emerald" />
      </div>

      {/* ── Filters: date range, search, status — everything the register
          table + export below reads from. */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(['today', 'yesterday', '7d', '30d', 'all', 'custom'] as DateFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setDateFilter(f)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                dateFilter === f
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              )}
            >
              {t(`date${f === '7d' ? '7Days' : f === '30d' ? '30Days' : f.charAt(0).toUpperCase() + f.slice(1)}`)}
            </button>
          ))}
        </div>

        {dateFilter === 'custom' && (
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="h-9 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            <span className="text-xs text-slate-400">{t('to')}</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="h-9 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full h-9 pl-9 pr-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
            />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
            className="h-9 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
            <option value="">{t('filterAllStatuses')}</option>
            <option value="first_weighed">{t('first_weighed')}</option>
            <option value="completed">{t('completed')}</option>
            <option value="converted">{t('converted')}</option>
          </select>
        </div>
      </div>

      {stats.completed > 0 && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 flex flex-wrap items-center gap-2 text-sm" data-testid="pending-raw-banner">
          <span className="font-bold text-amber-800 dark:text-amber-300">{t('notInRawMaterialBanner', { count: stats.completed })}</span>
          <span className="text-xs text-amber-700 dark:text-amber-400">{t('notInRawMaterialHint')}</span>
        </div>
      )}

      {/* ── Register table — a diary-style row per weighment, newest first,
          same data the export buttons above turn into PDF/Excel/CSV/Print. */}
      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <Scale size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm text-slate-500">{t('noEntries')}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-[10px] uppercase tracking-wider text-slate-500">
                <th className="text-left px-4 py-2.5 font-bold">{t('colSlipNo')}</th>
                <th className="text-left px-3 py-2.5 font-bold">{t('colDate')}</th>
                <th className="text-left px-3 py-2.5 font-bold">{t('vehicleNumber')}</th>
                <th className="text-left px-3 py-2.5 font-bold">{t('colProductMaterial')}</th>
                <th className="text-left px-3 py-2.5 font-bold">{t('colSupplier')}</th>
                <th className="text-right px-3 py-2.5 font-bold">{t('colGross')}</th>
                <th className="text-right px-3 py-2.5 font-bold">{t('colTare')}</th>
                <th className="text-right px-3 py-2.5 font-bold">{t('colNet')}</th>
                <th className="text-right px-3 py-2.5 font-bold">{t('colRate')}</th>
                <th className="text-left px-4 py-2.5 font-bold">{t('colStatus')}</th>
                <th className="text-left px-3 py-2.5 font-bold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {entries.map(e => (
                <tr key={e.id} onClick={() => setSelectedId(e.id)} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors">
                  <td className="px-4 py-2.5 font-black text-slate-900 dark:text-white whitespace-nowrap">{e.slipNumber}</td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {new Date(e.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{e.vehicleNumber}</td>
                  <td className="px-3 py-2.5 text-slate-500">{e.product?.name || e.materialDescription || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{e.supplier?.name || '—'}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300 whitespace-nowrap">{e.grossWeightKg ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300 whitespace-nowrap">{e.tareWeightKg ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{e.netWeightKg ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right text-slate-500 whitespace-nowrap">{e.ratePerKg != null ? `₹${e.ratePerKg}` : '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap', statusTone(e.status))}>
                      {t(e.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {e.status === 'completed' && (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-600 text-white">{t('addToRawMaterial')}</span>
                      )}
                      {e.status !== 'converted' && <DeleteButton url={`/mill/weighbridge/${e.id}`} name={e.slipNumber} onDone={() => refetch()} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <ModalPortal><CreateWeighmentModal
          products={rawMaterialProducts}
          suppliers={suppliers}
          prefilledGateEntryId={prefilledGateEntryId}
          onClose={() => { setCreating(false); router.replace(`/${locale}/weighbridge`); }}
          onCreated={(id) => { setCreating(false); refetch(); setSelectedId(id); router.replace(`/${locale}/weighbridge`); }}
        /></ModalPortal>
      )}

      {selected && (
        <ModalPortal><WeighmentDetailModal
          entry={selected}
          onClose={() => setSelectedId(null)}
          onChanged={refetch}
        /></ModalPortal>
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
  const [prefillLoading, setPrefillLoading] = useState(!!prefilledGateEntryId);
  // "+" next to the material dropdown: null = closed, string = the new raw-material name being typed.
  const [addingProduct, setAddingProduct] = useState<string | null>(null);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const { mutate: globalMutate } = useSWRConfig();
  const shopId = useBusinessStore(s => s.activeShopId);

  const createProduct = async () => {
    const name = (addingProduct || '').trim();
    if (!name) return;
    setCreatingProduct(true);
    try {
      const { data: created } = await api.post('/products', { name, category: 'Raw Material', millCategory: 'raw_material', baseUnit: 'Kg', currentStock: 0, sellingPrice: 0 });
      // Refresh the shop's product list so the new material shows up in the dropdown right away.
      if (shopId) await globalMutate(['/products', shopId]);
      setForm(f => ({ ...f, productId: created.id }));
      setAddingProduct(null);
    } catch (err: any) {
      alert('Failed to create product: ' + (err?.response?.data?.detail || err?.response?.data?.error || err.message));
    } finally {
      setCreatingProduct(false);
    }
  };

  // The "vehicle and supplier will carry over" note below promises this, but
  // the server only fills them in from the gate entry when the form fields
  // are left blank — the form itself never actually pre-filled them, so
  // Vehicle Number stayed empty and (being `required`) blocked the Record
  // button until the shopkeeper retyped a number they'd already entered once
  // at the gate. Fetch that gate entry's own data here so the field shows
  // what's actually about to be submitted.
  useEffect(() => {
    if (!prefilledGateEntryId) return;
    let cancelled = false;
    api.get(`/mill/gate-entries/${prefilledGateEntryId}`)
      .then(res => {
        if (cancelled) return;
        const gate = res.data;
        setForm(f => ({
          ...f,
          vehicleNumber: gate.vehicleNumber || f.vehicleNumber,
          supplierId: gate.supplierId || f.supplierId,
          materialDescription: gate.materialDescription || f.materialDescription,
        }));
      })
      .catch(() => { /* best-effort — shopkeeper can still type the vehicle number manually */ })
      .finally(() => { if (!cancelled) setPrefillLoading(false); });
    return () => { cancelled = true; };
  }, [prefilledGateEntryId]);

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
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900">
          <h2 className="text-lg font-black">{t('firstWeighmentTitle')}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {prefilledGateEntryId && (
            <p className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 rounded-lg px-3 py-2 flex items-center gap-2">
              {prefillLoading && <Loader2 size={12} className="animate-spin shrink-0" />}
              {t('linkedFromGateEntry')}
            </p>
          )}
          <Field label={t('vehicleNumber')} required>
            <input autoFocus value={form.vehicleNumber} onChange={e => setForm(f => ({ ...f, vehicleNumber: e.target.value.toUpperCase() }))}
              disabled={prefillLoading}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm disabled:opacity-60" placeholder="MH12AB1234" required />
          </Field>
          <Field label={t('materialProduct')}>
            <div className="flex gap-2">
              <select value={form.productId} onChange={e => setForm(f => ({ ...f, productId: e.target.value }))}
                className="flex-1 h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
                <option value="">{t('noProduct')}</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button type="button" onClick={() => setAddingProduct(v => v === null ? '' : null)} aria-label="Add new product"
                className="h-10 w-10 shrink-0 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-black text-lg hover:bg-emerald-100 dark:hover:bg-emerald-500/20">+</button>
            </div>
            {addingProduct !== null && (
              <div className="flex gap-2 mt-2">
                <input autoFocus value={addingProduct} onChange={e => setAddingProduct(e.target.value)}
                  placeholder="New raw material name"
                  className="flex-1 h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-sm" />
                <button type="button" onClick={createProduct} disabled={creatingProduct || !addingProduct.trim()}
                  className="h-10 px-4 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-50 flex items-center gap-1.5">
                  {creatingProduct && <Loader2 size={14} className="animate-spin" />} Save
                </button>
              </div>
            )}
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

  // Converting to a Raw Material Lot already marks the linked gate entry
  // exited server-side (see convert-to-lot/route.ts) — but not every
  // weighment ends in a lot (outward trucks, by-products, or a shopkeeper who
  // just wants the vehicle logged out without starting a Production lot
  // right now). Without this, the only way to close out the gate entry was
  // to leave this screen and find it again on the Gate Entry page.
  const [exiting, setExiting] = useState(false);
  const [exitedNow, setExitedNow] = useState(false);
  const alreadyExited = entry.gateEntry?.status === 'exited' || exitedNow;

  const markVehicleExited = async () => {
    if (!entry.gateEntryId) return;
    setExiting(true); setError('');
    try {
      await api.patch(`/mill/gate-entries/${entry.gateEntryId}`, { markExited: true });
      setExitedNow(true);
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data?.detail || t('failedToMarkExited'));
    } finally { setExiting(false); }
  };

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
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
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

          {entry.gateEntryId && (
            alreadyExited ? (
              <p className="text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2 flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500" />
                {t('vehicleExitedNote', { entryNumber: entry.gateEntry?.entryNumber || '' })}
              </p>
            ) : (
              <button
                onClick={markVehicleExited}
                disabled={exiting}
                className="w-full h-10 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {exiting ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
                {t('markVehicleExited', { entryNumber: entry.gateEntry?.entryNumber || '' })}
              </button>
            )
          )}

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
