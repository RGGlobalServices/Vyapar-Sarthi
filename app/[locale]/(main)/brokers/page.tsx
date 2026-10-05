'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, X, Loader2, Handshake, IndianRupee, FileText, TrendingUp, Pencil, Trash2, CheckSquare, Square, AlertCircle, Phone, User } from 'lucide-react';
import { useExport } from '@/lib/hooks/useExport';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { toast } from 'react-hot-toast';
import DeleteButton from '@/components/mill/DeleteButton';
import EditEntryModal, { EditButton } from '@/components/mill/EditEntryModal';
import { ExportButton } from '@/lib/hooks/useExport';

type Broker = { id: string; name: string; mobile: string | null; balance: number; entryCount: number };
type CommissionRow = { id: string; brokerId: string; type: 'charge' | 'payment'; amount: number; billNumber: string | null; paymentMethod: string | null; note: string | null; date: string; direction?: 'purchase' | 'sale' | null; billLabel?: string | null };

const fetcher = (u: string) => api.get(u).then(r => r.data);
const rupee = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const fmtNote = (v: any): string => {
  if (!v) return '';
  // Reformat legacy auto-notes: "[Customer broker] Sale INV-123 — Party" → "Sale commission · Party · Bill #INV-123"
  const m = String(v).match(/^\[(Customer|Supplier) broker\] (Sale|Purchase) (\S+)(?:\s+—\s+(.+))?$/);
  if (m) {
    const [, , dir, bill, party] = m;
    return `${dir} commission${party ? ` · ${party}` : ''}${bill ? ` · Bill #${bill}` : ''}`;
  }
  return String(v);
};

const fmtDate = (v: string) => {
  const ist = new Date(new Date(v).getTime() + 5.5 * 60 * 60 * 1000);
  const dd = String(ist.getUTCDate()).padStart(2, '0');
  const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = ist.getUTCFullYear();
  const hh = String(ist.getUTCHours()).padStart(2, '0');
  const min = String(ist.getUTCMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy}  ${hh}:${min}`;
};

const STATEMENT_COLUMNS = [
  { key: 'date', label: 'Date & Time', format: fmtDate },
  { key: 'type', label: 'Type', format: (v: string) => v === 'charge' ? 'Commission Earned' : 'Payment Made' },
  { key: 'direction', label: 'For', format: (v: any) => v === 'purchase' ? 'Purchase' : v === 'sale' ? 'Sale' : '—' },
  { key: 'billNumber', label: 'Bill #', format: (v: any) => v || '—' },
  { key: 'amount', label: 'Amount (₹)', format: (v: number) => v.toLocaleString('en-IN') },
  { key: 'paymentMethod', label: 'Mode', format: (v: any) => v || '—' },
  { key: 'note', label: 'Note', format: fmtNote },
];

export default function BrokersPage() {
  const t = useTranslations('Brokers');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const { exportToPDF } = useExport();
  const { profile } = useBusinessStore();
  const [selectedBrokerId, setSelectedBrokerId] = useState<string | null>(null);
  const [entryModal, setEntryModal] = useState<{ brokerId: string; type: 'charge' | 'payment' } | null>(null);
  const [showAddBroker, setShowAddBroker] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dirFilter, setDirFilter] = useState<'all' | 'purchase' | 'sale'>('all');
  const [editing, setEditing] = useState<CommissionRow | null>(null);
  const [viewingBroker, setViewingBroker] = useState<Broker | null>(null);
  const [editingBroker, setEditingBroker] = useState<Broker | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingBulk, setDeletingBulk] = useState(false);

  const { data, mutate: refetch, isLoading } = useSWR<{ brokers: Broker[]; entries: CommissionRow[] }>(
    activeShopId ? ['/management/commission', activeShopId] : null,
    ([u]) => fetcher(u),
  );

  const brokers = data?.brokers || [];
  const entries = data?.entries || [];
  const totalOwed = brokers.reduce((s, b) => s + Math.max(0, b.balance), 0);
  const chargeSum = (d: 'purchase' | 'sale') => entries.filter(e => e.type === 'charge' && e.direction === d).reduce((a, e) => a + e.amount, 0);
  const selectedBroker = brokers.find(b => b.id === selectedBrokerId);

  const downloadBrokerStatement = async (b: Broker) => {
    const brokerEntries = entries.filter(e => e.brokerId === b.id);
    const orderCount = brokerEntries.filter(e => e.type === 'charge').length;
    const paid = brokerEntries.filter(e => e.type === 'payment').reduce((a, e) => a + e.amount, 0);
    await exportToPDF({
      title: `Commission Statement — ${b.name}`,
      filename: `broker-statement-${b.name.replace(/\s+/g, '-').toLowerCase()}`,
      columns: STATEMENT_COLUMNS,
      data: brokerEntries,
      summary: [
        { label: 'Broker', value: b.name },
        ...(b.mobile ? [{ label: 'Mobile', value: b.mobile }] : []),
        { label: 'Total Orders/Deals', value: String(orderCount) },
        { label: 'Total Commission Earned', value: `₹${brokerEntries.filter(e => e.type === 'charge').reduce((a, e) => a + e.amount, 0).toLocaleString('en-IN')}` },
        { label: 'Total Paid', value: `₹${paid.toLocaleString('en-IN')}` },
        { label: 'Pending Balance', value: `₹${Math.max(0, b.balance).toLocaleString('en-IN')}` },
      ],
    });
  };

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleBulkDelete = async () => {
    const toDelete = brokers.filter(b => selectedIds.has(b.id));
    const withBalance = toDelete.filter(b => b.balance > 0);
    if (withBalance.length > 0) {
      toast.error(t('bulkDeleteBlocked', { names: withBalance.map(b => b.name).join(', ') }));
      return;
    }
    setDeletingBulk(true);
    try {
      await Promise.all(toDelete.map(b => api.delete(`/crm/customers/${b.id}`)));
      toast.success(t('bulkDeletedSuccess', { count: toDelete.length }));
      setSelectedIds(new Set());
      setSelectionMode(false);
      refetch();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('deleteFailed'));
    } finally { setDeletingBulk(false); }
  };

  const filteredEntries = entries
    .filter(e => !selectedBrokerId || e.brokerId === selectedBrokerId)
    .filter(e => dirFilter === 'all' || e.direction === dirFilter)
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
              { key: 'date', label: 'Date & Time', format: fmtDate },
              { key: 'brokerName', label: 'Broker' },
              { key: 'type', label: 'Type', format: (v: string) => v === 'charge' ? 'Charge' : 'Payment' },
              { key: 'billNumber', label: 'Bill #', format: (v: any) => v || '—' },
              { key: 'amount', label: 'Amount (₹)', format: (v: number) => v.toLocaleString('en-IN') },
              { key: 'paymentMethod', label: 'Mode', format: (v: any) => v || '—' },
              { key: 'note', label: 'Note', format: fmtNote },
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

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-sky-200 dark:border-sky-900/40 bg-white dark:bg-slate-900 p-4">
          <p className="text-[11px] text-sky-600 font-bold uppercase">Purchase commission</p>
          <p className="text-xl font-black text-slate-900 dark:text-white">{rupee(chargeSum('purchase'))}</p>
        </div>
        <div className="rounded-xl border border-violet-200 dark:border-violet-900/40 bg-white dark:bg-slate-900 p-4">
          <p className="text-[11px] text-violet-600 font-bold uppercase">Sale commission</p>
          <p className="text-xl font-black text-slate-900 dark:text-white">{rupee(chargeSum('sale'))}</p>
        </div>
      </div>

      {/* Multi-select toolbar */}
      {brokers.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setSelectionMode(s => !s); setSelectedIds(new Set()); }}
            className={cn('text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors', selectionMode ? 'bg-rose-600 text-white border-rose-600' : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300')}
          >
            {selectionMode ? t('cancelSelect') : t('selectMode')}
          </button>
          {selectionMode && selectedIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={deletingBulk}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-60"
            >
              {deletingBulk ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              {t('deleteSelected', { count: selectedIds.size })}
            </button>
          )}
          {selectionMode && brokers.length > 0 && (
            <button
              onClick={() => setSelectedIds(selectedIds.size === brokers.length ? new Set() : new Set(brokers.map(b => b.id)))}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300"
            >
              {selectedIds.size === brokers.length ? t('deselectAll') : t('selectAll')}
            </button>
          )}
        </div>
      )}

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
          {brokers.map(b => {
            const isSelected = selectedIds.has(b.id);
            const isFiltered = selectedBrokerId === b.id;
            return (
              <div key={b.id}
                onClick={() => {
                  if (selectionMode) { toggleSelect(b.id); return; }
                  setViewingBroker(b);
                }}
                className={cn('p-4 rounded-xl border-2 bg-white dark:bg-slate-900 cursor-pointer transition-colors',
                  isSelected ? 'border-red-500 bg-red-50/30 dark:bg-red-500/5' :
                  isFiltered ? 'border-rose-400 dark:border-rose-500/60' : 'border-slate-200 dark:border-slate-800 hover:border-rose-300')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    {selectionMode && (
                      <span className="mt-0.5 shrink-0 text-rose-600">
                        {isSelected ? <CheckSquare size={16} /> : <Square size={16} className="text-slate-400" />}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 dark:text-white truncate">{b.name}</p>
                      {b.mobile && <p className="text-xs text-slate-500">{b.mobile}</p>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={cn('text-lg font-black block', b.balance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                      {b.balance > 0 ? 'Pending ' : 'Settled '}{rupee(Math.abs(b.balance))}
                    </span>
                    <span className="text-[10px] text-slate-400 flex items-center justify-end gap-0.5 mt-0.5">
                      <TrendingUp size={10} /> {entries.filter(e => e.brokerId === b.id && e.type === 'charge').length} orders
                    </span>
                  </div>
                </div>
                {!selectionMode && (
                  <div className="flex gap-2 mt-3">
                    <button onClick={(e) => { e.stopPropagation(); setEntryModal({ brokerId: b.id, type: 'charge' }); }}
                      className="flex-1 text-xs font-bold py-1.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 hover:bg-rose-100">
                      {t('addCommission')}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setEntryModal({ brokerId: b.id, type: 'payment' }); }}
                      className="flex-1 text-xs font-bold py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100">
                      {t('recordPayment')}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); downloadBrokerStatement(b); }}
                      title="Download PDF Statement"
                      className="text-xs font-bold p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700">
                      <FileText size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <p className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1.5">
            {selectedBroker ? t('logFor', { name: selectedBroker.name }) : t('allActivity')}
            {selectedBroker && (
              <button onClick={() => setSelectedBrokerId(null)}
                className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-500/20 dark:hover:text-rose-400 transition-colors">
                <X size={9} /> {t('allActivity')}
              </button>
            )}
          </p>
          <div className="flex-1" />
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
        <div className="flex gap-1.5 mb-3">
          {(['all', 'purchase', 'sale'] as const).map(k => (
            <button key={k} type="button" onClick={() => setDirFilter(k)}
              className={'text-xs font-bold px-3 py-1 rounded-full border ' + (dirFilter === k ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900' : 'border-slate-200 dark:border-slate-700 text-slate-500')}>
              {k === 'all' ? 'All' : k === 'purchase' ? 'Purchase broker' : 'Sale broker'}
            </button>
          ))}
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
                      {e.direction && <span className={'text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ' + (e.direction === 'purchase' ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700')}>{e.direction === 'purchase' ? 'Purchase' : 'Sale'}{e.billLabel ? ' · ' + e.billLabel : ''}</span>}
                      {e.billNumber && <span className="text-xs font-semibold text-slate-500">#{e.billNumber}</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {e.note && ` · ${fmtNote(e.note)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={cn('text-lg font-black mr-1', e.type === 'charge' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                      {e.type === 'charge' ? '+' : '−'}{rupee(e.amount)}
                    </span>
                    <EditButton onClick={() => setEditing(e)} />
                    <DeleteButton url={`/management/commission/${e.id}`} name={`${e.type === 'charge' ? 'commission' : 'commission payment'} ${rupee(e.amount)}`} onDone={() => refetch()} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {viewingBroker && (
        <BrokerProfileModal
          broker={viewingBroker}
          entries={entries.filter(e => e.brokerId === viewingBroker.id)}
          onClose={() => setViewingBroker(null)}
          onEdit={() => { setEditingBroker(viewingBroker); setViewingBroker(null); }}
          onDeleted={() => { setViewingBroker(null); refetch(); }}
          onAddCommission={() => { setEntryModal({ brokerId: viewingBroker.id, type: 'charge' }); setViewingBroker(null); }}
          onRecordPayment={() => { setEntryModal({ brokerId: viewingBroker.id, type: 'payment' }); setViewingBroker(null); }}
          onFilterActivity={() => { setSelectedBrokerId(id => id === viewingBroker.id ? null : viewingBroker.id); setViewingBroker(null); }}
        />
      )}

      {editingBroker && (
        <BrokerEditModal
          broker={editingBroker}
          onClose={() => setEditingBroker(null)}
          onSaved={() => { setEditingBroker(null); refetch(); }}
        />
      )}

      {editing && (
        <EditEntryModal url={`/management/commission/${editing.id}`} title={editing.type === 'charge' ? 'Edit commission' : 'Edit commission payment'} onClose={() => setEditing(null)} onDone={() => { setEditing(null); refetch(); }}
          initial={{ amount: editing.amount, billNumber: editing.billNumber || '', note: editing.note || '', direction: editing.direction || '', paymentMethod: editing.paymentMethod || 'Cash' }}
          fields={[
            { key: 'amount', label: 'Amount (₹)', type: 'number' },
            ...(editing.type === 'charge' ? [{ key: 'direction', label: 'Commission for', type: 'choice' as const, options: [{ value: 'purchase', label: 'Purchase' }, { value: 'sale', label: 'Sale' }] }] : []),
            { key: 'billNumber', label: 'Bill number' },
            ...(editing.type === 'payment' ? [{ key: 'paymentMethod', label: 'Paid by', type: 'select' as const, options: ['Cash', 'UPI', 'Card'].map(v => ({ value: v, label: v })) }] : []),
            { key: 'note', label: 'Note' },
          ]} />
      )}

      {entryModal && (
        <CommissionEntryModal
          brokerId={entryModal.brokerId}
          brokerName={brokers.find(b => b.id === entryModal.brokerId)?.name || ''}
          type={entryModal.type}
          balance={Math.max(0, brokers.find(b => b.id === entryModal.brokerId)?.balance || 0)}
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

function BrokerProfileModal({ broker, entries, onClose, onEdit, onDeleted, onAddCommission, onRecordPayment, onFilterActivity }: {
  broker: Broker;
  entries: CommissionRow[];
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
  onAddCommission: () => void;
  onRecordPayment: () => void;
  onFilterActivity: () => void;
}) {
  const t = useTranslations('Brokers');
  const [deleting, setDeleting] = useState(false);
  const totalCommission = entries.filter(e => e.type === 'charge').reduce((a, e) => a + e.amount, 0);
  const totalPaid = entries.filter(e => e.type === 'payment').reduce((a, e) => a + e.amount, 0);
  const orderCount = entries.filter(e => e.type === 'charge').length;
  const hasDues = broker.balance > 0;

  const handleDelete = async () => {
    if (hasDues) return;
    if (!confirm(t('deleteConfirm', { name: broker.name }))) return;
    setDeleting(true);
    try {
      await api.delete(`/crm/customers/${broker.id}`);
      toast.success(t('deletedSuccess', { name: broker.name }));
      onDeleted();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('deleteFailed'));
    } finally { setDeleting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-black flex items-center gap-2">
            <Handshake size={16} className="text-rose-600" /> {t('profileTitle')}
          </h2>
          <div className="flex items-center gap-1">
            <button onClick={onEdit} title={t('editBroker')} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
              <Pencil size={15} />
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting || hasDues}
              title={hasDues ? t('deleteBlockedDue') : t('deleteBroker')}
              className={cn('p-1.5 rounded-lg transition-colors', hasDues ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed' : 'hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500')}
            >
              {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Identity */}
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-full bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center shrink-0">
              <User size={20} className="text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <p className="font-black text-lg text-slate-900 dark:text-white leading-tight">{broker.name}</p>
              {broker.mobile
                ? <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5"><Phone size={12} /> {broker.mobile}</p>
                : <p className="text-xs text-slate-400 mt-0.5">{t('noMobile')}</p>}
            </div>
          </div>

          {/* Balance badge */}
          <div className={cn('rounded-xl p-3 flex justify-between items-center', hasDues ? 'bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20' : 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20')}>
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
              {hasDues ? t('pendingDue') : t('settled')}
            </span>
            <span className={cn('text-xl font-black', hasDues ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
              {rupee(Math.abs(broker.balance))}
            </span>
          </div>

          {hasDues && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1.5 -mt-1">
              <AlertCircle size={11} /> {t('deleteBlockedHint')}
            </p>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { labelKey: 'orders' as const, value: orderCount },
              { labelKey: 'totalCommission' as const, value: rupee(totalCommission) },
              { labelKey: 'totalPaid' as const, value: rupee(totalPaid) },
            ].map(({ labelKey, value }) => (
              <div key={labelKey} className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-2">
                <p className="text-[10px] text-slate-400 uppercase font-bold">{t(labelKey)}</p>
                <p className="text-sm font-black text-slate-900 dark:text-white mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button onClick={onAddCommission}
              className="flex-1 text-xs font-bold py-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 hover:bg-rose-100">
              + {t('addCommission')}
            </button>
            <button onClick={onRecordPayment}
              className="flex-1 text-xs font-bold py-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100">
              {t('recordPayment')}
            </button>
          </div>
          <button onClick={onFilterActivity}
            className="w-full text-xs font-bold py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
            {t('viewActivity')}
          </button>
        </div>
      </div>
    </div>
  );
}

function BrokerEditModal({ broker, onClose, onSaved }: { broker: Broker; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('Brokers');
  const [name, setName] = useState(broker.name);
  const [mobile, setMobile] = useState(broker.mobile || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true); setError('');
    try {
      await api.put(`/crm/customers/${broker.id}`, {
        name: name.trim(),
        mobile: mobile.trim(),
        customerType: 'broker',
      });
      toast.success(t('updatedSuccess'));
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('saveFailed'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-black flex items-center gap-2">
            <Pencil size={16} className="text-rose-600" /> {t('editBroker')}
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
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 h-10 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-600 dark:text-slate-300">{t('cancelSelect')}</button>
            <button type="submit" disabled={saving || !name.trim()}
              className="flex-1 h-10 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700">
              {saving ? <Loader2 size={14} className="animate-spin" /> : null} Save
            </button>
          </div>
        </form>
      </div>
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

function CommissionEntryModal({ brokerId, brokerName, type, balance = 0, onClose, onSaved }: {
  brokerId: string; brokerName: string; type: 'charge' | 'payment'; balance?: number; onClose: () => void; onSaved: () => void;
}) {
  const t = useTranslations('Brokers');
  const [amount, setAmount] = useState('');
  const [discount, setDiscount] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [direction, setDirection] = useState<'purchase' | 'sale'>('purchase');
  const [billAmount, setBillAmount] = useState('');
  const [rate, setRate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Card'>('Cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const discountVal = Math.max(0, parseFloat(discount) || 0);
  const amountVal = Math.max(0, parseFloat(amount) || 0);
  const effectiveMax = Math.max(0, balance - discountVal);

  const calcAmount = () => {
    const b = parseFloat(billAmount);
    const r = parseFloat(rate);
    if (!isNaN(b) && !isNaN(r) && r > 0) {
      setAmount(((b * r) / 100).toFixed(2));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amountVal <= 0 && discountVal <= 0) { setError('Enter payment amount or discount.'); return; }
    if (amountVal + discountVal > balance + 0.005) { setError(`Cannot exceed outstanding ${rupee(balance)}.`); return; }
    setSaving(true); setError('');
    try {
      await api.post('/management/commission', {
        brokerId, type, amount: amountVal,
        discount: discountVal || undefined,
        billNumber: type === 'charge' ? billNumber : undefined,
        paymentMethod: type === 'payment' ? paymentMethod : undefined,
        note,
        direction: type === 'charge' ? direction : undefined,
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
          {type === 'payment' && balance > 0 && (
            <div className="rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 px-3 py-2 flex justify-between items-center">
              <span className="text-xs font-medium text-slate-500">Outstanding</span>
              <span className="text-base font-black text-rose-600 dark:text-rose-400">{rupee(balance)}</span>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold uppercase text-slate-500">{t('amount')} {type === 'payment' ? '(₹)' : '*'}</span>
              {type === 'payment' && balance > 0 && (
                <button type="button" onClick={() => setAmount(effectiveMax.toFixed(2))}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200">
                  Settle Full {discountVal > 0 ? `(${rupee(effectiveMax)})` : ''}
                </button>
              )}
            </div>
            <input type="number" min="0" step="0.01" autoFocus={type !== 'charge'} value={amount}
              onChange={e => setAmount(e.target.value)}
              max={type === 'payment' ? effectiveMax : undefined}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </div>
          {type === 'payment' && (
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Discount / Write-off (₹)</span>
              <input type="number" min="0" step="0.01" value={discount}
                onChange={e => {
                  setDiscount(e.target.value);
                  const d = Math.max(0, parseFloat(e.target.value) || 0);
                  const newMax = Math.max(0, balance - d);
                  if ((parseFloat(amount) || 0) > newMax) setAmount(newMax.toFixed(2));
                }}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" placeholder="0" />
            </label>
          )}
          {type === 'payment' && discountVal > 0 && (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3 text-xs space-y-1.5">
              <div className="flex justify-between text-slate-500"><span>Outstanding</span><span>{rupee(balance)}</span></div>
              {amountVal > 0 && <div className="flex justify-between text-emerald-700 dark:text-emerald-400"><span>− Payment</span><span>{rupee(amountVal)}</span></div>}
              <div className="flex justify-between text-violet-600 dark:text-violet-400"><span>− Discount / Write-off</span><span>{rupee(discountVal)}</span></div>
              <div className="border-t border-slate-200 dark:border-slate-700 pt-1.5 flex justify-between font-bold">
                <span className="text-slate-700 dark:text-slate-300">Balance After</span>
                <span className={Math.max(0, balance - amountVal - discountVal) <= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                  {rupee(Math.max(0, balance - amountVal - discountVal))}
                </span>
              </div>
            </div>
          )}
          {type === 'charge' && (
            <div>
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Commission for</span>
              <div className="grid grid-cols-2 gap-2">
                {(['purchase', 'sale'] as const).map(k => (
                  <button key={k} type="button" onClick={() => setDirection(k)}
                    className={cn('h-9 rounded-lg text-sm font-bold border-2 transition-colors', direction === k ? 'border-rose-500 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'border-slate-200 dark:border-slate-700 text-slate-500')}>
                    {k === 'purchase' ? 'Purchase' : 'Sale'}
                  </button>
                ))}
              </div>
            </div>
          )}
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
          <button type="submit" disabled={saving || (type === 'payment' ? amountVal <= 0 && discountVal <= 0 : !amount)}
            className={cn('w-full h-11 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2',
              type === 'charge' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700')}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {type === 'charge' ? t('addCommission')
              : discountVal > 0 && amountVal > 0 ? `Pay ${rupee(amountVal)} + Discount ${rupee(discountVal)}`
              : discountVal > 0 ? `Write-off ${rupee(discountVal)}`
              : t('recordPayment')}
          </button>
        </form>
      </div>
    </div>
  );
}
