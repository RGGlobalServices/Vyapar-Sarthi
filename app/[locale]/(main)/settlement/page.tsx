'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Wallet, X, Loader2, CheckCircle2, Search, Pencil, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn, fmtDate } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import toast from 'react-hot-toast';

type Bill = {
  id: string; billNumber: string; date: string | null; dueDate: string | null;
  originalAmount: number; remaining: number;
  supplierId?: string; supplierName?: string;
  entityId?: string; entityName?: string;
};

const fetcher = (u: string) => api.get(u).then(r => r.data);
const rupee = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function SettlementPage() {
  const t = useTranslations('Settlement');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [tab, setTab] = useState<'payable' | 'receivable'>('payable');
  const [search, setSearch] = useState('');
  const [settlingBill, setSettlingBill] = useState<{ bill: Bill; kind: 'payable' | 'receivable' } | null>(null);
  const [editingBill, setEditingBill] = useState<{ bill: Bill; kind: 'payable' | 'receivable' } | null>(null);
  const [deletingBill, setDeletingBill] = useState<{ bill: Bill; kind: 'payable' | 'receivable' } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const { data: payableData, mutate: refetchPayable, isLoading: loadingPayable } = useSWR<{ bills: Bill[] }>(
    activeShopId ? ['/suppliers/pending-bills', activeShopId] : null,
    ([u]) => fetcher(u),
  );
  const { data: receivableData, mutate: refetchReceivable, isLoading: loadingReceivable } = useSWR<{ bills: Bill[] }>(
    activeShopId ? ['/crm/pending-bills?entityType=party', activeShopId] : null,
    ([u]) => fetcher(u),
  );

  const payable = payableData?.bills || [];
  const receivable = receivableData?.bills || [];
  const needle = search.trim().toLowerCase();
  const filteredPayable = needle ? payable.filter(b => (b.supplierName || '').toLowerCase().includes(needle) || (b.billNumber || '').toLowerCase().includes(needle)) : payable;
  const filteredReceivable = needle ? receivable.filter(b => (b.entityName || '').toLowerCase().includes(needle) || (b.billNumber || '').toLowerCase().includes(needle)) : receivable;

  const loading = tab === 'payable' ? loadingPayable : loadingReceivable;
  const rows = tab === 'payable' ? filteredPayable : filteredReceivable;

  const refetchBoth = () => { refetchPayable(); refetchReceivable(); };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map(r => r.id)));
    }
  };

  const handleDelete = async (bill: Bill, kind: 'payable' | 'receivable') => {
    try {
      if (kind === 'payable') {
        await api.delete(`/suppliers/${bill.supplierId}/transactions/${bill.id}`);
      } else {
        await api.delete(`/customers/${bill.entityId}/transactions/${bill.id}`);
      }
      toast.success(t('deleteSuccess'));
      setDeletingBill(null);
      refetchBoth();
    } catch {
      toast.error(t('failedToDelete'));
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    const selectedBills = rows.filter(r => selectedIds.has(r.id));
    let failed = 0;
    await Promise.allSettled(
      selectedBills.map(bill =>
        (tab === 'payable'
          ? api.delete(`/suppliers/${bill.supplierId}/transactions/${bill.id}`)
          : api.delete(`/customers/${bill.entityId}/transactions/${bill.id}`)
        ).catch(() => { failed++; })
      )
    );
    setBulkDeleting(false);
    setSelectedIds(new Set());
    if (failed > 0) {
      toast.error(t('bulkDeleteFailed'));
    } else {
      toast.success(t('bulkDeleteSuccess'));
    }
    refetchBoth();
  };

  const allSelected = rows.length > 0 && selectedIds.size === rows.length;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Wallet size={22} className="text-purple-600" /> {t('title')}
        </h1>
        <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
      </div>

      <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        <button onClick={() => { setTab('payable'); setSelectedIds(new Set()); }} className={cn('px-4 py-2 rounded-lg text-sm font-bold transition-colors', tab === 'payable' ? 'bg-white dark:bg-slate-700 shadow-sm text-rose-600' : 'text-slate-500')}>
          {t('payableTab')} ({payable.length})
        </button>
        <button onClick={() => { setTab('receivable'); setSelectedIds(new Set()); }} className={cn('px-4 py-2 rounded-lg text-sm font-bold transition-colors', tab === 'receivable' ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-600' : 'text-slate-500')}>
          {t('receivableTab')} ({receivable.length})
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('searchPlaceholder')}
          className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl px-4 py-3">
          <span className="text-sm font-bold text-purple-700 dark:text-purple-300">
            {selectedIds.size} {t('selected')}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedIds(new Set())}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-2 py-1 rounded-lg">
              {t('cancel')}
            </button>
            <button onClick={handleBulkDelete} disabled={bulkDeleting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold">
              {bulkDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              {t('deleteSelected')}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <CheckCircle2 size={40} className="mx-auto text-emerald-300 dark:text-emerald-700" />
          <p className="mt-3 text-sm text-slate-500">{t('allSettled')}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          {/* Select-all header */}
          <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
              className="w-4 h-4 rounded accent-purple-600 cursor-pointer" />
            <span className="text-xs text-slate-400 font-medium">{rows.length} bills</span>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((b) => (
              <li key={b.id} className={cn('p-4 flex items-center gap-3 flex-wrap', selectedIds.has(b.id) && 'bg-purple-50/50 dark:bg-purple-900/10')}>
                <input type="checkbox" checked={selectedIds.has(b.id)} onChange={() => toggleSelect(b.id)}
                  className="w-4 h-4 rounded accent-purple-600 cursor-pointer shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900 dark:text-white">{tab === 'payable' ? b.supplierName : b.entityName}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {b.billNumber && `#${b.billNumber} · `}
                    {fmtDate(b.date)}
                    {b.originalAmount !== b.remaining && (
                      <span className="ml-1 text-slate-400">({t('originalAmount')}: {rupee(b.originalAmount)})</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  <span className={cn('text-lg font-black', tab === 'payable' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                    {rupee(b.remaining)}
                  </span>
                  <button
                    onClick={() => setEditingBill({ bill: b, kind: tab })}
                    className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    title={t('edit')}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setDeletingBill({ bill: b, kind: tab })}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title={t('delete')}
                  >
                    <Trash2 size={15} />
                  </button>
                  <button
                    onClick={() => setSettlingBill({ bill: b, kind: tab })}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    {t('settleNow')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {settlingBill && (
        <SettleModal
          bill={settlingBill.bill}
          kind={settlingBill.kind}
          onClose={() => setSettlingBill(null)}
          onSettled={() => { setSettlingBill(null); refetchBoth(); }}
        />
      )}

      {editingBill && (
        <EditModal
          bill={editingBill.bill}
          kind={editingBill.kind}
          onClose={() => setEditingBill(null)}
          onSaved={() => { setEditingBill(null); refetchBoth(); }}
        />
      )}

      {deletingBill && (
        <DeleteConfirmModal
          bill={deletingBill.bill}
          kind={deletingBill.kind}
          onClose={() => setDeletingBill(null)}
          onConfirm={() => handleDelete(deletingBill.bill, deletingBill.kind)}
        />
      )}
    </div>
  );
}

function SettleModal({ bill, kind, onClose, onSettled }: {
  bill: Bill; kind: 'payable' | 'receivable'; onClose: () => void; onSettled: () => void;
}) {
  const t = useTranslations('Settlement');
  const [amount, setAmount] = useState(String(bill.remaining));
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Card'>('Cash');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const name = kind === 'payable' ? bill.supplierName : bill.entityName;
  const entityId = kind === 'payable' ? bill.supplierId : bill.entityId;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/crm/payments', {
        entityType: kind === 'payable' ? 'supplier' : 'party',
        entityId,
        amount: Number(amount),
        paymentMode,
        note: `Settled bill #${bill.billNumber}`,
      });
      onSettled();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('failedToSettle'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-black">{t('settleBillTitle')}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3">
            <p className="font-bold text-slate-900 dark:text-white">{name}</p>
            <p className="text-xs text-slate-500">#{bill.billNumber} · {t('due')}: {rupee(bill.remaining)}</p>
          </div>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('amountToSettle')}</span>
            <input type="number" min="0" step="0.01" max={bill.remaining} autoFocus value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required />
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('paymentMode')}</span>
            <div className="grid grid-cols-3 gap-2">
              {(['Cash', 'UPI', 'Card'] as const).map(m => (
                <button key={m} type="button" onClick={() => setPaymentMode(m)}
                  className={cn('h-9 rounded-lg text-sm font-bold border-2 transition-colors',
                    paymentMode === m ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400' : 'border-slate-200 dark:border-slate-700 text-slate-500')}>
                  {m}
                </button>
              ))}
            </div>
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving || !amount}
            className="w-full h-11 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {t('confirmSettle')}
          </button>
        </form>
      </div>
    </div>
  );
}

function EditModal({ bill, kind, onClose, onSaved }: {
  bill: Bill; kind: 'payable' | 'receivable'; onClose: () => void; onSaved: () => void;
}) {
  const t = useTranslations('Settlement');
  const [amount, setAmount] = useState(String(bill.originalAmount));
  const [billNumber, setBillNumber] = useState(bill.billNumber || '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const name = kind === 'payable' ? bill.supplierName : bill.entityName;
  const entityId = kind === 'payable' ? bill.supplierId : bill.entityId;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      if (kind === 'payable') {
        await api.patch(`/suppliers/${entityId}/transactions/${bill.id}`, {
          amount: Number(amount),
          billNumber: billNumber || undefined,
          note: note || undefined,
        });
      } else {
        await api.patch(`/customers/${entityId}/transactions/${bill.id}`, {
          amount: Number(amount),
          bill_number: billNumber || undefined,
          note: note || undefined,
        });
      }
      toast.success(t('editSuccess'));
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('failedToEdit'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-black">{t('editBillTitle')}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3">
            <p className="font-bold text-slate-900 dark:text-white">{name}</p>
          </div>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('billAmount')}</span>
            <input type="number" min="0" step="0.01" autoFocus value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required />
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('billNumberLabel')}</span>
            <input type="text" value={billNumber} onChange={e => setBillNumber(e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('billNote')}</span>
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving || !amount}
            className="w-full h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {saving ? t('saving') : t('saveChanges')}
          </button>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ bill, kind, onClose, onConfirm }: {
  bill: Bill; kind: 'payable' | 'receivable'; onClose: () => void; onConfirm: () => void;
}) {
  const t = useTranslations('Settlement');
  const [deleting, setDeleting] = useState(false);
  const name = kind === 'payable' ? bill.supplierName : bill.entityName;

  const handleConfirm = async () => {
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-black text-red-600">{t('delete')}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3">
            <p className="font-bold text-slate-900 dark:text-white">{name}</p>
            <p className="text-xs text-slate-500">#{bill.billNumber} · {rupee(bill.originalAmount)}</p>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">{t('bulkDeleteConfirm', { count: 1 })}</p>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 h-10 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
              {t('cancel')}
            </button>
            <button onClick={handleConfirm} disabled={deleting}
              className="flex-1 h-10 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2">
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {t('delete')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
