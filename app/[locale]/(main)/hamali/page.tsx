'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, X, Loader2, HardHat } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

const HAMALI_CATEGORY = 'Hamali / Labour';

type ExpenseRow = { id: string; category: string; amount: number; description: string | null; paymentMode: string | null; date: string };

const fetcher = (u: string) => api.get(u).then(r => r.data);
const rupee = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

function isThisMonth(iso: string) {
  const d = new Date(iso), now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export default function HamaliPage() {
  const t = useTranslations('Hamali');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [recording, setRecording] = useState(false);

  const { data: allExpenses = [], mutate: refetch, isLoading } = useSWR<ExpenseRow[]>(
    activeShopId ? ['/expenses', activeShopId] : null,
    ([u]) => fetcher(u),
  );
  const rows = allExpenses.filter(e => e.category === HAMALI_CATEGORY);
  const totalThisMonth = rows.filter(e => isThisMonth(e.date)).reduce((s, e) => s + (e.amount || 0), 0);

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <HardHat size={22} className="text-yellow-600" /> {t('title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>
        <button onClick={() => setRecording(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors">
          <Plus size={18} /> {t('recordCharge')}
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <p className="text-[11px] text-slate-500">{t('totalThisMonth')}</p>
        <p className="text-2xl font-black text-yellow-600 dark:text-yellow-400">{rupee(totalThisMonth)}</p>
      </div>

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <HardHat size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm text-slate-500">{t('noEntries')}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map(e => (
              <li key={e.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-700 dark:text-slate-300">{e.description || t('title')}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {e.paymentMode || 'Cash'} · {new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <span className="text-lg font-black text-yellow-600 dark:text-yellow-400 shrink-0">−{rupee(e.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recording && (
        <RecordChargeModal onClose={() => setRecording(false)} onRecorded={() => { setRecording(false); refetch(); }} />
      )}
    </div>
  );
}

function RecordChargeModal({ onClose, onRecorded }: { onClose: () => void; onRecorded: () => void }) {
  const t = useTranslations('Hamali');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Card'>('Cash');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/expenses', { category: HAMALI_CATEGORY, amount: Number(amount), description, paymentMode });
      onRecorded();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('failedToRecord'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-black">{t('recordCharge')}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('amount')} *</span>
            <input type="number" min="0" step="0.01" autoFocus value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required />
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('descriptionOptional')}</span>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder={t('descriptionPlaceholder')}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('paymentMode')}</span>
            <div className="grid grid-cols-3 gap-2">
              {(['Cash', 'UPI', 'Card'] as const).map(m => (
                <button key={m} type="button" onClick={() => setPaymentMode(m)}
                  className={cn('h-9 rounded-lg text-sm font-bold border-2 transition-colors',
                    paymentMode === m ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400' : 'border-slate-200 dark:border-slate-700 text-slate-500')}>
                  {m}
                </button>
              ))}
            </div>
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving || !amount}
            className="w-full h-11 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {t('recordCharge')}
          </button>
        </form>
      </div>
    </div>
  );
}
