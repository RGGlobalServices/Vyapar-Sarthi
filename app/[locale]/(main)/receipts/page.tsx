'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { Plus, X, Loader2, ArrowDownToLine, Search, Download, Trash2, CheckSquare, Square, Users, List, ChevronDown, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn, fmtDate } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import { downloadReceiptSlip, downloadAllReceiptSlips } from '@/lib/pdf/slipGenerator';

type ReceiptRow = {
  id: string; entityId: string; entityName: string; entityMobile: string;
  billNumber: string; note: string; amount: number; date: string;
};
type Party = { id: string; name: string; mobile?: string | null; totalDue?: number | null };

const fetcher = (u: string) => api.get(u).then(r => r.data);
const rupee = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function ReceiptsPage() {
  const t = useTranslations('Receipts');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const profile = useBusinessStore(s => s.profile);
  const [search, setSearch] = useState('');
  const [recording, setRecording] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'profile'>('list');
  const [expandedProfiles, setExpandedProfiles] = useState<Set<string>>(new Set());

  const shopInfo = {
    name: profile.shopName || 'Vyapar Sarthi',
    address: profile.address,
    mobile: profile.mobile,
    gst: profile.gst,
  };

  const { data, mutate: refetch, isLoading } = useSWR<{ payments: ReceiptRow[]; summary: { totalPaid: number; paymentCount: number } }>(
    activeShopId ? ['/crm/payments-all?entityType=party', activeShopId] : null,
    ([u]) => fetcher(u),
  );
  const { data: parties = [] } = useSWR<Party[]>(
    activeShopId ? ['/crm/customers?type=party', activeShopId] : null,
    ([u]) => fetcher(u),
  );

  const rows = data?.payments || [];
  const needle = search.trim().toLowerCase();
  const filtered = needle
    ? rows.filter(r => r.entityName.toLowerCase().includes(needle) || (r.billNumber || '').toLowerCase().includes(needle))
    : rows;

  // Group by party for profile view
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; mobile: string; receipts: ReceiptRow[]; total: number }>();
    for (const r of filtered) {
      const key = r.entityId;
      if (!map.has(key)) map.set(key, { name: r.entityName, mobile: r.entityMobile, receipts: [], total: 0 });
      const g = map.get(key)!;
      g.receipts.push(r);
      g.total += r.amount;
    }
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v }));
  }, [filtered]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(r => r.id)));
  };

  const toggleProfileExpand = (id: string) => {
    setExpandedProfiles(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const handleDownload = async (r: ReceiptRow) => {
    setDownloadingId(r.id);
    try {
      await downloadReceiptSlip({
        receipt: { id: r.id, billNumber: r.billNumber, date: r.date, amount: r.amount, note: r.note },
        party: { name: r.entityName, mobile: r.entityMobile },
        shopInfo,
      });
    } catch {
      toast.error(t('downloadFailed') || 'Failed to generate receipt');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadAll = async (receipts: ReceiptRow[]) => {
    try {
      await downloadAllReceiptSlips(receipts.map(r => ({
        receipt: { id: r.id, billNumber: r.billNumber, date: r.date, amount: r.amount, note: r.note },
        party: { name: r.entityName, mobile: r.entityMobile },
        shopInfo,
      })));
      toast.success(t('downloadedAll') || `Downloaded ${receipts.length} receipts`);
    } catch {
      toast.error(t('downloadFailed') || 'Failed to generate receipts');
    }
  };

  const handleDelete = async (r: ReceiptRow) => {
    if (!confirm(t('confirmDelete') || `Delete receipt of ${rupee(r.amount)} from ${r.entityName}?`)) return;
    setDeletingId(r.id);
    try {
      await api.delete(`/customers/${r.entityId}/transactions/${r.id}`);
      toast.success(t('deleted') || 'Receipt deleted');
      refetch();
      setSelected(prev => { const s = new Set(prev); s.delete(r.id); return s; });
    } catch {
      toast.error(t('deleteFailed') || 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkDelete = async () => {
    const toDelete = filtered.filter(r => selected.has(r.id));
    if (!toDelete.length) return;
    if (!confirm(t('confirmBulkDelete') || `Delete ${toDelete.length} selected receipts?`)) return;
    setBulkDeleting(true);
    let failed = 0;
    for (const r of toDelete) {
      try {
        await api.delete(`/customers/${r.entityId}/transactions/${r.id}`);
      } catch {
        failed++;
      }
    }
    setBulkDeleting(false);
    setSelected(new Set());
    refetch();
    if (failed > 0) toast.error(`${failed} receipts failed to delete`);
    else toast.success(t('bulkDeleted') || `${toDelete.length} receipts deleted`);
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ArrowDownToLine size={22} className="text-emerald-600" /> {t('title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleDownloadAll(filtered)}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            <Download size={15} /> {t('downloadAll') || 'Download All'}
          </button>
          <button onClick={() => setRecording(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors">
            <Plus size={18} /> {t('recordReceipt')}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] text-slate-500">{t('totalReceivedLabel')}</p>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{rupee(data?.summary?.totalPaid || 0)}</p>
        </div>
        <p className="text-sm text-slate-400">{rows.length} {t('receiptsCount') || 'receipts'}</p>
      </div>

      {/* Search + view toggle */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <button
          onClick={() => setViewMode(v => v === 'list' ? 'profile' : 'list')}
          className={cn('flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors',
            viewMode === 'profile'
              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
              : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800')}
        >
          {viewMode === 'profile' ? <Users size={15} /> : <List size={15} />}
          {viewMode === 'profile' ? (t('profileView') || 'Profile') : (t('listView') || 'List')}
        </button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-2.5">
          <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
            {selected.size} {t('selected') || 'selected'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => handleDownloadAll(filtered.filter(r => selected.has(r.id)))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-colors"
            >
              <Download size={13} /> {t('downloadSelected') || 'Download'}
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              {bulkDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              {t('deleteSelected') || 'Delete'}
            </button>
            <button onClick={() => setSelected(new Set())} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <ArrowDownToLine size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm text-slate-500">{t('noReceipts')}</p>
        </div>
      ) : viewMode === 'list' ? (
        /* ── List view ── */
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          {/* Select-all header */}
          <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <button onClick={toggleAll} className="text-slate-400 hover:text-emerald-600 transition-colors">
              {selected.size === filtered.length && filtered.length > 0
                ? <CheckSquare size={16} className="text-emerald-600" />
                : <Square size={16} />}
            </button>
            <span className="text-xs text-slate-500 font-semibold">{filtered.length} {t('receiptsCount') || 'receipts'}</span>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((r) => (
              <li key={r.id} className={cn('flex items-center gap-3 px-4 py-3.5 transition-colors', selected.has(r.id) ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : '')}>
                <button onClick={() => toggleSelect(r.id)} className="shrink-0 text-slate-300 hover:text-emerald-500 transition-colors">
                  {selected.has(r.id) ? <CheckSquare size={16} className="text-emerald-500" /> : <Square size={16} />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900 dark:text-white text-sm">{r.entityName}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {fmtDate(r.date)}
                    {r.note && ` · ${r.note}`}
                    {r.billNumber && ` · ${r.billNumber}`}
                  </p>
                </div>
                <span className="text-base font-black text-emerald-600 dark:text-emerald-400 shrink-0">+{rupee(r.amount)}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    disabled={downloadingId === r.id}
                    onClick={() => handleDownload(r)}
                    title={t('downloadReceipt') || 'Download Receipt'}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-40 transition-colors"
                  >
                    {downloadingId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  </button>
                  <button
                    disabled={deletingId === r.id}
                    onClick={() => handleDelete(r)}
                    title={t('deleteReceipt') || 'Delete'}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40 transition-colors"
                  >
                    {deletingId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        /* ── Profile / grouped view ── */
        <div className="space-y-3">
          {grouped.map(g => (
            <div key={g.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              {/* Party header */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleProfileExpand(g.id)}
                onKeyDown={e => e.key === 'Enter' && toggleProfileExpand(g.id)}
                className="w-full flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors select-none"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                    <span className="text-xs font-black text-emerald-700 dark:text-emerald-400">{g.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="font-bold text-slate-900 dark:text-white text-sm truncate">{g.name}</p>
                    <p className="text-xs text-slate-500">{g.receipts.length} {t('receiptsCount') || 'receipts'}{g.mobile ? ` · ${g.mobile}` : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-base font-black text-emerald-600 dark:text-emerald-400">+{rupee(g.total)}</span>
                  <button
                    onClick={e => { e.stopPropagation(); handleDownloadAll(g.receipts); }}
                    title={t('downloadAllProfile') || `Download all receipts for ${g.name}`}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  >
                    <Download size={14} />
                  </button>
                  {expandedProfiles.has(g.id) ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                </div>
              </div>

              {/* Receipts for this party */}
              {expandedProfiles.has(g.id) && (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
                  {g.receipts.map(r => (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-slate-500">
                          {fmtDate(r.date)}
                          {r.note && ` · ${r.note}`}
                          {r.billNumber && ` · ${r.billNumber}`}
                        </p>
                      </div>
                      <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 shrink-0">+{rupee(r.amount)}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          disabled={downloadingId === r.id}
                          onClick={() => handleDownload(r)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-40 transition-colors"
                        >
                          {downloadingId === r.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                        </button>
                        <button
                          disabled={deletingId === r.id}
                          onClick={() => handleDelete(r)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40 transition-colors"
                        >
                          {deletingId === r.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {recording && (
        <RecordReceiptModal
          parties={parties}
          onClose={() => setRecording(false)}
          onRecorded={() => { setRecording(false); refetch(); }}
        />
      )}
    </div>
  );
}

function RecordReceiptModal({ parties, onClose, onRecorded }: {
  parties: Party[]; onClose: () => void; onRecorded: () => void;
}) {
  const t = useTranslations('Receipts');
  const [form, setForm] = useState({ partyId: '', amount: '', paymentMode: 'Cash', note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selectedParty = parties.find(p => p.id === form.partyId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/crm/payments', {
        entityType: 'party', entityId: form.partyId,
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
          <h2 className="text-lg font-black">{t('recordReceipt')}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('party')} *</span>
            <select value={form.partyId} onChange={e => setForm(f => ({ ...f, partyId: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required>
              <option value="">{t('selectParty')}</option>
              {parties.map(p => <option key={p.id} value={p.id}>{p.name}{p.totalDue ? ` — ${rupee(p.totalDue)} due` : ''}</option>)}
            </select>
          </label>
          {selectedParty?.totalDue != null && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">{t('currentDue')}: {rupee(selectedParty.totalDue)}</p>
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
          <button type="submit" disabled={saving || !form.partyId || !form.amount}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {t('recordReceipt')}
          </button>
        </form>
      </div>
    </div>
  );
}
