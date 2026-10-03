'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, X, Loader2, ArrowUpFromLine, Search } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { isMillBillingPackage } from '@/lib/config/packageConfig';

type PaymentRow = {
  id: string; supplierId: string; supplierName: string; supplierMobile: string;
  type: string; amount: number; note: string; billNumber: string; paymentMethod: string | null; date: string;
};
type Supplier = { id: string; name: string; mobile?: string | null; balance?: number };

const fetcher = (u: string) => api.get(u).then(r => r.data);
const rupee = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function PaymentsPage() {
  const t = useTranslations('Payments');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [search, setSearch] = useState('');
  const [recording, setRecording] = useState(false);

  const { data, mutate: refetch, isLoading } = useSWR<{ rows: PaymentRow[]; summary: { totalPaid: number; totalPurchased: number } }>(
    activeShopId ? ['/suppliers/payments-log?type=payment', activeShopId] : null,
    ([u]) => fetcher(u),
  );
  const { data: suppliers = [] } = useSWR<Supplier[]>(
    activeShopId ? ['/suppliers', activeShopId] : null,
    ([u]) => fetcher(u),
  );

  const rows = data?.rows || [];
  const needle = search.trim().toLowerCase();
  const filtered = needle
    ? rows.filter(r => r.supplierName.toLowerCase().includes(needle) || (r.billNumber || '').toLowerCase().includes(needle))
    : rows;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ArrowUpFromLine size={22} className="text-rose-600" /> {t('title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>
        <button onClick={() => setRecording(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors">
          <Plus size={18} /> {t('recordPayment')}
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <p className="text-[11px] text-slate-500">{t('totalPaidLabel')}</p>
        <p className="text-2xl font-black text-rose-600 dark:text-rose-400">{rupee(data?.summary?.totalPaid || 0)}</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('searchPlaceholder')}
          className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      </div>

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <ArrowUpFromLine size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm text-slate-500">{t('noPayments')}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((r) => (
              <li key={r.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900 dark:text-white">{r.supplierName}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {r.paymentMethod || 'Cash'} · {new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {r.note && ` · ${r.note}`}
                  </p>
                </div>
                <span className="text-lg font-black text-rose-600 dark:text-rose-400 shrink-0">−{rupee(r.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recording && (
        <RecordPaymentModal
          suppliers={suppliers}
          onClose={() => setRecording(false)}
          onRecorded={() => { setRecording(false); refetch(); }}
        />
      )}
    </div>
  );
}

function RecordPaymentModal({ suppliers, onClose, onRecorded }: {
  suppliers: Supplier[]; onClose: () => void; onRecorded: () => void;
}) {
  const t = useTranslations('Payments');
  const [form, setForm] = useState({ supplierId: '', amount: '', paymentMode: 'Cash', note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selectedSupplier = suppliers.find(s => s.id === form.supplierId);
  const isMill = isMillBillingPackage(useBusinessStore().profile?.packageType);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Bada Udyog: a payment above what is owed is an advance to the supplier — make sure it is meant, not a typo
    const owed = Math.max(0, Number(selectedSupplier?.balance) || 0);
    const amt = Number(form.amount) || 0;
    if (isMill && amt > owed + 0.005) {
      const ok = window.confirm(`${selectedSupplier?.name || 'Supplier'}: balance is ${rupee(owed)} but you are paying ${rupee(amt)}.

The extra ${rupee(amt - owed)} will be recorded as an ADVANCE to the supplier (balance goes to -${rupee(amt - owed)}).

Continue?`);
      if (!ok) return;
    }
    setSaving(true); setError('');
    try {
      await api.post('/crm/payments', {
        entityType: 'supplier', entityId: form.supplierId,
        amount: Number(form.amount), paymentMode: form.paymentMode, note: form.note,
      });
      onRecorded();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('failedToRecord'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-black">{t('recordPayment')}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('supplier')} *</span>
            <select value={form.supplierId} onChange={e => setForm(f => ({ ...f, supplierId: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required>
              <option value="">{t('selectSupplier')}</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.balance ? ` — ${rupee(s.balance)} due` : ''}</option>)}
            </select>
          </label>
          {selectedSupplier?.balance != null && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">{t('currentBalance')}: {rupee(selectedSupplier.balance)}</p>
          )}
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('amount')} *</span>
            <input type="number" min="0" step="0.01" autoFocus value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required />
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('paymentMode')}</span>
            <div className="grid grid-cols-3 gap-2">
              {(['Cash', 'UPI', 'Card'] as const).map(m => (
                <button key={m} type="button" onClick={() => setForm(f => ({ ...f, paymentMode: m }))}
                  className={cn('h-9 rounded-lg text-sm font-bold border-2 transition-colors',
                    form.paymentMode === m ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-slate-200 dark:border-slate-700 text-slate-500')}>
                  {m}
                </button>
              ))}
            </div>
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('notesOptional')}</span>
            <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving || !form.supplierId || !form.amount}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {t('recordPayment')}
          </button>
        </form>
      </div>
    </div>
  );
}
