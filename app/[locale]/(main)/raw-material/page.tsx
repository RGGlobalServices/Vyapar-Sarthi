'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { Plus, X, Loader2, Wheat, Package } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';

type Lot = {
  id: string;
  lotNumber: string | null;
  farmerName: string | null;
  purchaseDate: string;
  weightKg: number | null;
  moisturePct: number | null;
  ratePerKg: number | null;
  totalAmount: number | null;
  remainingKg: number | null;
  notes: string | null;
  product?: { id: string; name: string; baseUnit: string | null } | null;
  supplier?: { id: string; name: string; mobile: string | null } | null;
  batches?: { id: string; batchNumber: string; inputKg: number | null; status: string }[];
};
type Product = { id: string; name: string; millCategory?: string | null; baseUnit?: string | null };

const fetcher = (u: string) => api.get(u).then(r => r.data);
const rupee = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

// Raw Material — the mill's incoming-goods register: every lot of Paddy /
// Wheat / Bajra bought from a farmer, with its own moisture%, rate, and
// remaining-to-consume weight. Distinct from the Products catalogue (which
// only shows a rolled-up stock total) — RawMaterialLot already existed as a
// real DB model + API (feeding the Batches "pick a lot" flow) but had no
// page of its own. This is that page: list lots, add a new one, and see at
// a glance what's still available for the next production batch.
export default function RawMaterialPage() {
  const locale = useLocale();
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [statusFilter, setStatusFilter] = useState<'available' | 'consumed' | 'all'>('available');
  const [adding, setAdding] = useState(false);

  const { data: lots = [], mutate: refetch, isLoading } = useSWR<Lot[]>(
    activeShopId ? [`/mill/raw-lots${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`, activeShopId] : null,
    ([u]) => fetcher(u),
  );
  const { data: products = [] } = useSWR<Product[]>(activeShopId ? ['/products', activeShopId] : null, ([u]) => fetcher(u));
  const rawProducts = useMemo(
    () => products.filter(p => !p.millCategory || p.millCategory === 'raw_material'),
    [products],
  );

  const totals = useMemo(() => {
    const totalIn = lots.reduce((s, l) => s + (l.weightKg || 0), 0);
    const totalRemaining = lots.reduce((s, l) => s + (l.remainingKg || 0), 0);
    const totalValue = lots.reduce((s, l) => s + (l.totalAmount || 0), 0);
    return { totalIn, totalRemaining, totalValue };
  }, [lots]);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wheat size={22} className="text-amber-600" /> Raw Material
          </h1>
          <p className="text-sm text-slate-500 mt-1">Lot-wise incoming grain — farmer, weight, moisture % and rate for every lot.</p>
        </div>
        <button onClick={() => setAdding(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors">
          <Plus size={18} /> Add Lot
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 uppercase font-bold">Total Bought</p>
          <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{totals.totalIn.toLocaleString('en-IN')} Kg</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 uppercase font-bold">Remaining</p>
          <p className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">{totals.totalRemaining.toLocaleString('en-IN')} Kg</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 uppercase font-bold">Total Value</p>
          <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{rupee(totals.totalValue)}</p>
        </div>
      </div>

      <div className="flex items-center bg-white dark:bg-slate-900 rounded-lg p-1 border border-slate-200 dark:border-slate-800 w-fit">
        {(['available', 'consumed', 'all'] as const).map(s => (
          <button key={s} type="button" onClick={() => setStatusFilter(s)}
            className={cn('px-3 py-1.5 rounded-md text-xs font-bold capitalize transition-colors', statusFilter === s ? 'bg-emerald-500 text-white' : 'text-slate-500')}>
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : lots.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <Wheat size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm text-slate-500">No lots yet. Add one, or bring a truck through Gate Entry → Weighbridge.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 font-bold">Lot</th>
                <th className="px-3 py-3 font-bold">Product</th>
                <th className="px-3 py-3 font-bold">Farmer</th>
                <th className="px-3 py-3 font-bold">Date</th>
                <th className="px-3 py-3 font-bold text-right">Weight</th>
                <th className="px-3 py-3 font-bold text-right">Moisture</th>
                <th className="px-3 py-3 font-bold text-right">Rate/Kg</th>
                <th className="px-3 py-3 font-bold text-right">Amount</th>
                <th className="px-3 py-3 font-bold text-right">Remaining</th>
                <th className="px-3 py-3 font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {lots.map(l => {
                const remaining = l.remainingKg ?? 0;
                const isConsumed = remaining <= 0;
                return (
                  <tr key={l.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-2.5 font-mono text-xs font-bold text-slate-700 dark:text-slate-300">{l.lotNumber || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{l.product?.name || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{l.farmerName || l.supplier?.name || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-500">{new Date(l.purchaseDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-900 dark:text-white">{(l.weightKg ?? 0).toLocaleString('en-IN')} Kg</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{l.moisturePct != null ? `${l.moisturePct}%` : '—'}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{l.ratePerKg != null ? rupee(l.ratePerKg) : '—'}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-900 dark:text-white">{l.totalAmount != null ? rupee(l.totalAmount) : '—'}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-amber-600 dark:text-amber-400">{remaining.toLocaleString('en-IN')} Kg</td>
                    <td className="px-3 py-2.5">
                      <span className={cn('text-[10px] font-black uppercase px-2 py-0.5 rounded-full', isConsumed ? 'bg-slate-200 dark:bg-slate-700 text-slate-500' : 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400')}>
                        {isConsumed ? 'Consumed' : 'Available'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Link href={`/${locale}/products?view=raw-material`}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-emerald-600">
        <Package size={13} /> View raw-material products in the full catalogue →
      </Link>

      {adding && (
        <AddLotModal
          products={rawProducts}
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); refetch(); }}
        />
      )}
    </div>
  );
}

function AddLotModal({ products, onClose, onAdded }: {
  products: Product[]; onClose: () => void; onAdded: () => void;
}) {
  const [form, setForm] = useState({
    productId: '', lotNumber: '', farmerName: '', purchaseDate: new Date().toISOString().slice(0, 10),
    weightKg: '', moisturePct: '', ratePerKg: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const weight = Number(form.weightKg) || 0;
  const rate = Number(form.ratePerKg) || 0;
  const computedTotal = weight > 0 && rate > 0 ? Math.round(weight * rate * 100) / 100 : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/mill/raw-lots', {
        productId: form.productId || undefined,
        lotNumber: form.lotNumber, farmerName: form.farmerName,
        purchaseDate: form.purchaseDate, weightKg: form.weightKg,
        moisturePct: form.moisturePct || undefined,
        ratePerKg: form.ratePerKg || undefined,
        notes: form.notes,
      });
      onAdded();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || 'Failed to add lot');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900">
          <h2 className="text-lg font-black">Add Raw Material Lot</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Product</span>
            <select value={form.productId} onChange={e => setForm(f => ({ ...f, productId: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
              <option value="">-- Optional --</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Lot Number</span>
              <input value={form.lotNumber} onChange={e => setForm(f => ({ ...f, lotNumber: e.target.value }))}
                placeholder="Auto if blank" className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Date</span>
              <input type="date" value={form.purchaseDate} onChange={e => setForm(f => ({ ...f, purchaseDate: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Farmer / Vendor Name</span>
            <input value={form.farmerName} onChange={e => setForm(f => ({ ...f, farmerName: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Weight (Kg) *</span>
              <input type="number" min="0" step="0.01" value={form.weightKg} onChange={e => setForm(f => ({ ...f, weightKg: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Moisture %</span>
              <input type="number" min="0" max="100" step="0.1" value={form.moisturePct} onChange={e => setForm(f => ({ ...f, moisturePct: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Rate / Kg (₹)</span>
            <input type="number" min="0" step="0.01" value={form.ratePerKg} onChange={e => setForm(f => ({ ...f, ratePerKg: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            {computedTotal != null && <span className="block text-[11px] text-slate-400 mt-1">Total: {rupee(computedTotal)}</span>}
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Notes</span>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving || !form.weightKg}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Add Lot
          </button>
        </form>
      </div>
    </div>
  );
}
