'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, X, Loader2, Handshake, IndianRupee } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { ExportButton } from '@/lib/hooks/useExport';

type Broker = { id: string; name: string; mobile: string | null; balance: number; entryCount: number };
type CommissionRow = { id: string; brokerId: string; type: 'charge' | 'payment'; amount: number; billNumber: string | null; paymentMethod: string | null; note: string | null; date: string };

const fetcher = (u: string) => api.get(u).then(r => r.data);
const rupee = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function BrokersPage() {
  const t = useTranslations('Brokers');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [selectedBrokerId, setSelectedBrokerId] = useState<string | null>(null);
  const [entryModal, setEntryModal] = useState<{ brokerId: string; type: 'charge' | 'payment' } | null>(null);
  const [showAddBroker, setShowAddBroker] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, mutate: refetch, isLoading } = useSWR<{ brokers: Broker[]; entries: CommissionRow[] }>(
    activeShopId ? ['/management/commission', activeShopId] : null,
    ([u]) => fetcher(u),
  );

  const brokers = data?.brokers || [];
  const entries = data?.entries || [];
  const totalOwed = brokers.reduce((s, b) => s + Math.max(0, b.balance), 0);
  const selectedBroker = brokers.find(b => b.id === selectedBrokerId);

  const filteredEntries = entries
    .filter(e => !selectedBrokerId || e.brokerId === selectedBrokerId)
    .filter(e => {
      if (!dateFrom && !dateTo) return true;
      const d = new Date(e.date);
      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo) { const end = new Date(dateTo); end.setHours(23,59,59,999); if (d > end) return false; }
      return true;
    });

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Handshake size={22} className="text-rose-600" /> {t('title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ExportButton
            title={selectedBroker ? `${selectedBroker.name} — Commission Statement` : 'Commission Statement'}
            filename="commission-statement"
            orientation="landscape"
            columns={[
              { key: 'date', label: 'Date', format: (v: string) => new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
              { key: 'brokerName', label: 'Broker' },
              { key: 'type', label: 'Type', format: (v: string) => v === 'charge' ? 'Charge' : 'Payment' },
              { key: 'billNumber', label: 'Bill #', format: (v: any) => v || '—' },
              { key: 'amount', label: 'Amount (₹)', format: (v: number) => v.toLocaleString('en-IN') },
              { key: 'paymentMethod', label: 'Mode', format: (v: any) => v || '—' },
              { key: 'note', label: 'Note', format: (v: any) => v || '' },
            ]}
            data={filteredEntries.map(e => ({
              ...e,
              brokerName: brokers.find(b => b.id === e.brokerId)?.name || e.brokerId,
            }))}
          />
          <button
            onClick={() => setShowAddBroker(true)}
            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors"
          >
            <Plus size={15} /> {t('addBrokerBtn')}
          </button>
        </div>
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
          <button onClick={() => setShowAddBroker(true)} className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl transition-colors">
            <Plus size={14} /> {t('addBrokerBtn')}
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
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {['Supplier broker', 'Customer broker'].filter(k => entries.some(e => e.brokerId === b.id && (e.note || '').startsWith(`[${k}]`))).map(k => (
                      <span key={k} className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">{k}</span>
                    ))}
                  </div>
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
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <p className="text-xs font-bold uppercase text-slate-500 flex-1">
            {selectedBroker ? t('logFor', { name: selectedBroker.name }) : t('allActivity')}
          </p>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-rose-500" />
          <span className="text-xs text-slate-400">–</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-rose-500" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-xs font-bold text-slate-400 hover:text-red-500 px-1">
              {t('clearFilter')}
            </button>
          )}
        </div>
        {filteredEntries.length === 0 ? (
          <p className="text-sm text-slate-500">{t('noEntries')}</p>
        ) : (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredEntries.map(e => (
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

      {showAddBroker && (
        <AddBrokerModal
          onClose={() => setShowAddBroker(false)}
          onSaved={() => { setShowAddBroker(false); refetch(); }}
        />
      )}
    </div>
  );
}

function AddBrokerModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('Brokers');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true); setError('');
    try {
      await api.post('/crm/customers', {
        name: name.trim(),
        mobile: mobile.trim(),
        customerType: 'broker',
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
            <Handshake size={16} className="text-rose-600" /> {t('addBrokerBtn')}
          </h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('brokerName')} *</span>
            <input type="text" autoFocus value={name} onChange={e => setName(e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required />
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('mobileOptional')}</span>
            <input type="tel" value={mobile} onChange={e => setMobile(e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving || !name.trim()}
            className="w-full h-11 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {t('addBrokerBtn')}
          </button>
        </form>
      </div>
    </div>
  );
}

function CommissionEntryModal({ brokerId, brokerName, type, onClose, onSaved }: {
  brokerId: string; brokerName: string; type: 'charge' | 'payment'; onClose: () => void; onSaved: () => void;
}) {
  const t = useTranslations('Brokers');
  const [amount, setAmount] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [rate, setRate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Card'>('Cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const calcAmount = () => {
    const b = parseFloat(billAmount);
    const r = parseFloat(rate);
    if (!isNaN(b) && !isNaN(r) && r > 0) {
      setAmount(((b * r) / 100).toFixed(2));
    }
  };

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
          {type === 'charge' && (
            <div className="rounded-xl border border-rose-100 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 p-3 space-y-3">
              <p className="text-[10px] font-bold uppercase text-rose-500">Auto-Calculate (Optional)</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Bill Amount ₹</span>
                  <input type="number" min="0" step="0.01" value={billAmount} onChange={e => setBillAmount(e.target.value)}
                    className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-sm" placeholder="0" />
                </label>
                <label className="block">
                  <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Rate %</span>
                  <input type="number" min="0" max="100" step="0.01" value={rate} onChange={e => setRate(e.target.value)}
                    className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-sm" placeholder="2" />
                </label>
              </div>
              <button type="button" onClick={calcAmount}
                className="w-full h-9 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-colors">
                Calculate → ₹{billAmount && rate ? ((parseFloat(billAmount) * parseFloat(rate)) / 100).toFixed(2) : '—'}
              </button>
            </div>
          )}
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('amount')} *</span>
            <input type="number" min="0" step="0.01" autoFocus={type !== 'charge'} value={amount} onChange={e => setAmount(e.target.value)}
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
