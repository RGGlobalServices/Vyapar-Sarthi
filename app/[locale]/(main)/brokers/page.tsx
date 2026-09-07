'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, X, Loader2, Handshake, IndianRupee, ArrowRight } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useRouter, useParams } from 'next/navigation';

type Broker = { id: string; name: string; mobile: string | null; balance: number; entryCount: number };
type CommissionRow = { id: string; brokerId: string; type: 'charge' | 'payment'; amount: number; billNumber: string | null; paymentMethod: string | null; note: string | null; date: string };

const fetcher = (u: string) => api.get(u).then(r => r.data);
const rupee = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function BrokersPage() {
  const t = useTranslations('Brokers');
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [selectedBrokerId, setSelectedBrokerId] = useState<string | null>(null);
  const [entryModal, setEntryModal] = useState<{ brokerId: string; type: 'charge' | 'payment' } | null>(null);

  const { data, mutate: refetch, isLoading } = useSWR<{ brokers: Broker[]; entries: CommissionRow[] }>(
    activeShopId ? ['/management/commission', activeShopId] : null,
    ([u]) => fetcher(u),
  );

  const brokers = data?.brokers || [];
  const entries = data?.entries || [];
  const totalOwed = brokers.reduce((s, b) => s + Math.max(0, b.balance), 0);
  const selectedEntries = selectedBrokerId ? entries.filter(e => e.brokerId === selectedBrokerId) : entries;
  const selectedBroker = brokers.find(b => b.id === selectedBrokerId);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Handshake size={22} className="text-rose-600" /> {t('title')}
        </h1>
        <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <p className="text-[11px] text-slate-500">{t('totalOwedLabel')}</p>
        <p className="text-2xl font-black text-rose-600 dark:text-rose-400">{rupee(totalOwed)}</p>
      </div>

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : brokers.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <Handshake size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm text-slate-500">{t('noBrokers')}</p>
          <button onClick={() => router.push(`/${locale}/party`)} className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-rose-600 hover:text-rose-700">
            {t('addBrokerHint')} <ArrowRight size={14} />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {brokers.map(b => (
            <div key={b.id}
              onClick={() => setSelectedBrokerId(id => id === b.id ? null : b.id)}
              className={cn('p-4 rounded-xl border-2 bg-white dark:bg-slate-900 cursor-pointer transition-colors',
                selectedBrokerId === b.id ? 'border-rose-400 dark:border-rose-500/60' : 'border-slate-200 dark:border-slate-800')}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 dark:text-white truncate">{b.name}</p>
                  {b.mobile && <p className="text-xs text-slate-500">{b.mobile}</p>}
                </div>
                <span className={cn('text-lg font-black shrink-0', b.balance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                  {rupee(Math.abs(b.balance))}
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={(e) => { e.stopPropagation(); setEntryModal({ brokerId: b.id, type: 'charge' }); }}
                  className="flex-1 text-xs font-bold py-1.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 hover:bg-rose-100">
                  {t('addCommission')}
                </button>
                <button onClick={(e) => { e.stopPropagation(); setEntryModal({ brokerId: b.id, type: 'payment' }); }}
                  className="flex-1 text-xs font-bold py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100">
                  {t('recordPayment')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <p className="text-xs font-bold uppercase text-slate-500 mb-2">
          {selectedBroker ? t('logFor', { name: selectedBroker.name }) : t('allActivity')}
        </p>
        {selectedEntries.length === 0 ? (
          <p className="text-sm text-slate-500">{t('noEntries')}</p>
        ) : (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {selectedEntries.map(e => (
                <li key={e.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full',
                        e.type === 'charge' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300')}>
                        {e.type === 'charge' ? t('commission') : t('payment')}
                      </span>
                      {e.billNumber && <span className="text-xs font-semibold text-slate-500">#{e.billNumber}</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {e.note && ` · ${e.note}`}
                    </p>
                  </div>
                  <span className={cn('text-lg font-black shrink-0', e.type === 'charge' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                    {e.type === 'charge' ? '+' : '−'}{rupee(e.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {entryModal && (
        <CommissionEntryModal
          brokerId={entryModal.brokerId}
          brokerName={brokers.find(b => b.id === entryModal.brokerId)?.name || ''}
          type={entryModal.type}
          onClose={() => setEntryModal(null)}
          onSaved={() => { setEntryModal(null); refetch(); }}
        />
      )}
    </div>
  );
}

function CommissionEntryModal({ brokerId, brokerName, type, onClose, onSaved }: {
  brokerId: string; brokerName: string; type: 'charge' | 'payment'; onClose: () => void; onSaved: () => void;
}) {
  const t = useTranslations('Brokers');
  const [amount, setAmount] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Card'>('Cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/management/commission', {
        brokerId, type, amount: Number(amount),
        billNumber: type === 'charge' ? billNumber : undefined,
        paymentMethod: type === 'payment' ? paymentMethod : undefined,
        note,
      });
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('failedToSave'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-black flex items-center gap-2">
            <IndianRupee size={16} className={type === 'charge' ? 'text-rose-600' : 'text-emerald-600'} />
            {type === 'charge' ? t('addCommission') : t('recordPayment')}
          </h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{brokerName}</p>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('amount')} *</span>
            <input type="number" min="0" step="0.01" autoFocus value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required />
          </label>
          {type === 'charge' ? (
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('billNumberOptional')}</span>
              <input value={billNumber} onChange={e => setBillNumber(e.target.value)}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
          ) : (
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('paymentMode')}</span>
              <div className="grid grid-cols-3 gap-2">
                {(['Cash', 'UPI', 'Card'] as const).map(m => (
                  <button key={m} type="button" onClick={() => setPaymentMethod(m)}
                    className={cn('h-9 rounded-lg text-sm font-bold border-2 transition-colors',
                      paymentMethod === m ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-slate-200 dark:border-slate-700 text-slate-500')}>
                    {m}
                  </button>
                ))}
              </div>
            </label>
          )}
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('notesOptional')}</span>
            <input value={note} onChange={e => setNote(e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving || !amount}
            className={cn('w-full h-11 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2',
              type === 'charge' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700')}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {type === 'charge' ? t('addCommission') : t('recordPayment')}
          </button>
        </form>
      </div>
    </div>
  );
}
