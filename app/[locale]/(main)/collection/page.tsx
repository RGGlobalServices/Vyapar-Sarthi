'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import {
  Plus, Search, X, Loader2, ArrowLeft, Trash2, Pencil, Check, HandCoins,
} from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';

const fetcher = (url: string) => api.get(url, { cache: 'no-store' }).then(res => res.data);

const PAYMENT_MODE_KEYS: Record<string, string> = {
  Cash: 'cashMode',
  UPI: 'upiMode',
  Card: 'cardMode',
  'Bank Transfer': 'bankTransferMode',
  Cheque: 'chequeMode',
};
const PAYMENT_MODES = Object.keys(PAYMENT_MODE_KEYS);

type CollectionSummary = {
  id: string;
  name: string;
  date: string;
  status: 'draft' | 'finalized';
  finalizedAt: string | null;
  createdAt: string;
  entryCount: number;
  totalAmount: number;
};

type Party = { id: string; name: string; mobile?: string | null; totalDue: number };

type CollectionEntry = {
  id: string;
  customerId: string;
  amount: number;
  paymentMode: string;
  note: string | null;
  customerTransactionId: string | null;
  customer: Party;
};

type CollectionDetail = CollectionSummary & { entries: CollectionEntry[] };

function money(n: number) {
  return `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
}

function dayOf(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', { weekday: 'long' }).toUpperCase();
}

function dateLabel(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function toDateInputValue(dateStr: string) {
  return new Date(dateStr).toISOString().slice(0, 10);
}

/** Small confirm dialog reused for every destructive/consequential action on
 *  this page (delete sheet, delete entry, finalize) instead of three
 *  near-identical modals. */
function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel, danger, loading }: {
  title: string; body: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void; danger?: boolean; loading?: boolean;
}) {
  const t = useTranslations('Collection');
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-4">
        <p className="font-black text-slate-900 dark:text-white">{title}</p>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-snug">{body}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} disabled={loading} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors">
            {t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-60 flex items-center gap-1.5 transition-colors ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CollectionPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  return openId
    ? <CollectionSheetEditor id={openId} onBack={() => setOpenId(null)} />
    : <CollectionListView onOpen={setOpenId} />;
}

/* ─── List view ──────────────────────────────────────────────────────────── */

function CollectionListView({ onOpen }: { onOpen: (id: string) => void }) {
  const t = useTranslations('Collection');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [search, setSearch] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [status, setStatus] = useState<'all' | 'draft' | 'finalized'>('all');
  const [deleting, setDeleting] = useState<CollectionSummary | null>(null);
  const [creating, setCreating] = useState(false);

  const { data = [], mutate, isLoading } = useSWR<CollectionSummary[]>(
    activeShopId ? `/collections?_shop=${activeShopId}` : null,
    fetcher
  );
  const sheets = Array.isArray(data) ? data : [];

  const filtered = sheets.filter(s => {
    if (status !== 'all' && s.status !== status) return false;
    if (search.trim() && !s.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (range.from && new Date(s.date).getTime() < new Date(range.from).getTime()) return false;
    if (range.to) {
      const to = new Date(range.to);
      to.setHours(23, 59, 59, 999);
      if (new Date(s.date).getTime() > to.getTime()) return false;
    }
    return true;
  });

  const handleAdd = async () => {
    setCreating(true);
    try {
      const name = `Collection - ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
      const res = await api.post('/collections', { name, date: new Date().toISOString() });
      await mutate();
      onOpen(res.data.id);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to create collection');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await api.delete(`/collections/${deleting.id}`);
      toast.success(t('deleted'));
      await mutate();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to delete collection');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <HandCoins className="text-emerald-500" size={28} /> {t('title')}
          </h1>
          <p className="text-slate-500 text-sm font-medium">{t('subtitle')}</p>
        </div>
        <button
          onClick={handleAdd}
          disabled={creating}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors"
        >
          {creating ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />} {t('addCollection')}
        </button>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        {(['all', 'draft', 'finalized'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              status === s ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {s === 'all' ? t('statusAll') : s === 'draft' ? t('statusDraft') : t('statusFinalized')}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 shrink-0">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('fromDate')}</span>
            <input type="date" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
              className="text-xs bg-transparent outline-none text-slate-700 dark:text-slate-200 w-[110px]" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('toDate')}</span>
            <input type="date" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
              className="text-xs bg-transparent outline-none text-slate-700 dark:text-slate-200 w-[110px]" />
            {(range.from || range.to) && (
              <button type="button" onClick={() => setRange({ from: '', to: '' })} className="text-slate-400 hover:text-red-500 transition-colors" title={t('clearDateFilter')}>
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-12">{t('noCollectionsFound')}</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(s => (
              <div
                key={s.id}
                onClick={() => onOpen(s.id)}
                className="flex items-center justify-between gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 cursor-pointer transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-slate-900 dark:text-white truncate">{s.name}</p>
                    <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${
                      s.status === 'finalized'
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                        : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                    }`}>
                      {s.status === 'finalized' ? t('finalized') : t('draft')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {dateLabel(s.date)} · {dayOf(s.date)} · {t('partiesCount', { count: s.entryCount })}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <p className="font-black text-emerald-600 dark:text-emerald-400">{money(s.totalAmount)}</p>
                  <button
                    onClick={e => { e.stopPropagation(); setDeleting(s); }}
                    className="text-slate-400 hover:text-red-500 p-1.5 transition-colors"
                    title={t('delete')}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {deleting && (
        <ConfirmDialog
          title={t('delete')}
          body={t('deleteCollectionConfirm', { name: deleting.name })}
          confirmLabel={t('delete')}
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

/* ─── Sheet editor ───────────────────────────────────────────────────────── */

function CollectionSheetEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const t = useTranslations('Collection');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const shopName = useBusinessStore(s => s.profile.shopName);

  const { data: sheet, mutate, isLoading } = useSWR<CollectionDetail>(
    activeShopId ? `/collections/${id}?_shop=${activeShopId}` : null,
    fetcher
  );
  const { data: partiesData } = useSWR<Party[]>(
    activeShopId ? `/crm/customers?type=party&_shop=${activeShopId}` : null,
    fetcher
  );
  const parties = Array.isArray(partiesData) ? partiesData : [];

  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState<CollectionEntry | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  const saveName = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === sheet?.name) { setNameDraft(null); return; }
    try {
      await api.patch(`/collections/${id}`, { name: trimmed });
      await mutate();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to rename');
    } finally {
      setNameDraft(null);
    }
  };

  const saveDate = async (date: string) => {
    try {
      await api.patch(`/collections/${id}`, { date });
      await mutate();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to update date');
    }
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    try {
      await api.post(`/collections/${id}/finalize`, {});
      await mutate();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to finalize');
    } finally {
      setFinalizing(false);
      setConfirmFinalize(false);
    }
  };

  const handleDeleteEntry = async () => {
    if (!deletingEntry) return;
    try {
      await api.delete(`/collections/${id}/entries/${deletingEntry.id}`);
      toast.success(t('entryDeleted'));
      await mutate();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to remove entry');
    } finally {
      setDeletingEntry(null);
    }
  };

  const total = useMemo(() => (sheet?.entries || []).reduce((s, e) => s + e.amount, 0), [sheet]);

  if (isLoading || !sheet) {
    return (
      <div className="flex justify-center p-24">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-3xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
        <ArrowLeft size={16} /> {t('backToCollections')}
      </button>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{shopName}</p>
            {nameDraft !== null ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                onBlur={() => saveName(nameDraft)}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                className="text-xl font-black text-slate-900 dark:text-white bg-transparent border-b-2 border-indigo-500 outline-none"
              />
            ) : (
              <h2
                onClick={() => sheet.status !== 'finalized' && setNameDraft(sheet.name)}
                className={`text-xl font-black text-slate-900 dark:text-white ${sheet.status !== 'finalized' ? 'cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400' : ''}`}
              >
                {sheet.name}
              </h2>
            )}
          </div>
          <span className={`text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full shrink-0 ${
            sheet.status === 'finalized'
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
              : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
          }`}>
            {sheet.status === 'finalized' ? t('finalized') : t('draft')}
          </span>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('dateLabel')}</label>
            <input
              type="date"
              value={toDateInputValue(sheet.date)}
              onChange={e => saveDate(e.target.value)}
              className="text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">&nbsp;</span>
            <span className="text-sm font-black text-indigo-600 dark:text-indigo-400 tracking-wide">{dayOf(sheet.date)}</span>
          </div>
        </div>
      </div>

      <EntriesTable
        sheet={sheet}
        parties={parties}
        onSaved={mutate}
        editingEntryId={editingEntryId}
        setEditingEntryId={setEditingEntryId}
        onRequestDelete={setDeletingEntry}
      />

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 flex items-center justify-between">
        <p className="font-black text-slate-700 dark:text-slate-300">{t('runningTotal')}</p>
        <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{money(total)}</p>
      </div>

      {sheet.status !== 'finalized' && (
        <button
          onClick={() => setConfirmFinalize(true)}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-black flex items-center justify-center gap-2 transition-colors"
        >
          <Check size={18} /> {t('finalize')}
        </button>
      )}

      {confirmFinalize && (
        <ConfirmDialog
          title={t('finalize')}
          body={t('finalizeConfirm')}
          confirmLabel={t('finalize')}
          loading={finalizing}
          onConfirm={handleFinalize}
          onCancel={() => setConfirmFinalize(false)}
        />
      )}
      {deletingEntry && (
        <ConfirmDialog
          title={t('delete')}
          body={t('deleteEntryConfirm', { name: deletingEntry.customer.name })}
          confirmLabel={t('delete')}
          danger
          onConfirm={handleDeleteEntry}
          onCancel={() => setDeletingEntry(null)}
        />
      )}
    </div>
  );
}

/* ─── Party rows: existing entries + the add-row form ───────────────────── */

function EntriesTable({ sheet, parties, onSaved, editingEntryId, setEditingEntryId, onRequestDelete }: {
  sheet: CollectionDetail;
  parties: Party[];
  onSaved: () => void;
  editingEntryId: string | null;
  setEditingEntryId: (id: string | null) => void;
  onRequestDelete: (entry: CollectionEntry) => void;
}) {
  const t = useTranslations('Collection');
  const tPay = useTranslations('PaymentCollectionModal');

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 space-y-3">
      {sheet.entries.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-6">{t('noEntriesYet')}</p>
      ) : (
        sheet.entries.map(entry =>
          editingEntryId === entry.id ? (
            <EntryRowForm
              key={entry.id}
              sheetId={sheet.id}
              entry={entry}
              party={entry.customer}
              onDone={() => { setEditingEntryId(null); onSaved(); }}
              onCancel={() => setEditingEntryId(null)}
            />
          ) : (
            <div key={entry.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="min-w-0">
                <p className="font-bold text-slate-900 dark:text-white truncate">{entry.customer.name}</p>
                <p className="text-xs text-slate-500">{tPay(PAYMENT_MODE_KEYS[entry.paymentMode] || 'cashMode')}{entry.note ? ` · ${entry.note}` : ''}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <p className="font-black text-slate-900 dark:text-white">{money(entry.amount)}</p>
                <button onClick={() => setEditingEntryId(entry.id)} className="text-slate-400 hover:text-indigo-500 p-1.5 transition-colors" title={t('edit')}>
                  <Pencil size={15} />
                </button>
                <button onClick={() => onRequestDelete(entry)} className="text-slate-400 hover:text-red-500 p-1.5 transition-colors" title={t('delete')}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          )
        )
      )}

      <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
        <EntryRowForm sheetId={sheet.id} parties={parties} onDone={onSaved} />
      </div>
    </div>
  );
}

/** One row's inputs — doubles as the "add a new party" form (no `entry`
 *  prop) and the inline editor for an existing row (`entry` + `party`
 *  provided, party fixed). */
function EntryRowForm({ sheetId, entry, party, parties, onDone, onCancel }: {
  sheetId: string;
  entry?: CollectionEntry;
  party?: Party;
  parties?: Party[];
  onDone: () => void;
  onCancel?: () => void;
}) {
  const t = useTranslations('Collection');
  const tPay = useTranslations('PaymentCollectionModal');
  const isEdit = !!entry;

  const [customerId, setCustomerId] = useState(entry?.customerId || '');
  const [partyQuery, setPartyQuery] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '');
  const [paymentMode, setPaymentMode] = useState(entry?.paymentMode || 'Cash');
  const [note, setNote] = useState(entry?.note || '');
  const [saving, setSaving] = useState(false);

  const selectedParty = isEdit ? party : parties?.find(p => p.id === customerId);
  const matches = (parties || []).filter(p =>
    !partyQuery.trim() || p.name.toLowerCase().includes(partyQuery.trim().toLowerCase())
  ).slice(0, 8);

  const pickParty = (p: Party) => {
    setCustomerId(p.id);
    setShowPicker(false);
    setPartyQuery('');
    if (!amount) setAmount(String(Math.max(0, p.totalDue || 0)));
  };

  const handleSave = async () => {
    const amt = Number(amount);
    if (!isEdit && !customerId) { toast.error(t('partyRequired')); return; }
    if (!amt || amt <= 0) { toast.error(t('amountRequired')); return; }

    setSaving(true);
    try {
      if (isEdit) {
        await api.patch(`/collections/${sheetId}/entries/${entry!.id}`, { amount: amt, paymentMode, note: note.trim() || undefined });
        toast.success(t('entryUpdated'));
      } else {
        await api.post(`/collections/${sheetId}/entries`, { customerId, amount: amt, paymentMode, note: note.trim() || undefined });
        toast.success(t('entrySaved'));
        setCustomerId('');
        setAmount('');
        setNote('');
        setPaymentMode('Cash');
      }
      onDone();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-700">
      {isEdit && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">{t('editEntryNote', { name: party!.name })}</p>
      )}

      <div className="flex flex-wrap gap-2 items-end">
        {!isEdit && (
          <div className="relative flex-1 min-w-[160px]">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('partyLabel')}</label>
            {selectedParty ? (
              <button
                type="button"
                onClick={() => { setCustomerId(''); setShowPicker(true); }}
                className="w-full text-left text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5"
              >
                {selectedParty.name}
              </button>
            ) : (
              <input
                value={partyQuery}
                onChange={e => { setPartyQuery(e.target.value); setShowPicker(true); }}
                onFocus={() => setShowPicker(true)}
                onBlur={() => setTimeout(() => setShowPicker(false), 150)}
                placeholder={t('selectPartyPlaceholder')}
                className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            )}
            {showPicker && !selectedParty && (
              <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg">
                {matches.length === 0 ? (
                  <p className="text-xs text-slate-500 p-2.5">{t('noPartiesAvailable')}</p>
                ) : (
                  matches.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pickParty(p)}
                      className="w-full text-left px-2.5 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="text-[10px] text-slate-500 shrink-0">{t('dueLabel')} {money(p.totalDue || 0)}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        <div className="w-28">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('amountLabel')}</label>
          <input
            type="number"
            min={0}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="w-36">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('paymentMethodLabel')}</label>
          <select
            value={paymentMode}
            onChange={e => setPaymentMode(e.target.value)}
            className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {PAYMENT_MODES.map(m => <option key={m} value={m}>{tPay(PAYMENT_MODE_KEYS[m])}</option>)}
          </select>
        </div>

        <div className="flex-1 min-w-[140px]">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('noteLabel')}</label>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={t('notePlaceholder')}
            className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isEdit && (
            <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-sm font-bold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              {t('cancel')}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-1.5 transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : isEdit ? <Check size={14} /> : <Plus size={14} />}
            {isEdit ? t('save') : t('addPartyRow')}
          </button>
        </div>
      </div>
    </div>
  );
}
