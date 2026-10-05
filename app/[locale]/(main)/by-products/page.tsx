'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import DeleteButton from '@/components/mill/DeleteButton';
import { Plus, X, Loader2, Recycle, IndianRupee } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import ModalPortal from '@/components/mill/ModalPortal';
import { useTranslations } from 'next-intl';

type ByProductRow = {
  id: string;
  batchId: string | null;
  name: string;
  quantityKg: number | null;
  soldKg: number | null;
  ratePerKg: number | null;
  notes: string | null;
  createdAt: string;
  source?: 'production' | 'job_work' | 'manual';
  product?: { id: string; name: string; baseUnit: string | null } | null;
  batch?: { id: string; batchNumber: string } | null;
};
type Batch = { id: string; batchNumber: string };
type Product = { id: string; name: string; millCategory?: string | null };

const fetcher = (u: string) => api.get(u).then(r => r.data);
const rupee = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function ByProductsPage() {
  const t = useTranslations('ByProducts');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [adding, setAdding] = useState(false);
  const [sellingId, setSellingId] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const { data: rows = [], mutate: refetch, isLoading } = useSWR<ByProductRow[]>(
    activeShopId ? ['/mill/by-products', activeShopId] : null, ([u]) => fetcher(u),
  );
  const { data: batches = [] } = useSWR<Batch[]>(activeShopId ? ['/mill/batches', activeShopId] : null, ([u]) => fetcher(u));
  const { data: products = [] } = useSWR<Product[]>(activeShopId ? ['/products', activeShopId] : null, ([u]) => fetcher(u));
  const byProductProducts = useMemo(() => products.filter(p => p.millCategory === 'by_product'), [products]);

  const totals = useMemo(() => {
    const totalQty = rows.reduce((s, r) => s + (r.quantityKg || 0), 0);
    const totalSold = rows.reduce((s, r) => s + (r.soldKg || 0), 0);
    const totalValue = rows.reduce((s, r) => s + (r.soldKg || 0) * (r.ratePerKg || 0), 0);
    return { totalQty, totalSold, available: Math.max(0, totalQty - totalSold), totalValue };
  }, [rows]);

  const byType = useMemo(() => {
    const map = new Map<string, { qty: number; sold: number; value: number }>();
    for (const r of rows) {
      const key = r.name;
      const cur = map.get(key) ?? { qty: 0, sold: 0, value: 0 };
      cur.qty += r.quantityKg || 0;
      cur.sold += r.soldKg || 0;
      cur.value += (r.soldKg || 0) * (r.ratePerKg || 0);
      map.set(key, cur);
    }
    return Array.from(map.entries()).map(([name, s]) => ({ name, ...s, available: Math.max(0, s.qty - s.sold) }));
  }, [rows]);

  const knownNames = useMemo(() => Array.from(new Set(rows.map(r => r.name))), [rows]);

  const sourceLabel = (src?: string) => {
    if (src === 'production') return t('source_production');
    if (src === 'job_work') return t('source_jobWork');
    return t('source_manual');
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Recycle size={22} className="text-blue-600" /> {t('title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>
        <button onClick={() => setAdding(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors">
          <Plus size={18} /> {t('addBtn')}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="bp-cards">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 uppercase font-bold">{t('stat_totalProduced')}</p>
          <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{totals.totalQty.toLocaleString('en-IN')} Kg</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 uppercase font-bold">{t('stat_available')}</p>
          <p className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">{totals.available.toLocaleString('en-IN')} Kg</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 uppercase font-bold">{t('stat_soldUsed')}</p>
          <p className="text-xl font-black text-blue-600 dark:text-blue-400 mt-1">{totals.totalSold.toLocaleString('en-IN')} Kg</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 uppercase font-bold">{t('stat_saleValue')}</p>
          <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{rupee(totals.totalValue)}</p>
        </div>
      </div>

      {byType.length > 1 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase text-slate-400 tracking-wider">{t('byType')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {byType.map(bt => (
              <div key={bt.name} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <p className="text-sm font-black text-slate-900 dark:text-white capitalize mb-3">{bt.name}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <span className="text-slate-500">{t('stat_totalProduced')}</span>
                  <span className="font-bold text-right text-slate-800 dark:text-slate-200">{bt.qty.toLocaleString('en-IN')} Kg</span>
                  <span className="text-slate-500">{t('stat_available')}</span>
                  <span className="font-bold text-right text-amber-600 dark:text-amber-400">{bt.available.toLocaleString('en-IN')} Kg</span>
                  <span className="text-slate-500">{t('stat_soldUsed')}</span>
                  <span className="font-bold text-right text-blue-600 dark:text-blue-400">{bt.sold.toLocaleString('en-IN')} Kg</span>
                  <span className="text-slate-500">{t('stat_saleValue')}</span>
                  <span className="font-bold text-right text-slate-800 dark:text-slate-200">{rupee(bt.value)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <Recycle size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm text-slate-500">{t('emptyState')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 font-bold">{t('col_date')}</th>
                <th className="px-3 py-3 font-bold">{t('col_name')}</th>
                <th className="px-3 py-3 font-bold">{t('col_batch')}</th>
                <th className="px-3 py-3 font-bold">{t('col_source')}</th>
                <th className="px-3 py-3 font-bold">{t('col_linkedProduct')}</th>
                <th className="px-3 py-3 font-bold text-right">{t('col_produced')}</th>
                <th className="px-3 py-3 font-bold text-right">{t('col_soldUsed')}</th>
                <th className="px-3 py-3 font-bold text-right">{t('col_remaining')}</th>
                <th className="px-3 py-3 font-bold text-right">{t('col_rateKg')}</th>
                <th className="px-3 py-3 font-bold w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map(r => {
                const qty = r.quantityKg ?? 0;
                const sold = r.soldKg ?? 0;
                const remaining = Math.max(0, qty - sold);
                return (
                  <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-2.5 text-slate-500">{new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-white">{r.name}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{r.batch?.batchNumber || '—'}</td>
                    <td className="px-3 py-2.5 text-xs" data-source={r.source}>
                      <span className={cn('font-bold uppercase text-[10px] px-2 py-0.5 rounded-full',
                        r.source === 'production' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                          : r.source === 'job_work' ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300')}>{sourceLabel(r.source)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">
                      {r.product?.name || (remaining > 0 ? (
                        <button onClick={() => setLinkingId(r.id)} data-testid="add-to-products"
                          className="text-xs font-bold px-2.5 py-1 rounded-lg border border-dashed border-emerald-500 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10">
                          {t('addToProducts')}
                        </button>
                      ) : '—')}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-700 dark:text-slate-300">{qty.toLocaleString('en-IN')} Kg</td>
                    <td className="px-3 py-2.5 text-right text-blue-600 dark:text-blue-400 font-semibold">{sold.toLocaleString('en-IN')} Kg</td>
                    <td className="px-3 py-2.5 text-right font-bold text-amber-600 dark:text-amber-400">{remaining.toLocaleString('en-IN')} Kg</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{r.ratePerKg != null ? rupee(r.ratePerKg) : '—'}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        {r.source !== 'production' && sold <= 0 && <DeleteButton url={`/mill/by-products/${r.id}`} name={r.name} onDone={() => refetch()} />}
                        {remaining > 0 && (
                          <button onClick={() => setSellingId(r.id)} title={t('recordSaleTip')}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10">
                            <IndianRupee size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <ModalPortal><AddByProductModal
          batches={batches}
          products={byProductProducts}
          names={knownNames}
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); refetch(); }}
        /></ModalPortal>
      )}
      {sellingId && (
        <ModalPortal><RecordSaleModal
          row={rows.find(r => r.id === sellingId)!}
          onClose={() => setSellingId(null)}
          onSaved={() => { setSellingId(null); refetch(); }}
        /></ModalPortal>
      )}
      {linkingId && (
        <ModalPortal><LinkProductModal
          row={rows.find(r => r.id === linkingId)!}
          products={byProductProducts}
          onClose={() => setLinkingId(null)}
          onSaved={() => { setLinkingId(null); refetch(); }}
        /></ModalPortal>
      )}
    </div>
  );
}

function AddByProductModal({ batches, products, names, onClose, onAdded }: {
  batches: Batch[]; products: Product[]; names: string[]; onClose: () => void; onAdded: () => void;
}) {
  const t = useTranslations('ByProducts');
  const [form, setForm] = useState({ name: '', batchId: '', productId: '', quantityKg: '', ratePerKg: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/mill/by-products', {
        name: form.name, batchId: form.batchId || undefined, productId: form.productId || undefined,
        quantityKg: form.quantityKg || undefined, ratePerKg: form.ratePerKg || undefined, notes: form.notes,
      });
      onAdded();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('modal_addError'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900">
          <h2 className="text-lg font-black">{t('modal_addTitle')}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('modal_nameLabel')}</span>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder={t('modal_namePlaceholder')} className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {names.map(n => (
                <button key={n} type="button" onClick={() => setForm(f => ({ ...f, name: n }))}
                  className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-blue-100 dark:hover:bg-blue-500/10 hover:text-blue-600">
                  {n}
                </button>
              ))}
            </div>
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('modal_batchLabel')}</span>
            <span className="block text-[10px] text-slate-400 mb-1">{t('modal_batchHint')}</span>
            <select value={form.batchId} onChange={e => setForm(f => ({ ...f, batchId: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
              <option value="">{t('modal_batchNone')}</option>
              {batches.map(b => <option key={b.id} value={b.id}>{b.batchNumber}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('modal_linkProductLabel')}</span>
            <select value={form.productId} onChange={e => setForm(f => ({ ...f, productId: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
              <option value="">{t('modal_batchNone')}</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span className="block text-[10px] text-slate-400 mt-1">{t('modal_linkProductHint')}</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('modal_qtyLabel')}</span>
              <input type="number" min="0" step="0.01" value={form.quantityKg} onChange={e => setForm(f => ({ ...f, quantityKg: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('modal_rateLabel')}</span>
              <input type="number" min="0" step="0.01" value={form.ratePerKg} onChange={e => setForm(f => ({ ...f, ratePerKg: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving || !form.name || !(Number(form.quantityKg) > 0)}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {t('modal_addTitle')}
          </button>
        </form>
      </div>
    </div>
  );
}

function RecordSaleModal({ row, onClose, onSaved }: {
  row: ByProductRow; onClose: () => void; onSaved: () => void;
}) {
  const t = useTranslations('ByProducts');
  const remaining = Math.max(0, (row.quantityKg ?? 0) - (row.soldKg ?? 0));
  const [addSoldKg, setAddSoldKg] = useState('');
  const [ratePerKg, setRatePerKg] = useState(row.ratePerKg != null ? String(row.ratePerKg) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.patch(`/mill/by-products/${row.id}`, {
        addSoldKg, ratePerKg: ratePerKg === '' ? undefined : ratePerKg,
      });
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('modal_saleError'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-black">{t('modal_saleTitle', { name: row.name })}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <p className="text-xs text-slate-500">{t('modal_saleHint', { remaining: remaining.toLocaleString('en-IN') })}</p>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('modal_qtySoldLabel')}</span>
            <input type="number" min="0" max={remaining} step="0.01" value={addSoldKg} onChange={e => setAddSoldKg(e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required autoFocus />
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('modal_rateLabel')}</span>
            <input type="number" min="0" step="0.01" value={ratePerKg} onChange={e => setRatePerKg(e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving || !addSoldKg}
            className="w-full h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <IndianRupee size={16} />}
            {t('modal_recordSaleBtn')}
          </button>
        </form>
      </div>
    </div>
  );
}

function LinkProductModal({ row, products, onClose, onSaved }: {
  row: ByProductRow; products: Product[]; onClose: () => void; onSaved: () => void;
}) {
  const t = useTranslations('ByProducts');
  const remaining = Math.max(0, (row.quantityKg ?? 0) - (row.soldKg ?? 0));
  const [mode, setMode] = useState<'existing' | 'new'>(products.length ? 'existing' : 'new');
  const [productId, setProductId] = useState('');
  const [name, setName] = useState(row.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.patch(`/mill/by-products/${row.id}`, {
        linkProduct: mode === 'existing' ? { productId } : { name: name.trim() },
      });
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('modal_linkError'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-black">{t('modal_linkTitle', { name: row.name })}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <p className="text-xs text-slate-500">{t('modal_linkHint', { remaining: remaining.toLocaleString('en-IN') })}</p>
          {products.length > 0 && (
            <div className="flex gap-2 text-xs font-bold">
              <button type="button" onClick={() => setMode('existing')} className={cn('flex-1 h-9 rounded-lg border', mode === 'existing' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300')}>{t('modal_existingProduct')}</button>
              <button type="button" onClick={() => setMode('new')} className={cn('flex-1 h-9 rounded-lg border', mode === 'new' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300')}>{t('modal_newProduct')}</button>
            </div>
          )}
          {mode === 'existing' ? (
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('modal_productLabel')}</span>
              <select value={productId} onChange={e => setProductId(e.target.value)} required
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
                <option value="">{t('modal_selectProduct')}</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          ) : (
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('modal_productNameLabel')}</span>
              <input value={name} onChange={e => setName(e.target.value)} required autoFocus
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving || (mode === 'existing' ? !productId : !name.trim())}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {t('modal_addToProductsBtn')}
          </button>
        </form>
      </div>
    </div>
  );
}
