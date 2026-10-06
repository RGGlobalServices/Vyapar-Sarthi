'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, X, Loader2, Truck, IndianRupee, ArrowRight } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useRouter, useParams } from 'next/navigation';

type Transporter = { id: string; name: string; mobile: string | null; balance: number; entryCount: number };
type FreightRow = { id: string; transporterId: string; type: 'charge' | 'payment'; amount: number; vehicleNumber: string | null; paymentMethod: string | null; note: string | null; date: string };

const fetcher = (u: string) => api.get(u).then(r => r.data);
const rupee = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function TransportPage() {
  const t = useTranslations('Transport');
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [selectedTransporterId, setSelectedTransporterId] = useState<string | null>(null);
  const [entryModal, setEntryModal] = useState<{ transporterId: string; type: 'charge' | 'payment' } | null>(null);

  const { data, mutate: refetch, isLoading } = useSWR<{ transporters: Transporter[]; entries: FreightRow[] }>(
    activeShopId ? ['/logistics/freight', activeShopId] : null,
    ([u]) => fetcher(u),
  );

  const transporters = data?.transporters || [];
  const entries = data?.entries || [];
  const totalOwed = transporters.reduce((s, tr) => s + Math.max(0, tr.balance), 0);
  const selectedEntries = selectedTransporterId ? entries.filter(e => e.transporterId === selectedTransporterId) : entries;
  const selectedTransporter = transporters.find(tr => tr.id === selectedTransporterId);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Truck size={22} className="text-orange-600" /> {t('title')}
        </h1>
        <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <p className="text-[11px] text-slate-500">{t('totalOwedLabel')}</p>
        <p className="text-2xl font-black text-rose-600 dark:text-rose-400">{rupee(totalOwed)}</p>
      </div>

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : transporters.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <Truck size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm text-slate-500">{t('noTransporters')}</p>
          <button onClick={() => router.push(`/${locale}/party`)} className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-orange-600 hover:text-orange-700">
            {t('addTransporterHint')} <ArrowRight size={14} />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {transporters.map(tr => (
            <div key={tr.id}
              onClick={() => setSelectedTransporterId(id => id === tr.id ? null : tr.id)}
              className={cn('p-4 rounded-xl border-2 bg-white dark:bg-slate-900 cursor-pointer transition-colors',
                selectedTransporterId === tr.id ? 'border-orange-400 dark:border-orange-500/60' : 'border-slate-200 dark:border-slate-800')}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 dark:text-white truncate">{tr.name}</p>
                  {tr.mobile && <p className="text-xs text-slate-500">{tr.mobile}</p>}
                </div>
                <span className={cn('text-lg font-black shrink-0', tr.balance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                  {rupee(Math.abs(tr.balance))}
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={(e) => { e.stopPropagation(); setEntryModal({ transporterId: tr.id, type: 'charge' }); }}
                  className="flex-1 text-xs font-bold py-1.5 rounded-lg bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 hover:bg-orange-100">
                  {t('addCharge')}
                </button>
                <button onClick={(e) => { e.stopPropagation(); setEntryModal({ transporterId: tr.id, type: 'payment' }); }}
                  className="flex-1 text-xs font-bold py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100">
                  {t('recordPayment')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {selectedTransporter ? t('logFor', { name: selectedTransporter.name }) : t('allActivity')}
          </p>
          {selectedEntries.length > 0 && (
            <span className="text-[11px] text-slate-400">{t('entries', { count: selectedEntries.length })}</span>
          )}
        </div>
        {selectedEntries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-10 text-center">
            <p className="text-sm text-slate-400">{t('noEntries')}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {selectedEntries.map(e => {
                const tr = !selectedTransporterId ? transporters.find(t2 => t2.id === e.transporterId) : null;
                const dateStr = new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                return (
                  <li key={e.id} className="px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn('text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full',
                            e.type === 'charge'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300')}>
                            {e.type === 'charge' ? t('charge') : t('payment')}
                          </span>
                          {tr && (
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{tr.name}</span>
                          )}
                          {e.vehicleNumber && (
                            <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded">
                              {e.vehicleNumber}
                            </span>
                          )}
                          {e.paymentMethod && (
                            <span className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">
                              {t('via', { method: e.paymentMethod })}
                            </span>
                          )}
                        </div>
                        {e.note && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{e.note}</p>
                        )}
                        <p className="text-[11px] text-slate-400 dark:text-slate-600">{dateStr}</p>
                      </div>
                      <div className="shrink-0 text-right pt-0.5">
                        <span className={cn('text-base font-black tabular-nums',
                          e.type === 'charge' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                          {e.type === 'charge' ? '+' : '−'}{rupee(e.amount)}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {entryModal && (
        <FreightEntryModal
          transporterId={entryModal.transporterId}
          transporterName={transporters.find(t2 => t2.id === entryModal.transporterId)?.name || ''}
          type={entryModal.type}
          onClose={() => setEntryModal(null)}
          onSaved={() => { setEntryModal(null); refetch(); }}
        />
      )}
    </div>
  );
}

function FreightEntryModal({ transporterId, transporterName, type, onClose, onSaved }: {
  transporterId: string; transporterName: string; type: 'charge' | 'payment'; onClose: () => void; onSaved: () => void;
}) {
  const t = useTranslations('Transport');
  const [amount, setAmount] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Card'>('Cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/logistics/freight', {
        transporterId, type, amount: Number(amount),
        vehicleNumber: type === 'charge' ? vehicleNumber : undefined,
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
            {type === 'charge' ? t('addCharge') : t('recordPayment')}
          </h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{transporterName}</p>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('amount')} *</span>
            <input type="number" min="0" step="0.01" autoFocus value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required />
          </label>
          {type === 'charge' ? (
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('vehicleNumberOptional')}</span>
              <input value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value.toUpperCase())}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" placeholder="MH12AB1234" />
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
            {type === 'charge' ? t('addCharge') : t('recordPayment')}
          </button>
        </form>
      </div>
    </div>
  );
}
