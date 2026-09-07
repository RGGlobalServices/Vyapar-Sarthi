'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, X, Loader2, ArrowUpFromLine } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { useTranslations } from 'next-intl';

type DispatchRow = {
  id: string; dispatchNumber: string; vehicleNumber: string | null; quantity: number | null; unit: string | null;
  notes: string | null; dispatchedAt: string;
  party?: { id: string; name: string } | null;
  product?: { id: string; name: string; baseUnit: string | null } | null;
};
type Party = { id: string; name: string; mobile?: string | null };
type Product = { id: string; name: string; baseUnit?: string | null };

const fetcher = (u: string) => api.get(u).then(r => r.data);

export default function DispatchPage() {
  const t = useTranslations('Dispatch');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [creating, setCreating] = useState(false);

  const { data: rows = [], mutate: refetch, isLoading } = useSWR<DispatchRow[]>(
    activeShopId ? ['/logistics/dispatch', activeShopId] : null,
    ([u]) => fetcher(u),
  );
  const { data: parties = [] } = useSWR<Party[]>(
    activeShopId ? ['/crm/customers?type=party', activeShopId] : null,
    ([u]) => fetcher(u),
  );
  const { data: products = [] } = useSWR<Product[]>(
    activeShopId ? ['/products', activeShopId] : null,
    ([u]) => fetcher(u),
  );

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ArrowUpFromLine size={22} className="text-blue-600" /> {t('title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>
        <button onClick={() => setCreating(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors">
          <Plus size={18} /> {t('newDispatch')}
        </button>
      </div>

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <ArrowUpFromLine size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm text-slate-500">{t('noDispatches')}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map(r => (
              <li key={r.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-slate-900 dark:text-white">{r.dispatchNumber}</span>
                    {r.vehicleNumber && <span className="text-xs font-semibold text-slate-500">{r.vehicleNumber}</span>}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {r.party?.name ? `${r.party.name} · ` : ''}
                    {r.product?.name ? `${r.product.name}${r.quantity ? ` × ${r.quantity} ${r.unit || r.product.baseUnit || ''}` : ''} · ` : ''}
                    {new Date(r.dispatchedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {creating && (
        <CreateDispatchModal
          parties={parties}
          products={products}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); refetch(); }}
        />
      )}
    </div>
  );
}

function CreateDispatchModal({ parties, products, onClose, onCreated }: {
  parties: Party[]; products: Product[]; onClose: () => void; onCreated: () => void;
}) {
  const t = useTranslations('Dispatch');
  const [form, setForm] = useState({ partyId: '', vehicleNumber: '', productId: '', quantity: '', unit: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selectedProduct = products.find(p => p.id === form.productId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/logistics/dispatch', {
        partyId: form.partyId || null,
        vehicleNumber: form.vehicleNumber || null,
        productId: form.productId || null,
        quantity: form.quantity || null,
        unit: form.unit || selectedProduct?.baseUnit || null,
        notes: form.notes,
      });
      onCreated();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('failedToCreate'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900">
          <h2 className="text-lg font-black">{t('newDispatch')}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('party')}</span>
            <select value={form.partyId} onChange={e => setForm(f => ({ ...f, partyId: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
              <option value="">{t('noParty')}</option>
              {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('vehicleNumber')}</span>
            <input value={form.vehicleNumber} onChange={e => setForm(f => ({ ...f, vehicleNumber: e.target.value.toUpperCase() }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" placeholder="MH12AB1234" />
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('product')}</span>
            <select value={form.productId} onChange={e => setForm(f => ({ ...f, productId: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
              <option value="">{t('noProduct')}</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('quantity')}</span>
              <input type="number" min="0" step="0.01" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('unit')}</span>
              <input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                placeholder={selectedProduct?.baseUnit || ''}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('notesOptional')}</span>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          {form.productId && form.quantity && (
            <p className="text-[11px] text-blue-600 dark:text-blue-400">{t('stockDebitHint', { qty: form.quantity, product: selectedProduct?.name || '' })}</p>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {t('createDispatch')}
          </button>
        </form>
      </div>
    </div>
  );
}
