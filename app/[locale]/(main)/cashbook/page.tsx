'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import api from '@/lib/api';
import useSWR from 'swr';
import { useBusinessStore } from '@/lib/businessStore';
import { Wallet, Loader2, ArrowUpRight, ArrowDownRight, IndianRupee, Plus, Minus, X, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

type CashEntry = {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  date: string;
  createdAt?: string;
};

// Color + label per cash book entry type
const TYPE_META: Record<string, { color: string; dot: string }> = {
  sale:            { color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300', dot: 'bg-emerald-500' },
  collection:      { color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',            dot: 'bg-teal-500' },
  opening_balance: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',             dot: 'bg-blue-500' },
  deposit:         { color: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',                 dot: 'bg-sky-500' },
  purchase:        { color: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',             dot: 'bg-rose-500' },
  expense:         { color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',     dot: 'bg-orange-500' },
  withdrawal:      { color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',     dot: 'bg-purple-500' },
  refund:          { color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',         dot: 'bg-amber-500' },
  salary:          { color: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',             dot: 'bg-pink-500' },
};

const IN_TYPES  = new Set(['sale', 'collection', 'opening_balance', 'deposit']);
const OUT_TYPES = new Set(['purchase', 'expense', 'withdrawal', 'refund', 'salary']);

const rupee = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const fetcher = (url: string) => api.get(url).then(r => r.data);

export default function CashBookPage() {
  const t = useTranslations('CashBook');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [addModal, setAddModal] = useState<'in' | 'out' | null>(null);

  // SWR with auto-refresh: revalidates every 20s and immediately when the
  // user switches back to this tab — so a cashbook entry posted by billing,
  // expenses, purchases etc. appears here within seconds, no manual refresh.
  const { data: entries = [], isLoading, mutate } = useSWR<CashEntry[]>(
    activeShopId ? `/cashbook?date=${date}&_shop=${activeShopId}` : null,
    fetcher,
    {
      refreshInterval: 20_000,      // poll every 20s
      revalidateOnFocus: true,      // refresh when user tabs back
      revalidateOnReconnect: true,  // refresh after network recovery
    },
  );

  const inTotal  = entries.filter(e => IN_TYPES.has(e.type)).reduce((s, e) => s + e.amount, 0);
  const outTotal = entries.filter(e => OUT_TYPES.has(e.type)).reduce((s, e) => s + e.amount, 0);
  const balance  = inTotal - outTotal;

  const typeLabel = (type: string) => {
    try { return t(`types.${type}` as any); } catch { return type.replace(/_/g, ' '); }
  };

  const translateDescription = (desc: string | null): string => {
    if (!desc) return '—';
    let m: RegExpMatchArray | null;
    if ((m = desc.match(/^Payment from Customer:\s*(.+)$/i)))   return t('desc.paymentFromCustomer' as any, { name: m[1] });
    if ((m = desc.match(/^Payment to Supplier:\s*(.+)$/i)))     return t('desc.paymentToSupplier' as any, { name: m[1] });
    if ((m = desc.match(/^Cash Sale:\s*(.+)$/i)))               return t('desc.cashSale' as any, { invoice: m[1] });
    if ((m = desc.match(/^Split Sale.*?:\s*(.+)$/i)))           return t('desc.splitSale' as any, { invoice: m[1] });
    if ((m = desc.match(/^Payment for Purchase Invoice:\s*(.+)$/i))) return t('desc.purchasePayment' as any, { invoice: m[1] });
    if ((m = desc.match(/^Maintenance:\s*(.+)$/i)))             return t('desc.maintenance' as any, { text: m[1] });
    if ((m = desc.match(/^Commission payment to\s*(.+)$/i)))    return t('desc.commissionPayment' as any, { name: m[1] });
    if ((m = desc.match(/^Freight payment to\s*(.+)$/i)))       return t('desc.freightPayment' as any, { name: m[1] });
    if (desc.match(/^Advance Salary Payment$/i))                return t('desc.advanceSalary' as any);
    if ((m = desc.match(/^Salary Payment\s*\((.+)\)$/i)))       return t('desc.salaryPayment' as any, { period: m[1] });
    if ((m = desc.match(/^Exchange refund for\s*(.+)$/i)))      return t('desc.exchangeRefund' as any, { invoice: m[1] });
    if ((m = desc.match(/^Exchange\s*\(.*?\):\s*(.+)$/i)))      return t('desc.exchangeCash' as any, { invoice: m[1] });
    if ((m = desc.match(/^Expense:\s*(.+)$/i)))                 return t('desc.expenseGeneral' as any, { text: m[1] });
    if ((m = desc.match(/^(?:Sale hamali|Hamali)\s*[-–]\s*(.+)$/i))) return t('desc.saleHamali' as any, { text: m[1] });
    return desc;
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <Wallet size={24} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">{t('title')}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{t('subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => mutate()}
            title={t('refresh') || 'Refresh'}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setAddModal('in')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-colors"
          >
            <Plus size={15} /> {t('addCashIn')}
          </button>
          <button
            onClick={() => setAddModal('out')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold transition-colors"
          >
            <Minus size={15} /> {t('addCashOut')}
          </button>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center shrink-0">
            <ArrowUpRight size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('cashIn')}</p>
            <p className="text-lg sm:text-2xl font-black text-emerald-600 truncate">{rupee(inTotal)}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-600 flex items-center justify-center shrink-0">
            <ArrowDownRight size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('cashOut')}</p>
            <p className="text-lg sm:text-2xl font-black text-rose-600 truncate">{rupee(outTotal)}</p>
          </div>
        </div>
        <div className={cn('bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 border-b-4 flex items-center gap-3', balance >= 0 ? 'border-b-indigo-500' : 'border-b-rose-500')}>
          <div className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0', balance >= 0 ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-600')}>
            <IndianRupee size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('netBalance')}</p>
            <p className={cn('text-lg sm:text-2xl font-black truncate', balance >= 0 ? 'text-indigo-600' : 'text-rose-600')}>{balance < 0 ? '−' : ''}{rupee(balance)}</p>
          </div>
        </div>
      </div>

      {/* Entries table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        {isLoading && entries.length === 0 ? (
          <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-emerald-500" size={28} /></div>
        ) : entries.length === 0 ? (
          <div className="p-12 text-center">
            <Wallet size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-700" />
            <p className="text-slate-500 font-medium">{t('noEntries')}</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 uppercase font-bold tracking-wider">
                    <th className="px-5 py-3.5">{t('colTime')}</th>
                    <th className="px-5 py-3.5">{t('colType')}</th>
                    <th className="px-5 py-3.5">{t('colDescription')}</th>
                    <th className="px-5 py-3.5 text-right">{t('colAmount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {entries.map(e => {
                    const isOut = OUT_TYPES.has(e.type);
                    const meta = TYPE_META[e.type] || { color: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' };
                    return (
                      <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-5 py-3.5 text-sm text-slate-500 whitespace-nowrap">
                          {new Date(e.date || e.createdAt || '').toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={cn('inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full', meta.color)}>
                            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', meta.dot)} />
                            {typeLabel(e.type)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-slate-700 dark:text-slate-300 max-w-xs truncate">
                          {translateDescription(e.description)}
                        </td>
                        <td className={cn('px-5 py-3.5 text-sm font-black text-right whitespace-nowrap', isOut ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                          {isOut ? '−' : '+'} {rupee(e.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="sm:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {entries.map(e => {
                const isOut = OUT_TYPES.has(e.type);
                const meta = TYPE_META[e.type] || { color: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' };
                return (
                  <li key={e.id} className="px-4 py-3 flex items-center gap-3">
                    <div className={cn('w-2 h-8 rounded-full shrink-0', meta.dot)} />
                    <div className="flex-1 min-w-0">
                      <span className={cn('inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full mb-0.5', meta.color)}>
                        {typeLabel(e.type)}
                      </span>
                      <p className="text-xs text-slate-500 truncate">{e.description ? translateDescription(e.description) : new Date(e.date || '').toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <span className={cn('text-sm font-black shrink-0', isOut ? 'text-rose-600' : 'text-emerald-600')}>
                      {isOut ? '−' : '+'}{rupee(e.amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {addModal && (
        <ManualEntryModal
          mode={addModal}
          date={date}
          onClose={() => setAddModal(null)}
          onSaved={() => { setAddModal(null); mutate(); }}
        />
      )}
    </div>
  );
}

function ManualEntryModal({ mode, date, onClose, onSaved }: {
  mode: 'in' | 'out'; date: string; onClose: () => void; onSaved: () => void;
}) {
  const t = useTranslations('CashBook');
  const isIn = mode === 'in';

  const IN_OPTIONS = [
    { value: 'opening_balance', label: t('cashInTypes.opening_balance') },
    { value: 'deposit',         label: t('cashInTypes.deposit') },
  ];
  const OUT_OPTIONS = [
    { value: 'withdrawal', label: t('cashOutTypes.withdrawal') },
  ];
  const options = isIn ? IN_OPTIONS : OUT_OPTIONS;

  const [type, setType] = useState(options[0].value);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    setSaving(true);
    try {
      await api.post('/cashbook', {
        type,
        amount: Number(amount),
        description: description.trim() || undefined,
        date,
      });
      onSaved();
    } catch {
      toast.error(t('failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
        <div className={cn('px-5 py-4 flex items-center justify-between', isIn ? 'bg-emerald-600' : 'bg-rose-500')}>
          <h2 className="text-white font-black text-base">{isIn ? t('addCashIn') : t('addCashOut')}</h2>
          <button onClick={onClose}><X size={20} className="text-white/80 hover:text-white" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('entryTypeLabel')}</span>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
            >
              {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('amountLabel')}</span>
            <input
              type="number"
              min="1"
              step="1"
              autoFocus
              value={amount}
              onChange={e => setAmount(e.target.value)}
              required
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('descriptionLabel')}</span>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={saving || !amount}
            className={cn('w-full h-11 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50', isIn ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-500 hover:bg-rose-600')}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : (isIn ? <Plus size={16} /> : <Minus size={16} />)}
            {saving ? t('saving') : t('save')}
          </button>
        </form>
      </div>
    </div>
  );
}
