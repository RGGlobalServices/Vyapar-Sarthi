'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { Plus, X, Loader2, HardHat, Truck } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import DeleteButton from '@/components/mill/DeleteButton';
import EditEntryModal, { EditButton } from '@/components/mill/EditEntryModal';

const HAMALI_CATEGORY = 'Hamali / Labour';

type ExpenseRow = {
  direction?: 'purchase' | 'sale' | null; billLabel?: string | null;
  id: string; category: string; amount: number; description: string | null;
  paymentMode: string | null; date: string;
  party?: { id: string; name: string } | null;
};
type Party = { id: string; name: string; mobile?: string | null };
type GateHamaliRow = {
  id: string; entryNumber: string; vehicleNumber: string; hamaliAmount: number;
  enteredAt: string; supplier?: { id: string; name: string } | null;
};

const fetcher = (u: string) => api.get(u).then(r => r.data);
const rupee = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

function isThisMonth(iso: string) {
  const d = new Date(iso), now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export default function HamaliPage() {
  const t = useTranslations('Hamali');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [recording, setRecording] = useState(false);
  const [dirFilter, setDirFilter] = useState<'all' | 'purchase' | 'sale'>('all');
  const [editing, setEditing] = useState<ExpenseRow | null>(null);

  const { data: allExpenses = [], mutate: refetch, isLoading } = useSWR<ExpenseRow[]>(
    activeShopId ? ['/expenses', activeShopId] : null,
    ([u]) => fetcher(u),
  );
  const allHamali = allExpenses.filter(e => e.category === HAMALI_CATEGORY);
  const rows = allHamali.filter(e => dirFilter === 'all' || e.direction === dirFilter);
  const sumDir = (d: 'purchase' | 'sale') => allHamali.filter(e => e.direction === d).reduce((a, e) => a + (e.amount || 0), 0);

  const totalThisMonth = rows.filter(e => isThisMonth(e.date)).reduce((s, e) => s + (e.amount || 0), 0);

  const monthlySummary = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    for (const e of rows) {
      const k = monthKey(e.date);
      if (!map[k]) map[k] = { total: 0, count: 0 };
      map[k].total += e.amount || 0;
      map[k].count += 1;
    }
    return Object.entries(map)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6);
  }, [rows]);

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

      <div className="grid grid-cols-1 gap-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-[11px] text-slate-500">{t('totalThisMonth')}</p>
          <p className="text-2xl font-black text-yellow-600 dark:text-yellow-400">{rupee(totalThisMonth)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-sky-200 dark:border-sky-900/40 bg-white dark:bg-slate-900 p-4">
          <p className="text-[11px] text-sky-600 font-bold uppercase">Purchase hamali (total)</p>
          <p className="text-xl font-black text-slate-900 dark:text-white">{rupee(sumDir('purchase'))}</p>
        </div>
        <div className="rounded-xl border border-violet-200 dark:border-violet-900/40 bg-white dark:bg-slate-900 p-4">
          <p className="text-[11px] text-violet-600 font-bold uppercase">Sale hamali (total)</p>
          <p className="text-xl font-black text-slate-900 dark:text-white">{rupee(sumDir('sale'))}</p>
        </div>
      </div>

      <div className="flex gap-1.5">
        {(['all', 'purchase', 'sale'] as const).map(k => (
          <button key={k} type="button" onClick={() => setDirFilter(k)}
            className={'text-xs font-bold px-3 py-1 rounded-full border ' + (dirFilter === k ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900' : 'border-slate-200 dark:border-slate-700 text-slate-500')}>
            {k === 'all' ? 'All' : k === 'purchase' ? 'Purchase' : 'Sale'}
          </button>
        ))}
      </div>

      {monthlySummary.length > 1 && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <p className="text-xs font-bold uppercase text-slate-500 tracking-wider">Monthly Summary</p>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {monthlySummary.map(([key, data]) => (
              <li key={key} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{monthLabel(key)}</p>
                  <p className="text-xs text-slate-400">{data.count} entries</p>
                </div>
                <span className="text-base font-black text-yellow-600 dark:text-yellow-400">{rupee(data.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    {e.direction && <span className={'text-[10px] font-bold uppercase px-2 py-0.5 rounded-full mr-2 ' + (e.direction === 'purchase' ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700')}>{e.direction === 'purchase' ? 'Purchase' : 'Sale'}{e.billLabel ? ' · ' + e.billLabel : ''}</span>}
                    {e.description || t('title')}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {e.party?.name && <span className="font-medium text-indigo-600 dark:text-indigo-400 mr-1">{e.party.name} ·</span>}
                    {e.paymentMode || 'Cash'} · {new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-lg font-black text-yellow-600 dark:text-yellow-400 mr-1">−{rupee(e.amount)}</span>
                  <EditButton onClick={() => setEditing(e)} />
                  <DeleteButton url={`/expenses/${e.id}`} name={`hamali ${rupee(e.amount)}`} onDone={() => refetch()} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing && (
        <EditEntryModal url={`/expenses/${editing.id}`} title="Edit hamali" onClose={() => setEditing(null)} onDone={() => { setEditing(null); refetch(); }}
          initial={{ amount: editing.amount, description: editing.description || '', date: editing.date ? String(editing.date).slice(0, 10) : '', paymentMode: editing.paymentMode || 'Cash', direction: editing.direction || '' }}
          fields={[
            { key: 'amount', label: 'Amount (₹)', type: 'number' },
            { key: 'direction', label: 'Hamali for', type: 'choice', options: [{ value: 'purchase', label: 'Purchase' }, { value: 'sale', label: 'Sale' }] },
            { key: 'description', label: 'Description' },
            { key: 'date', label: 'Date', type: 'date' },
            { key: 'paymentMode', label: 'Paid by', type: 'select', options: ['Cash', 'UPI', 'Card', 'Bank'].map(v => ({ value: v, label: v })) },
          ]} />
      )}

      {recording && (
        <RecordChargeModal onClose={() => setRecording(false)} onRecorded={() => { setRecording(false); refetch(); }} />
      )}
    </div>
  );
}

function RecordChargeModal({ onClose, onRecorded }: { onClose: () => void; onRecorded: () => void }) {
  const t = useTranslations('Hamali');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Card'>('Cash');
  const [partyId, setPartyId] = useState('');
  const [direction, setDirection] = useState<'purchase' | 'sale'>('purchase');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { data: parties = [] } = useSWR<Party[]>(
    activeShopId ? ['/crm/customers?type=all', activeShopId] : null,
    ([u]) => api.get(u).then(r => r.data),
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/expenses', {
        category: HAMALI_CATEGORY,
        amount: Number(amount),
        description,
        paymentMode,
        partyId: partyId || undefined,
        direction,
      });
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
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Thekedar / Labour Contractor</span>
            <select value={partyId} onChange={e => setPartyId(e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
              <option value="">No party (optional)</option>
              {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <div>
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Hamali for</span>
            <div className="grid grid-cols-2 gap-2">
              {(['purchase', 'sale'] as const).map(k => (
                <button key={k} type="button" onClick={() => setDirection(k)}
                  className={cn('h-9 rounded-lg text-sm font-bold border-2 transition-colors', direction === k ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400' : 'border-slate-200 dark:border-slate-700 text-slate-500')}>
                  {k === 'purchase' ? 'Purchase' : 'Sale'}
                </button>
              ))}
            </div>
          </div>
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
