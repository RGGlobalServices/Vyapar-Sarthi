'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  Landmark, Plus, ArrowDownLeft, ArrowUpRight, IndianRupee,
  Pencil, Trash2, X, ChevronRight, Building2, CreditCard,
  CheckCircle2, Loader2, Search, ArrowLeftRight,
} from 'lucide-react';

type BankAccount = {
  id: string;
  name: string;
  bankName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  openingBalance: number;
  balance: number;
  createdAt: string;
};

type BankTxn = {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  description: string | null;
  source: string | null;
  date: string;
};

type Supplier = { id: string; name: string; balance: number };

const fetcher = (url: string) => api.get(url).then(r => r.data);
const rupee = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const fmtDate = (v: string) => {
  const d = new Date(v);
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}  ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

// ── Add / Edit Account Modal ──────────────────────────────────────────────────
function AccountModal({
  initial, onClose, onSaved,
}: { initial?: BankAccount; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('Bank');
  const [name, setName] = useState(initial?.name || '');
  const [bankName, setBankName] = useState(initial?.bankName || '');
  const [accountNumber, setAccountNumber] = useState(initial?.accountNumber || '');
  const [ifsc, setIfsc] = useState(initial?.ifsc || '');
  const [openingBalance, setOpeningBalance] = useState(initial ? '' : '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { toast.error(t('accountNameRequired')); return; }
    setSaving(true);
    try {
      if (initial) {
        await api.put(`/bank-accounts/${initial.id}`, { name, bankName, accountNumber, ifsc });
      } else {
        await api.post('/bank-accounts', { name, bankName, accountNumber, ifsc, openingBalance });
      }
      toast.success(t('accountSaved'));
      onSaved();
      onClose();
    } catch {
      toast.error(t('failedToSave'));
    } finally { setSaving(false); }
  }

  const inputCls = 'w-full text-sm px-3 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-emerald-500 text-slate-900 dark:text-white';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Landmark size={20} className="text-emerald-600" />
            {initial ? t('editAccount') : t('addAccount')}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X size={20} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('accountName')} *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={t('accountNamePlaceholder')} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('bankName')}</label>
            <input value={bankName} onChange={e => setBankName(e.target.value)} placeholder={t('bankNamePlaceholder')} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('accountNumber')}</label>
              <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder={t('accountNumberPlaceholder')} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('ifsc')}</label>
              <input value={ifsc} onChange={e => setIfsc(e.target.value)} placeholder={t('ifscPlaceholder')} className={inputCls} />
            </div>
          </div>
          {!initial && (
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('openingBalance')} (₹)</label>
              <input type="number" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} placeholder="0" className={inputCls} />
            </div>
          )}
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
          {t('saveAccount')}
        </button>
      </div>
    </div>
  );
}

// ── Add Transaction Modal (Credit / Debit) ────────────────────────────────────
function EntryModal({
  accountId, type, onClose, onSaved,
}: { accountId: string; type: 'credit' | 'debit'; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('Bank');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  async function save() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('Valid amount is required'); return; }
    setSaving(true);
    try {
      await api.post(`/bank-accounts/${accountId}/transactions`, { type, amount: amt, description, date });
      toast.success(t('entryAdded'));
      onSaved();
      onClose();
    } catch {
      toast.error(t('failedToSave'));
    } finally { setSaving(false); }
  }

  const isCredit = type === 'credit';
  const inputCls = 'w-full text-sm px-3 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-emerald-500 text-slate-900 dark:text-white';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className={cn('text-lg font-black flex items-center gap-2', isCredit ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')}>
            {isCredit ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
            {isCredit ? t('creditTitle') : t('debitTitle')}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('amountLabel')} (₹) *</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className={inputCls} autoFocus />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('description')}</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder={t('descriptionPlaceholder')} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('dateLabel')}</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </div>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className={cn('w-full py-3 text-white font-black rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50',
            isCredit ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700')}
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
          {t('addEntry')}
        </button>
      </div>
    </div>
  );
}

// ── Pay Supplier Modal ────────────────────────────────────────────────────────
function PaySupplierModal({
  accountId, onClose, onSaved,
}: { accountId: string; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('Bank');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const { data: suppliers = [] } = useSWR<Supplier[]>(
    activeShopId ? '/suppliers' : null,
    (u: string) => api.get(u).then(r => r.data?.suppliers || r.data || []),
  );
  const [search, setSearch] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = suppliers.filter(s => s.balance > 0 && s.name.toLowerCase().includes(search.toLowerCase()));

  async function pay() {
    if (!selectedSupplier) { toast.error(t('selectSupplier')); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('Valid amount is required'); return; }
    setSaving(true);
    try {
      await api.post(`/bank-accounts/${accountId}/pay-supplier`, {
        supplierId: selectedSupplier.id, amount: amt, note,
      });
      toast.success(t('paymentSuccess'));
      onSaved();
      onClose();
    } catch {
      toast.error(t('failedToSave'));
    } finally { setSaving(false); }
  }

  const inputCls = 'w-full text-sm px-3 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-emerald-500 text-slate-900 dark:text-white';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <ArrowUpRight size={20} className="text-red-600" />
            {t('paySupplierTitle')}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        {/* Supplier search + select */}
        {!selectedSupplier ? (
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">{t('selectSupplier')}</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={t('chooseSupplier')}
                className="w-full text-sm pl-8 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-emerald-500 text-slate-900 dark:text-white" />
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-slate-200 dark:border-slate-700">
              {filtered.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-6">{suppliers.length === 0 ? 'Loading...' : 'No suppliers with outstanding'}</p>
              ) : filtered.map(s => (
                <button key={s.id} onClick={() => { setSelectedSupplier(s); setAmount(String(s.balance)); }}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-left">
                  <span className="font-semibold text-sm text-slate-900 dark:text-white">{s.name}</span>
                  <span className="text-xs font-bold text-red-600">{rupee(s.balance)} due</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-xl px-4 py-3">
              <div>
                <p className="font-bold text-slate-900 dark:text-white text-sm">{selectedSupplier.name}</p>
                <p className="text-xs text-red-600">Due: {rupee(selectedSupplier.balance)}</p>
              </div>
              <button onClick={() => setSelectedSupplier(null)} className="text-slate-400 hover:text-red-500 text-xs underline">Change</button>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('amountLabel')} (₹) *</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className={inputCls} autoFocus />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('noteOptional')}</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Against Invoice #123" className={inputCls} />
            </div>
            <button
              onClick={pay}
              disabled={saving}
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
              {t('confirmPay')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BankPage() {
  const t = useTranslations('Bank');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<'add' | 'edit' | 'credit' | 'debit' | 'pay_supplier' | null>(null);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: accounts = [], mutate: refetchAccounts } = useSWR<BankAccount[]>(
    activeShopId ? `/bank-accounts?_shop=${activeShopId}` : null,
    fetcher,
  );

  const txnUrl = selectedId
    ? `/bank-accounts/${selectedId}/transactions${dateFrom || dateTo ? `?from=${dateFrom}&to=${dateTo}` : ''}`
    : null;

  const { data: txnData, mutate: refetchTxns } = useSWR<{ account: BankAccount; transactions: BankTxn[] }>(
    txnUrl,
    fetcher,
  );

  const refetchAll = useCallback(() => {
    refetchAccounts();
    refetchTxns();
  }, [refetchAccounts, refetchTxns]);

  const selected = accounts.find(a => a.id === selectedId) || txnData?.account || null;
  const txns = txnData?.transactions || [];

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  const totalIn = txns.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
  const totalOut = txns.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);

  const sourceLabel = (source: string | null) => {
    if (!source || source === 'manual') return t('manual');
    if (source === 'opening') return t('opening');
    if (source === 'supplier_payment') return t('supplier_payment');
    return source.replace(/_/g, ' ');
  };

  async function deleteAccount(a: BankAccount) {
    if (!confirm(t('confirmDelete'))) return;
    try {
      await api.delete(`/bank-accounts/${a.id}`);
      toast.success(t('accountDeleted'));
      if (selectedId === a.id) setSelectedId(null);
      refetchAccounts();
    } catch {
      toast.error(t('failedToDelete'));
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
            <Landmark size={26} className="text-emerald-600" />
            {t('title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>
        <button
          onClick={() => setModal('add')}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-black text-sm transition-colors shadow-lg shadow-emerald-600/20"
        >
          <Plus size={18} /> {t('addAccount')}
        </button>
      </div>

      {/* Summary */}
      {accounts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('totalBalance')}</p>
            <p className={cn('text-2xl font-black mt-1', totalBalance >= 0 ? 'text-emerald-600' : 'text-red-600')}>
              {rupee(totalBalance)}
            </p>
          </div>
          {selected && (
            <>
              <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl border border-emerald-200 dark:border-emerald-800/30 p-5">
                <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">{t('totalIn')}</p>
                <p className="text-2xl font-black mt-1 text-emerald-700 dark:text-emerald-400">{rupee(totalIn)}</p>
              </div>
              <div className="bg-red-50 dark:bg-red-900/10 rounded-2xl border border-red-200 dark:border-red-800/30 p-5">
                <p className="text-xs font-bold text-red-600 uppercase tracking-wider">{t('totalOut')}</p>
                <p className="text-2xl font-black mt-1 text-red-700 dark:text-red-400">{rupee(totalOut)}</p>
              </div>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Account List */}
        <div className="space-y-3">
          {accounts.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
              <Landmark size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <p className="font-bold text-slate-500">{t('noAccounts')}</p>
              <p className="text-xs text-slate-400 mt-1">{t('noAccountsHint')}</p>
              <button
                onClick={() => setModal('add')}
                className="mt-4 flex items-center gap-1.5 mx-auto text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-2 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
              >
                <Plus size={14} /> {t('addAccount')}
              </button>
            </div>
          ) : (
            accounts.map(a => (
              <button
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                className={cn(
                  'w-full text-left bg-white dark:bg-slate-900 rounded-2xl border p-4 transition-all hover:shadow-md',
                  selectedId === a.id
                    ? 'border-emerald-500 shadow-md shadow-emerald-500/10'
                    : 'border-slate-200 dark:border-slate-800',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                      selectedId === a.id ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400',
                    )}>
                      <Building2 size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-sm text-slate-900 dark:text-white truncate">{a.name}</p>
                      {a.bankName && <p className="text-xs text-slate-400 truncate">{a.bankName}</p>}
                      {a.accountNumber && (
                        <p className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                          <CreditCard size={10} /> ••••{a.accountNumber.slice(-4)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn('text-base font-black', a.balance >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                      {rupee(a.balance)}
                    </p>
                    <div className="flex gap-1 justify-end mt-1">
                      <button onClick={e => { e.stopPropagation(); setEditingAccount(a); setModal('edit'); }}
                        className="p-1 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors">
                        <Pencil size={12} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); deleteAccount(a); }}
                        className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Transaction View */}
        <div className="lg:col-span-2">
          {!selectedId ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center h-64 flex flex-col items-center justify-center">
              <ArrowLeftRight size={36} className="text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-slate-400 font-semibold">{t('allAccounts')}</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              {/* Account header */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-900 dark:text-white">{selected?.name}</p>
                    <p className={cn('text-xl font-black', (selected?.balance || 0) >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                      {rupee(selected?.balance || 0)}
                    </p>
                  </div>
                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setModal('credit')}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors">
                      <ArrowDownLeft size={14} /> {t('addCredit')}
                    </button>
                    <button onClick={() => setModal('debit')}
                      className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors">
                      <ArrowUpRight size={14} /> {t('addDebit')}
                    </button>
                    <button onClick={() => setModal('pay_supplier')}
                      className="flex items-center gap-1.5 px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl transition-colors">
                      <IndianRupee size={14} /> {t('paySupplier')}
                    </button>
                  </div>
                </div>

                {/* Date filter */}
                <div className="flex gap-2 mt-3">
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500 text-slate-700 dark:text-slate-300" />
                  <span className="text-slate-400 self-center text-xs">—</span>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500 text-slate-700 dark:text-slate-300" />
                </div>
              </div>

              {/* Transaction list */}
              <div className="divide-y divide-slate-100 dark:divide-slate-800/50 max-h-[560px] overflow-y-auto">
                {txns.length === 0 ? (
                  <div className="p-12 text-center">
                    <IndianRupee size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                    <p className="text-slate-400">{t('noTransactions')}</p>
                  </div>
                ) : (
                  txns.map(txn => (
                    <div key={txn.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'w-8 h-8 rounded-xl flex items-center justify-center shrink-0',
                          txn.type === 'credit'
                            ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600'
                            : 'bg-red-100 dark:bg-red-900/20 text-red-600',
                        )}>
                          {txn.type === 'credit' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {txn.description || sourceLabel(txn.source)}
                          </p>
                          <p className="text-[10px] text-slate-400">{fmtDate(txn.date)}</p>
                        </div>
                      </div>
                      <p className={cn('font-black text-sm tabular-nums', txn.type === 'credit' ? 'text-emerald-600' : 'text-red-600')}>
                        {txn.type === 'credit' ? '+' : '−'}{rupee(txn.amount)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {modal === 'add' && (
        <AccountModal onClose={() => setModal(null)} onSaved={refetchAccounts} />
      )}
      {modal === 'edit' && editingAccount && (
        <AccountModal initial={editingAccount} onClose={() => { setModal(null); setEditingAccount(null); }} onSaved={refetchAll} />
      )}
      {modal === 'credit' && selectedId && (
        <EntryModal accountId={selectedId} type="credit" onClose={() => setModal(null)} onSaved={refetchAll} />
      )}
      {modal === 'debit' && selectedId && (
        <EntryModal accountId={selectedId} type="debit" onClose={() => setModal(null)} onSaved={refetchAll} />
      )}
      {modal === 'pay_supplier' && selectedId && (
        <PaySupplierModal accountId={selectedId} onClose={() => setModal(null)} onSaved={refetchAll} />
      )}
    </div>
  );
}
