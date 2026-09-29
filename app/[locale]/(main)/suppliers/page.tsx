'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  Search, Loader2, Phone, X, Plus, Mail, MapPin, Truck,
  IndianRupee, TrendingUp, Wallet, AlertCircle, Calendar,
  ChevronDown, ChevronRight, CheckCircle2, ReceiptText,
  UploadCloud, Eye, Trash2, FileImage, Pencil, User, AlertTriangle, FileText, ChevronLeft,
} from 'lucide-react';
import api from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import { useBusinessStore } from '@/lib/businessStore';
import DocumentViewerModal from '@/components/DocumentViewerModal';
import { ExportButton } from '@/lib/hooks/useExport';
import { generatePendingBillsPDF } from '@/lib/pdf/pendingBillsReport';
import { generatePurchaseBillPDF } from '@/lib/pdf/purchaseBillDetail';
import { ConfirmPasswordModal } from '@/components/trash/ConfirmPasswordModal';
import { isMillBillingPackage } from '@/lib/config/packageConfig';
import { SelectionActionBar } from '@/components/trash/SelectionActionBar';
import { useRowSelection } from '@/lib/hooks/useRowSelection';

type SupplierRow = {
  id: string;
  name: string;
  mobile: string;
  email: string;
  gst: string;
  address: string;
  totalPurchased: number;
  totalPaid: number;
  remaining: number;
  txnCount: number;
  status: 'paid' | 'unpaid' | 'partial';
};

type Summary = {
  totalPurchased: number;
  totalPaid: number;
  totalRemaining: number;
  supplierCount: number;
  unpaidCount: number;
};

type StatusFilter = 'all' | 'paid' | 'unpaid' | 'partial';
type RangePreset = 'all' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';

type DueBill = {
  id: string;
  billNumber: string;
  date: string | null;
  originalAmount: number;
  remaining: number;
  dueDate: string | null;
};

const rupee = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** Local YYYY-MM-DD (avoids the UTC shift toISOString would introduce). */
const toInputDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function presetRange(preset: RangePreset): { from: string; to: string } {
  const now = new Date();
  if (preset === 'thisMonth') {
    return {
      from: toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: toInputDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }
  if (preset === 'lastMonth') {
    return {
      from: toInputDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: toInputDate(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  if (preset === 'thisYear') {
    return {
      from: toInputDate(new Date(now.getFullYear(), 0, 1)),
      to: toInputDate(new Date(now.getFullYear(), 11, 31)),
    };
  }
  return { from: '', to: '' };
}

const MONTH_LABEL = (key: string, locale: string) => {
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });
};

export default function SuppliersPage() {
  const t = useTranslations('Suppliers');
  const activeShopId = useBusinessStore((s) => s.activeShopId);

  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [summary, setSummary] = useState<Summary>({
    totalPurchased: 0, totalPaid: 0, totalRemaining: 0, supplierCount: 0, unpaidCount: 0,
  });
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [preset, setPreset] = useState<RangePreset>('all');
  const [range, setRange] = useState({ from: '', to: '' });

  const [showAdd, setShowAdd] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [rollupMode, setRollupMode] = useState<'pending' | 'paid' | null>(null);

  // Bulk select + password-gated bulk delete for the list view. Single-delete
  // (inside SupplierDetail below) is a separate flow with its own modal
  // instance — the two live in different components so there's no shared
  // pending-id state to unify them the way billing/invoices does.
  const { selectedIds, isAllSelected, toggleOne, toggleAll, clear: clearSelection } = useRowSelection(suppliers.map((s) => s.id));
  const [pendingBulkDeleteIds, setPendingBulkDeleteIds] = useState<string[] | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (range.from) params.set('from', range.from);
      if (range.to) params.set('to', range.to);
      if (status !== 'all') params.set('status', status);
      if (search.trim()) params.set('search', search.trim());
      const res = await api.get(`/suppliers/ledger?${params.toString()}`);
      setSuppliers(res.data?.suppliers || []);
      setSummary(res.data?.summary || {
        totalPurchased: 0, totalPaid: 0, totalRemaining: 0, supplierCount: 0, unpaidCount: 0,
      });
    } catch (e) {
      console.error('Failed to load suppliers', e);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, status, search]);

  // Debounce so typing in search doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load, activeShopId]);

  const applyPreset = (p: RangePreset) => {
    setPreset(p);
    if (p !== 'custom') setRange(presetRange(p));
  };

  // Bulk delete — password verification (ConfirmPasswordModal) happens first,
  // then this fires. The bulk route never 409s the whole batch the way the
  // single-delete route does; suppliers with linked history come back in
  // `blocked` alongside whatever else deleted cleanly in the same call, so we
  // ask once, batch-wide, whether to retry those specific ids with cascade=true.
  const handleBulkDeleteClick = () => {
    if (selectedIds.length > 0) setPendingBulkDeleteIds(selectedIds);
  };

  const confirmBulkDelete = async () => {
    const ids = pendingBulkDeleteIds;
    if (!ids || ids.length === 0) { setPendingBulkDeleteIds(null); return; }
    setBulkDeleting(true);
    try {
      const res = await api.delete(`/suppliers/bulk?ids=${ids.join(',')}`);
      const deleted: string[] = res.data?.deleted || [];
      const blocked: { id: string; name: string; txnCount: number; invoiceCount: number }[] = res.data?.blocked || [];
      const failed: { id: string; error: string }[] = res.data?.failed || [];

      if (blocked.length > 0) {
        const list = blocked
          .map((b) => `- ${b.name}: ${b.txnCount} transaction${b.txnCount === 1 ? '' : 's'}${b.invoiceCount ? `, ${b.invoiceCount} purchase invoice${b.invoiceCount === 1 ? '' : 's'}` : ''}`)
          .join('\n');
        const ok = confirm(
          `${deleted.length > 0 ? `${deleted.length} supplier(s) deleted.\n\n` : ''}${blocked.length} supplier${blocked.length === 1 ? ' has' : 's have'} purchase history and ${blocked.length === 1 ? 'was' : 'were'} skipped:\n\n${list}\n\nClick OK to permanently delete ${blocked.length === 1 ? 'it' : 'them'} along with all linked transactions and purchase invoices.\nClick Cancel to keep ${blocked.length === 1 ? 'it' : 'them'}.`
        );
        if (ok) {
          try {
            const retryRes = await api.delete(`/suppliers/bulk?ids=${blocked.map((b) => b.id).join(',')}&cascade=true`);
            const retryFailed: { id: string; error: string }[] = retryRes.data?.failed || [];
            if (retryFailed.length > 0) {
              alert(`${retryFailed.length} supplier(s) could not be deleted.`);
            }
          } catch (err2: any) {
            alert(err2?.response?.data?.detail || err2?.response?.data?.error || err2?.message || 'Failed to delete the remaining suppliers.');
          }
        }
      }
      if (failed.length > 0) {
        alert(`${failed.length} supplier(s) failed to delete.`);
      }

      clearSelection();
      load();
    } catch (err: any) {
      alert(err?.response?.data?.detail || err?.response?.data?.error || err?.message || 'Failed to delete suppliers.');
    } finally {
      setBulkDeleting(false);
      setPendingBulkDeleteIds(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{t('pageTitle')}</h1>
          <p className="text-slate-500 text-sm font-medium">
            {t('pageSubtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportButton
            filename="suppliers"
            title="Supplier List"
            // 10 columns (incl. Address/Email, both long free text) crush to
            // an unreadable, letter-wrapping mess in portrait's ~180mm body
            // width — landscape's ~267mm gives them room to breathe.
            orientation="landscape"
            dateRange={range.from && range.to ? `${range.from} – ${range.to}` : undefined}
            summary={[
              { label: t('totalPurchase'), value: rupee(summary.totalPurchased) },
              { label: t('totalPaid'), value: rupee(summary.totalPaid), tone: 'positive' },
              { label: t('remainingToPay'), value: rupee(summary.totalRemaining), tone: 'negative' },
              { label: t('suppliersLabel'), value: String(summary.supplierCount) },
            ]}
            columns={[
              { key: 'name', label: 'Supplier' },
              { key: 'mobile', label: 'Mobile' },
              { key: 'email', label: 'Email' },
              { key: 'gst', label: 'GSTIN' },
              { key: 'address', label: 'Address' },
              { key: 'totalPurchased', label: 'Purchased', type: 'currency' },
              { key: 'totalPaid', label: 'Paid', type: 'currency' },
              { key: 'remaining', label: 'Remaining', type: 'currency' },
              { key: 'txnCount', label: 'Bills', type: 'number' },
              { key: 'status', label: 'Status' },
            ]}
            data={suppliers}
          />
          <button
            onClick={() => setShowAdd(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-lg shadow-emerald-500/20"
          >
            <Plus size={18} /> {t('addSupplierBtn')}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          label={t('totalPurchase')}
          value={rupee(summary.totalPurchased)}
          icon={<TrendingUp size={18} className="text-blue-500" />}
          tone="blue"
        />
        <StatCard
          label={t('totalPaid')}
          value={rupee(summary.totalPaid)}
          icon={<CheckCircle2 size={18} className="text-emerald-500" />}
          tone="emerald"
          onClick={() => setRollupMode('paid')}
        />
        <StatCard
          label={t('remainingToPay')}
          value={rupee(summary.totalRemaining)}
          icon={<AlertCircle size={18} className="text-red-500" />}
          tone="red"
          onClick={() => setRollupMode('pending')}
        />
        <StatCard
          label={t('suppliersLabel')}
          value={`${summary.supplierCount}`}
          subtitle={summary.unpaidCount > 0 ? t('withDues', { count: summary.unpaidCount }) : t('allSettled')}
          icon={<Truck size={18} className="text-amber-500" />}
          tone="amber"
        />
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {([
              ['all', t('statusAll')],
              ['unpaid', t('statusUnpaid')],
              ['partial', t('statusPartial')],
              ['paid', t('statusPaid')],
            ] as [StatusFilter, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStatus(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  status === key
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Date range */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mr-1">
            <Calendar size={13} /> {t('periodLabel')}
          </span>
          {([
            ['all', t('rangeAllTime')],
            ['thisMonth', t('rangeThisMonth')],
            ['lastMonth', t('rangeLastMonth')],
            ['thisYear', t('rangeThisYear')],
            ['custom', t('rangeCustom')],
          ] as [RangePreset, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                preset === key
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
          {preset === 'custom' && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
              <input
                type="date"
                value={range.from}
                onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <span className="text-xs text-slate-400">{t('toSeparator')}</span>
              <input
                type="date"
                value={range.to}
                onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* Supplier list */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="flex justify-center p-16">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        ) : suppliers.length === 0 ? (
          <div className="py-16 text-center">
            <Truck size={40} className="text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-slate-600 dark:text-slate-300 font-bold">{t('noSuppliersFound')}</p>
            <p className="text-sm text-slate-500 mt-1">
              {search || status !== 'all' ? t('tryClearingFilters') : t('addFirstSupplierHint')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="px-5 pt-4">
              <SelectionActionBar
                count={selectedIds.length}
                itemLabel="supplier"
                onDelete={handleBulkDeleteClick}
                onClear={clearSelection}
                disabled={bulkDeleting}
              />
            </div>
            <table className="w-full text-left min-w-[720px]">
              <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleAll}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer"
                    />
                  </th>
                  <th className="px-5 py-3">{t('supplierHeader')}</th>
                  <th className="px-5 py-3 text-right">{t('purchasedHeader')}</th>
                  <th className="px-5 py-3 text-right">{t('paidHeader')}</th>
                  <th className="px-5 py-3 text-right">{t('remainingHeader')}</th>
                  <th className="px-5 py-3 text-center">{t('statusHeader')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {suppliers.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setDetailId(s.id)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(s.id)}
                        onChange={() => toggleOne(s.id)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer"
                      />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 shrink-0">
                          <Truck size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 dark:text-white text-sm truncate">{s.name}</p>
                          <p className="text-xs text-slate-500 truncate">{s.mobile || t('noNumber')}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right font-bold text-slate-700 dark:text-slate-300">
                      {rupee(s.totalPurchased)}
                    </td>
                    <td className="px-5 py-4 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      {rupee(s.totalPaid)}
                    </td>
                    <td className="px-5 py-4 text-right font-black text-slate-900 dark:text-white">
                      {s.remaining > 0 ? (
                        <span className="text-red-600 dark:text-red-400">{rupee(s.remaining)}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <StatusPill status={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <AddSupplierModal
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(); }}
        />
      )}

      {detailId && (
        <SupplierDetail
          supplierId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={load}
        />
      )}

      {rollupMode && (
        <SupplierRollupView
          mode={rollupMode}
          onBack={() => setRollupMode(null)}
          onOpenSupplier={(id) => { setRollupMode(null); setDetailId(id); }}
        />
      )}

      <ConfirmPasswordModal
        open={!!pendingBulkDeleteIds}
        itemLabel="supplier"
        itemCount={pendingBulkDeleteIds?.length || 1}
        onConfirm={confirmBulkDelete}
        onCancel={() => setPendingBulkDeleteIds(null)}
      />
    </div>
  );
}

/* ─── Rollup: every pending bill / every payment, across all suppliers ───── */

function SupplierRollupView({ mode, onBack, onOpenSupplier }: {
  mode: 'pending' | 'paid';
  onBack: () => void;
  onOpenSupplier: (supplierId: string) => void;
}) {
  const t = useTranslations('Suppliers');
  const isPending = mode === 'pending';

  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<{ totalPending?: number; billCount?: number; totalPaid?: number; paymentCount?: number }>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState<RangePreset>('all');
  const [range, setRange] = useState({ from: '', to: '' });
  const [viewing, setViewing] = useState<{ supplierId: string; supplierName: string; transaction: any } | null>(null);

  const applyPreset = (p: RangePreset) => {
    setPreset(p);
    if (p !== 'custom') setRange(presetRange(p));
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (range.from) params.set('from', range.from);
      if (range.to) params.set('to', range.to);
      if (search.trim()) params.set('search', search.trim());
      const res = await api.get(`/suppliers/${isPending ? 'pending-bills' : 'payments'}?${params.toString()}`);
      setRows(isPending ? (res.data?.bills || []) : (res.data?.payments || []));
      setSummary(res.data?.summary || {});
    } catch (e) {
      console.error('Failed to load supplier rollup', e);
    } finally {
      setLoading(false);
    }
  }, [isPending, range.from, range.to, search]);

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <div className="fixed inset-0 z-[60] bg-slate-50 dark:bg-slate-950 overflow-y-auto">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >
            <ChevronLeft size={18} /> {t('backBtn') || 'Back'}
          </button>
        </div>

        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {isPending ? (t('allPendingBillsTitle') || 'All Pending Bills') : (t('allPaymentsTitle') || 'All Payments Made')}
          </h1>
          <p className="text-slate-500 text-sm font-medium">
            {isPending
              ? (t('allPendingBillsSubtitle') || 'Every outstanding bill across every supplier.')
              : (t('allPaymentsSubtitle') || 'Every payment made to every supplier.')}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 max-w-md">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
              {isPending ? (t('remainingToPay')) : (t('totalPaid'))}
            </p>
            <p className={`text-xl font-black ${isPending ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {rupee(isPending ? (summary.totalPending || 0) : (summary.totalPaid || 0))}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
              {isPending ? (t('billsCountLabel') || 'Bills') : (t('paymentsCountLabel') || 'Payments')}
            </p>
            <p className="text-xl font-black text-slate-900 dark:text-white">
              {isPending ? (summary.billCount || 0) : (summary.paymentCount || 0)}
            </p>
          </div>
        </div>

        {/* Filters — search (matches supplier name/mobile/bill number) + date range */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchRollupPlaceholder') || 'Search by supplier name, mobile, or invoice/bill number...'}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mr-1">
              <Calendar size={13} /> {t('periodLabel')}
            </span>
            {([
              ['all', t('rangeAllTime')],
              ['thisMonth', t('rangeThisMonth')],
              ['lastMonth', t('rangeLastMonth')],
              ['thisYear', t('rangeThisYear')],
              ['custom', t('rangeCustom')],
            ] as [RangePreset, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  preset === key
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
            {preset === 'custom' && (
              <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                <input
                  type="date"
                  value={range.from}
                  onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <span className="text-xs text-slate-400">{t('toSeparator')}</span>
                <input
                  type="date"
                  value={range.to}
                  onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          {loading ? (
            <div className="flex justify-center p-16">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <Truck size={40} className="text-slate-300 dark:text-slate-700 mx-auto mb-3" />
              <p className="text-slate-600 dark:text-slate-300 font-bold">
                {isPending ? (t('noPendingBillsFound') || 'No pending bills found') : (t('noPaymentsFound') || 'No payments found')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[760px]">
                <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-5 py-3">{t('supplierHeader')}</th>
                    <th className="px-5 py-3">{t('billNumberHeader') || 'Bill No'}</th>
                    <th className="px-5 py-3">{isPending ? (t('billDateHeader') || 'Bill Date') : (t('dateHeader') || 'Date')}</th>
                    {isPending && <th className="px-5 py-3">{t('dueDateHeader') || 'Due Date'}</th>}
                    {isPending ? (
                      <th className="px-5 py-3 text-right">{t('remainingHeader')}</th>
                    ) : (
                      <>
                        <th className="px-5 py-3 text-right">{t('amountHeader') || 'Amount'}</th>
                        <th className="px-5 py-3">{t('noteHeader') || 'Note'}</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setViewing({
                        supplierId: r.supplierId,
                        supplierName: r.supplierName,
                        transaction: {
                          id: r.id,
                          type: isPending ? 'purchase' : 'payment',
                          amount: isPending ? r.originalAmount : r.amount,
                          note: r.note || '',
                          billNumber: r.billNumber || '',
                          date: r.date,
                        },
                      })}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); onOpenSupplier(r.supplierId); }}
                          className="text-left font-bold text-slate-900 dark:text-white text-sm hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline"
                        >
                          {r.supplierName}
                        </button>
                        <p className="text-xs text-slate-500">{r.supplierMobile || t('noNumber')}</p>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                        {r.billNumber || '-'}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                        {fmtDate(r.date)}
                      </td>
                      {isPending && (
                        <td className="px-5 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                          {fmtDate(r.dueDate)}
                        </td>
                      )}
                      {isPending ? (
                        <td className="px-5 py-3.5 text-right font-black text-red-600 dark:text-red-400">
                          {rupee(r.remaining)}
                        </td>
                      ) : (
                        <>
                          <td className="px-5 py-3.5 text-right font-black text-emerald-600 dark:text-emerald-400">
                            {rupee(r.amount)}
                          </td>
                          <td className="px-5 py-3.5 text-xs text-slate-500 truncate max-w-[200px]">
                            {r.note || '-'}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {viewing && (
        <TransactionDetailModal
          supplierId={viewing.supplierId}
          supplierName={viewing.supplierName}
          transaction={viewing.transaction}
          billPhotos={[]}
          onViewDoc={() => {}}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

/* ─── Small presentational pieces ─────────────────────────────────────────── */

function StatCard({ label, value, subtitle, icon, tone, onClick }: {
  label: string; value: string; subtitle?: string; icon: React.ReactNode;
  tone: 'blue' | 'emerald' | 'red' | 'amber'; onClick?: () => void;
}) {
  const ring: Record<string, string> = {
    blue: 'border-b-blue-500/40',
    emerald: 'border-b-emerald-500/40',
    red: 'border-b-red-500/40',
    amber: 'border-b-amber-500/40',
  };
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={`w-full text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 border-b-4 ${ring[tone]} rounded-2xl p-4 ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all' : ''}`}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-tight">{label}</p>
        {icon}
      </div>
      <p className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tighter">{value}</p>
      {subtitle && <p className="text-[11px] font-bold text-slate-400 mt-0.5">{subtitle}</p>}
    </Wrapper>
  );
}

function StatusPill({ status }: { status: 'paid' | 'unpaid' | 'partial' }) {
  const t = useTranslations('Suppliers');
  const map = {
    paid: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    partial: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    unpaid: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  };
  const label = { paid: t('statusPaid'), partial: t('statusPartial'), unpaid: t('statusUnpaid') };
  return (
    <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${map[status]}`}>
      {label[status]}
    </span>
  );
}

/* ─── Add Supplier ────────────────────────────────────────────────────────── */

function AddSupplierModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('Suppliers');
  const [form, setForm] = useState({
    name: '', contact: '', mobile: '', email: '', gst: '', address: '',
    creditLimit: '', creditDays: '', openingBalance: '',
  });
  // Optional opening purchase recorded together with the supplier.
  const [withPurchase, setWithPurchase] = useState(false);
  const [purchase, setPurchase] = useState({
    date: toInputDate(new Date()), amount: '', paid: '', billNumber: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const amountNum = parseFloat(purchase.amount) || 0;
  const paidNum = parseFloat(purchase.paid) || 0;
  const remaining = Math.max(0, amountNum - paidNum);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (withPurchase && paidNum > amountNum) {
      setError(t('paidExceedsAmount'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Create with a zero balance, then record the purchase as a real
      // transaction so it shows up in the month-wise history.
      const res = await api.post('/crm/suppliers', {
        ...form,
        creditLimit: parseFloat(form.creditLimit) || 0,
        creditDays: parseInt(form.creditDays) || 0,
        openingBalance: parseFloat(form.openingBalance) || 0,
      });
      const supplierId = res.data?.id;
      if (withPurchase && supplierId && amountNum > 0) {
        await api.post(`/suppliers/${supplierId}/transactions`, {
          type: 'purchase',
          amount: amountNum,
          paidAmount: paidNum,
          date: purchase.date,
          billNumber: purchase.billNumber,
        });
      }
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || t('failedToSaveSupplier'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <h2 className="text-lg font-black text-slate-900 dark:text-white">{t('addSupplierTitle')}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4 overflow-y-auto">
          <Field label={t('supplierNameLabel')} required>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputCls}
              placeholder={t('supplierNamePlaceholder')}
            />
          </Field>

          <Field label={t('contactPersonLabel')} hint={t('optionalTag')}>
            <input
              value={form.contact}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
              className={inputCls}
              placeholder={t('contactPersonPlaceholder')}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t('phoneNumberLabel')}>
              <input
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                className={inputCls}
                placeholder="9422666475"
                inputMode="numeric"
              />
            </Field>
            <Field label={t('emailLabel')} hint={t('optionalTag')}>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputCls}
                placeholder="name@example.com"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t('gstinLabel')} hint={t('optionalTag')}>
              <input
                value={form.gst}
                onChange={(e) => setForm({ ...form, gst: e.target.value.toUpperCase() })}
                className={`${inputCls} font-mono text-sm`}
                maxLength={15}
              />
            </Field>
            <Field label={t('addressLabel')} hint={t('optionalTag')}>
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t('supplierCreditLimitInputLabel')} hint={t('optionalTag')}>
              <input
                type="number"
                min="0"
                step="1"
                value={form.creditLimit}
                onChange={(e) => setForm({ ...form, creditLimit: e.target.value })}
                className={inputCls}
                placeholder="e.g. 50000"
              />
            </Field>
            <Field label={t('creditDaysInputLabel')} hint={t('optionalTag')}>
              <input
                type="number"
                min="0"
                step="1"
                value={form.creditDays}
                onChange={(e) => setForm({ ...form, creditDays: e.target.value })}
                className={inputCls}
                placeholder="e.g. 30"
              />
            </Field>
          </div>

          {/* Opening balance */}
          <Field label={t('openingBalanceLabel') || 'Opening Balance'} hint={t('optionalTag')}>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">₹</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.openingBalance}
                onChange={(e) => setForm({ ...form, openingBalance: e.target.value })}
                className={`${inputCls} pl-7`}
                placeholder="0"
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">{t('openingBalanceHint') || 'Previous dues owed to this supplier before you started using the app'}</p>
          </Field>

          {/* Opening purchase */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <button
              type="button"
              onClick={() => setWithPurchase((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/50 text-left"
            >
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                {t('addPurchaseNow')}
                <span className="ml-2 text-xs font-medium text-slate-400">{t('optionalTag')}</span>
              </span>
              {withPurchase ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
            </button>

            {withPurchase && (
              <div className="p-4 space-y-4 animate-in fade-in">
                <div className="grid grid-cols-2 gap-4">
                  <Field label={t('purchaseDateLabel')}>
                    <input
                      type="date"
                      value={purchase.date}
                      onChange={(e) => setPurchase({ ...purchase, date: e.target.value })}
                      className={inputCls}
                    />
                  </Field>
                  <Field label={t('billNoLabel')} hint={t('optionalTag')}>
                    <input
                      value={purchase.billNumber}
                      onChange={(e) => setPurchase({ ...purchase, billNumber: e.target.value })}
                      className={inputCls}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label={t('purchaseAmountLabel')}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={purchase.amount}
                      onChange={(e) => setPurchase({ ...purchase, amount: e.target.value })}
                      className={inputCls}
                      placeholder="0"
                    />
                  </Field>
                  <Field label={t('paidNowLabel')}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={purchase.paid}
                      onChange={(e) => setPurchase({ ...purchase, paid: e.target.value })}
                      className={inputCls}
                      placeholder="0"
                    />
                  </Field>
                </div>
                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/15 border border-red-100 dark:border-red-900/40">
                  <span className="text-xs font-black uppercase tracking-wider text-red-700 dark:text-red-400">
                    {t('remainingLabel')}
                  </span>
                  <span className="text-lg font-black text-red-600 dark:text-red-400">{rupee(remaining)}</span>
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 font-medium flex items-center gap-2">
              <AlertCircle size={15} /> {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || !form.name.trim()}
            className="w-full h-12 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
            {t('saveSupplierBtn')}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─── Edit supplier: same fields as AddSupplierModal but PATCH not POST ───── */

function EditSupplierModal({ supplierId, initial, onClose, onSaved }: {
  supplierId: string;
  initial: { name: string; contact: string; mobile: string; email: string; gst: string; address: string; creditLimit: string; creditDays: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('Suppliers');
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.patch(`/suppliers/${supplierId}`, {
        ...form,
        creditLimit: parseFloat(form.creditLimit) || 0,
        creditDays: parseInt(form.creditDays) || 0,
      });
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || t('failedToSaveSupplier'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Edit Supplier</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4 overflow-y-auto">
          <Field label={t('supplierNameLabel')} required>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
          </Field>
          <Field label={t('contactPersonLabel')} hint={t('optionalTag')}>
            <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} className={inputCls} placeholder={t('contactPersonPlaceholder')} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('phoneNumberLabel')}>
              <input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className={inputCls} inputMode="numeric" />
            </Field>
            <Field label={t('emailLabel')} hint={t('optionalTag')}>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('gstinLabel')} hint={t('optionalTag')}>
              <input value={form.gst} onChange={(e) => setForm({ ...form, gst: e.target.value.toUpperCase() })} className={`${inputCls} font-mono text-sm`} maxLength={15} />
            </Field>
            <Field label={t('addressLabel')} hint={t('optionalTag')}>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('supplierCreditLimitInputLabel')} hint={t('optionalTag')}>
              <input type="number" min="0" step="1" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} className={inputCls} placeholder="e.g. 50000" />
            </Field>
            <Field label={t('creditDaysInputLabel')} hint={t('optionalTag')}>
              <input type="number" min="0" step="1" value={form.creditDays} onChange={(e) => setForm({ ...form, creditDays: e.target.value })} className={inputCls} placeholder="e.g. 30" />
            </Field>
          </div>
          {error && <p className="text-sm text-red-500 flex items-center gap-1.5"><AlertCircle size={14} />{error}</p>}
          <button
            type="submit"
            disabled={saving || !form.name.trim()}
            className="w-full h-12 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Pencil size={18} />}
            Save Changes
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─── Supplier detail: month-wise history + record purchase/payment ───────── */

function SupplierDetail({ supplierId, onClose, onChanged }: {
  supplierId: string; onClose: () => void; onChanged: () => void;
}) {
  const t = useTranslations('Suppliers');
  const locale = useLocale();
  const { profile } = useBusinessStore();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState({ from: '', to: '' });
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<'none' | 'purchase' | 'payment'>('none');
  const [generatingStatement, setGeneratingStatement] = useState(false);
  // 'general' = the top-level Bill Photos uploader; a transaction id = that
  // specific purchase row's inline uploader. Keyed so uploading one doesn't
  // show every row as busy.
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  // Two-step trash-icon "arm then delete" so we don't need window.confirm()
  // (which is auto-refused in some WebViews and the app's own browser pane).
  const [deleteArmedId, setDeleteArmedId] = useState<string | null>(null);
  useEffect(() => {
    if (!deleteArmedId) return;
    const t = setTimeout(() => setDeleteArmedId(null), 4000);
    return () => clearTimeout(t);
  }, [deleteArmedId]);
  const [viewingDoc, setViewingDoc] = useState<{ url: string; label: string } | null>(null);
  const [viewingTransaction, setViewingTransaction] = useState<any | null>(null);
  const [billSearch, setBillSearch] = useState('');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [supplierTab, setSupplierTab] = useState<'history' | 'deliveries'>('history');
  const [gateEntries, setGateEntries] = useState<any[]>([]);
  const [loadingGateEntries, setLoadingGateEntries] = useState(false);
  // Password re-verification gate — replaces the old first confirm() "are you
  // sure" dialog. The Trash icon just opens this; the actual delete only
  // fires from ConfirmPasswordModal's onConfirm, after verify-pin succeeds.
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  async function handleDeleteSupplier() {
    // Two-step delete: the server refuses (409) when the supplier has any
    // transaction or purchase-invoice history, and returns a `code: HAS_HISTORY`
    // signal. On that, we ask a second time whether to purge everything and
    // retry with ?cascade=true — otherwise the raw Prisma FK error would leak
    // into the alert (that's the "supplier_transactions_supplier_id_fkey"
    // message the user actually saw). This second confirm is informational
    // (data-loss scope), not identity, so it stays a plain confirm() rather
    // than folding into the password modal.
    if (!s) return;
    setDeleting(true);
    try {
      await api.delete(`/suppliers/${supplierId}`);
      onChanged();
      onClose();
    } catch (err: any) {
      const body = err?.response?.data;
      if (body?.code === 'HAS_HISTORY') {
        const ok = confirm(
          `${body.error}\n\nClick OK to permanently delete "${s.name}" along with ${body.txnCount} transaction${body.txnCount === 1 ? '' : 's'}${body.invoiceCount ? ` and ${body.invoiceCount} purchase invoice${body.invoiceCount === 1 ? '' : 's'}` : ''}.\n\nClick Cancel to keep the supplier and its history.`
        );
        if (ok) {
          try {
            await api.delete(`/suppliers/${supplierId}?cascade=true`);
            onChanged();
            onClose();
          } catch (err2: any) {
            alert(err2?.response?.data?.error || err2?.message || 'Failed to delete supplier.');
          }
        }
      } else {
        alert(body?.error || err?.message || 'Failed to delete supplier.');
      }
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (range.from) params.set('from', range.from);
      if (range.to) params.set('to', range.to);
      const res = await api.get(`/suppliers/${supplierId}/transactions?${params.toString()}`);
      setData(res.data);
      // Open the newest month by default.
      const first = res.data?.months?.[0]?.month;
      if (first) setOpenMonths((prev) => ({ ...prev, [first]: true }));
    } catch (e) {
      console.error('Failed to load supplier history', e);
    } finally {
      setLoading(false);
    }
  }, [supplierId, range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (supplierTab !== 'deliveries') return;
    setLoadingGateEntries(true);
    api.get(`/mill/gate-entries?supplierId=${supplierId}`)
      .then(r => setGateEntries(r.data || []))
      .catch(() => setGateEntries([]))
      .finally(() => setLoadingGateEntries(false));
  }, [supplierTab, supplierId]);

  async function handleDownloadPendingBills() {
    if (!data?.supplier) return;
    setGeneratingStatement(true);
    try {
      await generatePendingBillsPDF({
        shop: {
          name: profile.shopName || 'Vyapar Sarthi',
          address: profile.address || null,
          mobile: profile.mobile || null,
          gst: profile.gst || null,
          pan: profile.pan || null,
        },
        party: {
          name: data.supplier.name,
          address: data.supplier.address || null,
          mobile: data.supplier.mobile || null,
          gst: data.supplier.gst || null,
        },
        bills: data.dueBills || [],
        reportTitle: 'Pending Bills - Adjustment Wise',
        filename: `pending-bills-${(data.supplier.name || 'supplier').toString().trim().replace(/\s+/g, '-').toLowerCase()}`,
      });
    } catch (e) {
      console.error('Failed to generate pending bills PDF', e);
      alert(t('failedToGenerateStatement') || 'Failed to generate the statement PDF.');
    } finally {
      setGeneratingStatement(false);
    }
  }

  const s = data?.supplier;
  const totals = data?.totals || { totalPurchased: 0, totalPaid: 0, remaining: 0, dueInvoicesCount: 0, overdueAmount: 0 };
  // transactionId, when present, ties a bill photo to one specific purchase
  // row instead of leaving it as a general, unlinked supplier document.
  const documents: { id: string; url: string; uploadedAt: string; name?: string; transactionId?: string }[] = s?.documents || [];
  // The generic Bill Photos strip is for documents not already tied to one
  // purchase row — those are shown inline on their row instead, so a bill
  // doesn't appear twice.
  const generalDocuments = documents.filter((d) => !d.transactionId);

  // Bill-number search within this one supplier's history — filters the
  // already-loaded month buckets client-side (nothing here needs a round
  // trip; a single supplier's history is never large enough to matter), and
  // drops any month left with zero matches so the search reads as a real
  // filter rather than just highlighting.
  const billSearchNeedle = billSearch.trim().toLowerCase();
  const filteredMonths = billSearchNeedle
    ? (data?.months || [])
        .map((m: any) => ({
          ...m,
          items: m.items.filter((it: any) =>
            (it.billNumber || '').toLowerCase().includes(billSearchNeedle) ||
            (it.note || '').toLowerCase().includes(billSearchNeedle)
          ),
        }))
        .filter((m: any) => m.items.length > 0)
    : (data?.months || []);

  async function handleUploadBill(e: React.ChangeEvent<HTMLInputElement>, transactionId?: string) {
    if (!e.target.files || e.target.files.length === 0) return;
    // Multiple photos of ONE bill (front/back/pages) can be picked at once.
    const files = Array.from(e.target.files);
    e.target.value = '';
    setUploadingFor(transactionId || 'general');
    const uploaded: { id: string; url: string; uploadedAt: string; name?: string; transactionId?: string }[] = [];
    try {
      // Upload one at a time — the remote upload endpoint + DB are latency-
      // sensitive, and sequential keeps memory/connections in check.
      for (const file of files) {
        const body = new FormData();
        body.append('file', file);
        body.append('folder', 'supplier-docs');
        const res = await api.post('/upload', body);
        if (res.data.url) {
          uploaded.push({
            id: crypto.randomUUID(),
            url: res.data.url,
            uploadedAt: new Date().toISOString(),
            // Keep the original file name so the chip can show it (mobile
            // camera captures come through as "IMG_XXXX.jpg" — still more
            // useful than a bare date).
            name: file.name || undefined,
            ...(transactionId ? { transactionId } : {}),
          });
        }
      }
      if (uploaded.length) {
        const next = [...documents, ...uploaded];
        await api.patch(`/suppliers/${supplierId}`, { documents: next });
        setData((prev: any) => ({ ...prev, supplier: { ...prev.supplier, documents: next } }));
      }
      if (uploaded.length < files.length) alert(t('uploadFailed'));
    } catch (err) {
      console.error(err);
      // Persist whatever DID upload before the error so the shopkeeper doesn't
      // lose those, then report.
      if (uploaded.length) {
        const next = [...documents, ...uploaded];
        try {
          await api.patch(`/suppliers/${supplierId}`, { documents: next });
          setData((prev: any) => ({ ...prev, supplier: { ...prev.supplier, documents: next } }));
        } catch { /* ignore — reported below */ }
      }
      alert(t('uploadFailed'));
    } finally {
      setUploadingFor(null);
    }
  }

  async function handleDeleteBill(id: string) {
    // No native confirm() — some environments (Capacitor WebView, and this
    // app's own in-pane browser during testing) auto-return false from
    // window.confirm, which was making the trash-icon appear "not working".
    // Instead the trash icon arms first (`deleteArmedId`) and a second click
    // actually deletes; if a request fails, surface the real reason.
    const next = documents.filter((d) => d.id !== id);
    try {
      await api.patch(`/suppliers/${supplierId}`, { documents: next });
      setData((prev: any) => ({ ...prev, supplier: { ...prev.supplier, documents: next } }));
      setDeleteArmedId(null);
    } catch (err: any) {
      console.error(err);
      alert(err?.response?.data?.detail || err?.message || t('failedToDeleteBill'));
    }
  }

  return (
    <div className="fixed inset-0 z-[60] animate-in fade-in duration-200">
      <div className="bg-slate-50 dark:bg-slate-900 w-full h-full flex flex-col animate-in slide-in-from-bottom-4">
        {/* Header */}
        <div className="p-6 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white truncate">
              {s?.name || t('supplierFallback')}
            </h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-slate-500">
              {s?.contact && <span className="flex items-center gap-1"><User size={13} /> {s.contact}</span>}
              {s?.mobile && <span className="flex items-center gap-1"><Phone size={13} /> {s.mobile}</span>}
              {s?.email && <span className="flex items-center gap-1"><Mail size={13} /> {s.email}</span>}
              {s?.gst && <span className="flex items-center gap-1 font-mono text-xs">GST: {s.gst}</span>}
              {s?.address && <span className="flex items-center gap-1"><MapPin size={13} /> {s.address}</span>}
              {Number(s?.creditDays) > 0 && (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Calendar size={13} /> {s.creditDays} day terms
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setEditing(true)}
              title="Edit supplier"
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
              title="Delete supplier"
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
            >
              {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {editing && s && (
          <EditSupplierModal
            supplierId={supplierId}
            initial={{
              name: s.name || '',
              contact: s.contact || '',
              mobile: s.mobile || '',
              email: s.email || '',
              gst: s.gst || '',
              address: s.address || '',
              creditLimit: s.creditLimit ? String(s.creditLimit) : '',
              creditDays: s.creditDays ? String(s.creditDays) : '',
            }}
            onClose={() => setEditing(false)}
            onSaved={() => { setEditing(false); load(); onChanged(); }}
          />
        )}

        {/* Everything below the header scrolls as one body — pinning only the
            header and letting the credit-health/totals/bill-photos chrome
            scroll away with the rest is what gives Payment History its full
            natural height instead of being squeezed into whatever space was
            left over on a shorter screen. */}
        <div className="overflow-y-auto flex-1 min-h-0">

        {/* Supplier credit health — the credit facility THIS supplier extends
            to us, distinct from the Credit Limit we extend to our own
            customers/party on the Customers/Party pages. Only shown once a
            limit has actually been set. */}
        {Number(s?.creditLimit) > 0 && (() => {
          const limit = Number(s.creditLimit);
          const outstanding = Number(totals.remaining) || 0;
          const available = Math.max(0, limit - outstanding);
          const over = outstanding > limit;
          const dueInvoicesCount = totals.dueInvoicesCount || 0;
          const overdueAmount = totals.overdueAmount || 0;
          return (
            <div className="p-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <MiniStat label={t('supplierCreditLimitLabel')} value={rupee(limit)} tone="slate" />
                <MiniStat label={t('currentOutstandingLabel')} value={rupee(outstanding)} tone={over ? 'red' : 'slate'} />
                <MiniStat label={t('availableCreditLabel')} value={rupee(available)} tone={over ? 'red' : available === 0 ? 'amber' : 'emerald'} />
                <MiniStat label={t('dueInvoicesLabel')} value={String(dueInvoicesCount)} tone={dueInvoicesCount > 0 ? 'amber' : 'slate'} />
                <MiniStat label={t('overdueAmountLabel')} value={rupee(overdueAmount)} tone={overdueAmount > 0 ? 'red' : 'slate'} />
              </div>
              {over && (
                <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400">
                  <AlertTriangle size={13} /> {t('creditLimitExceededBy', { amount: rupee(outstanding - limit) })}
                </p>
              )}
            </div>
          );
        })()}

        {/* Totals + actions */}
        <div className="p-4 grid grid-cols-3 gap-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <MiniStat label={t('purchasedHeader')} value={rupee(totals.totalPurchased)} tone="slate" />
          <MiniStat label={t('paidHeader')} value={rupee(totals.totalPaid)} tone="emerald" />
          <MiniStat label={t('remainingHeader')} value={rupee(totals.remaining)} tone="red" />
        </div>

        <div className="px-4 py-3 flex flex-wrap items-center gap-2 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <button
            onClick={() => setMode(mode === 'purchase' ? 'none' : 'purchase')}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors"
          >
            <ReceiptText size={15} /> {t('addPurchaseBtn')}
          </button>
          <button
            onClick={() => setMode(mode === 'payment' ? 'none' : 'payment')}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors"
          >
            <Wallet size={15} /> {t('recordPaymentBtn')}
          </button>
          <button
            onClick={handleDownloadPendingBills}
            disabled={generatingStatement}
            className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-60"
            title={t('pendingBillsStatementTitle') || 'Download a Pending Bills statement (bill-by-bill outstanding, adjustment-wise)'}
          >
            {generatingStatement ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
            {t('pendingBillsStatementBtn') || 'Pending Bills PDF'}
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="date"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <span className="text-xs text-slate-400">{t('toSeparator')}</span>
            <input
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
            />
            {(range.from || range.to) && (
              <button
                onClick={() => setRange({ from: '', to: '' })}
                className="text-xs font-bold text-slate-400 hover:text-red-500 px-1"
                title={t('clearDateFilterTitle')}
              >
                {t('clearBtn')}
              </button>
            )}
          </div>
        </div>

        {mode !== 'none' && (
          <TransactionForm
            supplierId={supplierId}
            mode={mode}
            remaining={totals.remaining}
            creditLimit={Number(s?.creditLimit) || 0}
            dueBills={data?.dueBills || []}
            onDone={() => { setMode('none'); load(); onChanged(); }}
            onCancel={() => setMode('none')}
          />
        )}

        {/* Tab switcher — history vs deliveries */}
        <div className="flex gap-1 px-4 pt-3 pb-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0">
          {(['history', 'deliveries'] as const).map(tab => (
            <button key={tab} onClick={() => setSupplierTab(tab)}
              className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-colors border-b-2 -mb-px ${
                supplierTab === tab
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}>
              {tab === 'history' ? (t('tabHistory') || 'Purchase History') : (t('tabDeliveries') || 'Deliveries')}
            </button>
          ))}
        </div>

        {supplierTab === 'deliveries' ? (
          <div className="p-4 sm:p-6">
            {loadingGateEntries ? (
              <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-emerald-500" /></div>
            ) : gateEntries.length === 0 ? (
              <div className="py-12 text-center">
                <Truck size={36} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
                <p className="text-sm text-slate-500">{t('noDeliveries') || 'No gate entries found for this supplier.'}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {gateEntries.map((ge: any) => (
                    <li key={ge.id} className="p-4 flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-800 dark:text-white">{ge.vehicleNumber}</span>
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                            ge.status === 'exited' ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            : ge.status === 'weighed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                          }`}>{ge.status}</span>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">{ge.direction}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {ge.entryNumber} · {new Date(ge.enteredAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {ge.materialDescription && ` · ${ge.materialDescription}`}
                        </p>
                        {ge.weighbridgeEntries?.length > 0 && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                            {ge.weighbridgeEntries.reduce((sum: number, w: any) => sum + (w.netWeightKg || 0), 0).toLocaleString('en-IN')} kg weighed
                          </p>
                        )}
                      </div>
                      {ge.hamaliAmount > 0 && (
                        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
                          Hamali ₹{Number(ge.hamaliAmount).toLocaleString('en-IN')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
        <div>

        {/* Bill photos */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
              {t('billPhotosTitle')}
            </h3>
            <label className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${uploadingFor === 'general' ? 'bg-slate-100 text-slate-400 dark:bg-slate-800' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20'}`}>
              {uploadingFor === 'general' ? (
                <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <UploadCloud size={14} />
              )}
              {t('uploadBillBtn')}
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => handleUploadBill(e)}
                disabled={uploadingFor !== null}
              />
            </label>
          </div>
          {generalDocuments.length === 0 ? (
            <p className="text-xs text-slate-500">{t('noBillPhotos')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {generalDocuments.map((doc, i) => {
                // Prefer the saved file name; strip the folder prefix so a
                // path like "supplier-docs/…-IMG_1234.jpg" shows just the
                // human-readable name. Fall back to a positional label
                // ("Bill 1/2/3") for legacy uploads that never captured a
                // name — better than every chip reading the same date.
                const rawName = (doc.name || '').split(/[\\/]/).pop() || '';
                const shownName = rawName || `${t('billPhotoLabel') || 'Bill'} ${i + 1}`;
                const dateShort = new Date(doc.uploadedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                return (
                  <div
                    key={doc.id}
                    className="flex items-center gap-2 pl-3 pr-1.5 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 max-w-full"
                    title={`${shownName} · ${dateShort}`}
                  >
                    <FileImage size={14} className="text-slate-400 shrink-0" />
                    <div className="min-w-0 flex flex-col leading-tight">
                      <span className="truncate max-w-[160px]">{shownName}</span>
                      <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">{dateShort}</span>
                    </div>
                    <button
                      onClick={() => setViewingDoc({ url: doc.url, label: shownName })}
                      title={t('viewBillTitle')}
                      className="p-1 rounded text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                    >
                      <Eye size={14} />
                    </button>
                    {deleteArmedId === doc.id ? (
                      // Second click confirms; the label makes it obvious. Auto-
                      // disarms after 4s (see the useEffect on deleteArmedId).
                      <button
                        onClick={() => handleDeleteBill(doc.id)}
                        title={t('deleteBillTitle')}
                        className="px-2 py-1 rounded bg-red-500 hover:bg-red-600 text-white text-[10px] font-black uppercase tracking-wider"
                      >
                        {t('deleteBillConfirm') || 'Delete?'}
                      </button>
                    ) : (
                      <button
                        onClick={() => setDeleteArmedId(doc.id)}
                        title={t('deleteBillTitle')}
                        className="p-1 rounded text-slate-500 hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Month-wise history */}
        <div className="p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
              {t('paymentHistoryTitle')}
            </h3>
            <ExportButton
              filename={`supplier-${(s?.name || 'history').toString().trim().replace(/\s+/g, '-').toLowerCase()}`}
              title={`${s?.name || t('supplierFallback')} — ${t('paymentHistoryTitle')}`}
              orientation="landscape"
              summary={[
                { label: t('purchasedHeader'), value: rupee(totals.totalPurchased) },
                { label: t('paidHeader'), value: rupee(totals.totalPaid), tone: 'positive' },
                { label: t('remainingHeader'), value: rupee(totals.remaining), tone: 'negative' },
              ]}
              columns={[
                { key: 'date', label: 'Date', type: 'date' },
                { key: 'type', label: 'Type' },
                { key: 'billNumber', label: 'Bill Number' },
                { key: 'amount', label: 'Amount', type: 'currency' },
                { key: 'paymentMethod', label: 'Payment Method' },
                { key: 'billTotalAmount', label: 'Bill Total', type: 'currency' },
                { key: 'billPaid', label: 'Bill Paid', type: 'currency' },
                { key: 'billRemaining', label: 'Bill Remaining', type: 'currency' },
                { key: 'billStatus', label: 'Status' },
                { key: 'note', label: 'Note' },
              ]}
              // Oldest-first for the exported document only — see LedgerView.tsx
              // for the same convention. Month-wise on-screen history below
              // stays newest-first; data.transactions itself is untouched.
              data={[...(data?.transactions || [])].reverse().map((tr: any) => ({
                date: tr.date,
                type: tr.type === 'payment' ? t('paymentType') : tr.type === 'opening_balance' ? (t('openingBalanceType') || 'Opening Balance') : t('purchaseType'),
                billNumber: tr.billNumber || '',
                amount: tr.amount,
                // Payment method only applies to an actual payment event — a
                // purchase row isn't itself a payment, so it stays blank.
                // `null` (not '') so exportToPDF's currency branch doesn't
                // coerce a missing value into a misleading "Rs 0".
                paymentMethod: tr.paymentMethod || null,
                billTotalAmount: tr.billTotalAmount ?? null,
                billPaid: tr.billPaid ?? null,
                billRemaining: tr.billRemaining ?? null,
                billStatus: tr.billStatus || null,
                note: tr.note || '',
              }))}
            />
          </div>

          <div className="relative mb-4">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={billSearch}
              onChange={(e) => setBillSearch(e.target.value)}
              placeholder={t('searchByBillNumberPlaceholder') || 'Search by bill number or description...'}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-1 focus:ring-emerald-500"
            />
            {billSearch && (
              <button
                onClick={() => setBillSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500"
                title={t('clearBtn')}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-500" />
            </div>
          ) : !data?.months?.length ? (
            <div className="py-12 text-center text-sm text-slate-500">
              {t('noTransactionsInPeriod')}
            </div>
          ) : billSearchNeedle && filteredMonths.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              {t('noBillsMatchSearch') || `No bills match "${billSearch}".`}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMonths.map((m: any) => {
                // Force every bucket open while actively searching — a match
                // sitting inside a collapsed older month would otherwise look
                // like a search miss. Reverts to the normal manual open/close
                // state the moment the search is cleared.
                const open = billSearchNeedle ? true : !!openMonths[m.month];
                return (
                  <div key={m.month} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 overflow-hidden">
                    <button
                      onClick={() => setOpenMonths((p) => ({ ...p, [m.month]: !open }))}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {open ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />}
                        <span className="font-bold text-slate-900 dark:text-white text-sm">{MONTH_LABEL(m.month, locale)}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs font-bold">
                        <span className="text-slate-500">{t('boughtPrefix', { amount: rupee(m.purchased) })}</span>
                        <span className="text-emerald-600 dark:text-emerald-400">{t('paidPrefix', { amount: rupee(m.paid) })}</span>
                      </div>
                    </button>

                    {open && (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
                        {m.items.map((it: any) => (
                          <div
                            key={it.id}
                            onClick={() => setViewingTransaction(it)}
                            className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                it.type === 'payment'
                                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600'
                                  : it.type === 'opening_balance'
                                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600'
                                    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'
                              }`}>
                                {it.type === 'payment' ? <Wallet size={14} /> : it.type === 'opening_balance' ? <IndianRupee size={14} /> : <ReceiptText size={14} />}
                              </div>
                              <div className="min-w-0">
                                {/* Description leads so the list reads like a real activity
                                    feed and is actually scannable/searchable — before Bill
                                    No. + Description were required, every row here just said
                                    the bare word "Purchase"/"Payment" and looked identical. */}
                                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                  {it.note || (it.type === 'payment' ? t('paymentType') : it.type === 'opening_balance' ? (t('openingBalanceType') || 'Opening Balance') : t('purchaseType'))}
                                </p>
                                <p className="text-xs text-slate-500 truncate flex items-center gap-1.5 flex-wrap mt-0.5">
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide ${
                                    it.type === 'payment'
                                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                                      : it.type === 'opening_balance'
                                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                  }`}>
                                    {it.type === 'payment' ? t('paymentType') : it.type === 'opening_balance' ? (t('openingBalanceType') || 'Opening Balance') : t('purchaseType')}
                                  </span>
                                  {it.billNumber && (
                                    <span className="font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded text-[10px]">
                                      #{it.billNumber}
                                    </span>
                                  )}
                                  <span>{fmtDate(it.date)}</span>
                                </p>
                                {it.dueDate && it.type !== 'payment' && (() => {
                                  // Credit-terms due date derived from supplier.creditDays.
                                  // Colour it by proximity: red overdue, amber in the next
                                  // 7 days, plain slate otherwise. This is the shopkeeper's
                                  // at-a-glance "when do I need to pay this" indicator.
                                  const due = new Date(it.dueDate);
                                  const now = Date.now();
                                  const daysLeft = Math.ceil((due.getTime() - now) / 86400000);
                                  const overdue = daysLeft < 0;
                                  const soon = !overdue && daysLeft <= 7;
                                  return (
                                    <span className={`inline-flex items-center gap-1 mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                      overdue
                                        ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300'
                                        : soon
                                          ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                    }`}>
                                      <Calendar size={10} />
                                      Due {fmtDate(due)}
                                      {overdue
                                        ? ` · ${Math.abs(daysLeft)}d overdue`
                                        : daysLeft === 0
                                          ? ' · today'
                                          : ` · in ${daysLeft}d`}
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-3">
                              {it.type !== 'payment' && (() => {
                                const linked = documents.find((d) => d.transactionId === it.id);
                                return linked ? (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setViewingDoc({ url: linked.url, label: t('billPhotoLabel') }); }}
                                    title={t('viewBillTitle')}
                                    className="p-1.5 rounded-lg text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                                  >
                                    <FileImage size={15} />
                                  </button>
                                ) : (
                                  <label
                                    onClick={(e) => e.stopPropagation()}
                                    title={t('attachBillTitle')}
                                    className={`p-1.5 rounded-lg cursor-pointer ${uploadingFor === it.id ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10'}`}
                                  >
                                    {uploadingFor === it.id ? (
                                      <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      <UploadCloud size={15} />
                                    )}
                                    <input
                                      type="file"
                                      accept="image/*,application/pdf"
                                      multiple
                                      className="hidden"
                                      onChange={(e) => handleUploadBill(e, it.id)}
                                      disabled={uploadingFor !== null}
                                    />
                                  </label>
                                );
                              })()}
                              <span className={`text-sm font-black ${
                                it.type === 'payment'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-slate-900 dark:text-white'
                              }`}>
                                {it.type === 'payment' ? '−' : '+'}{rupee(it.amount)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </div>
        )}
        </div>
      </div>

      {viewingDoc && (
        <DocumentViewerModal url={viewingDoc.url} label={viewingDoc.label} onClose={() => setViewingDoc(null)} />
      )}

      {viewingTransaction && (
        <TransactionDetailModal
          supplierId={supplierId}
          supplierName={s?.name || ''}
          transaction={viewingTransaction}
          // Pass EVERY photo linked to this transaction — the shopkeeper can
          // now upload multiple pages of one bill (front/back/pages), so the
          // detail modal needs to see them all, not just the first.
          billPhotos={documents.filter((d) => d.transactionId === viewingTransaction.id)}
          onViewDoc={(doc) => setViewingDoc(doc)}
          onClose={() => setViewingTransaction(null)}
          onSaved={() => { load(); onChanged(); }}
        />
      )}

      <ConfirmPasswordModal
        open={showDeleteConfirm}
        itemLabel="supplier"
        onConfirm={handleDeleteSupplier}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

function TransactionDetailModal({ supplierId, supplierName, transaction, billPhotos, onViewDoc, onClose, onSaved }: {
  supplierId: string;
  supplierName: string;
  transaction: { id: string; type: string; amount: number; note: string; billNumber: string; date: string };
  // Every photo attached to THIS transaction (front/back/pages). Sorted
  // upload-order by the parent so the first upload appears first.
  billPhotos: { id: string; url: string; uploadedAt: string; name?: string }[];
  onViewDoc: (doc: { url: string; label: string }) => void;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const t = useTranslations('Suppliers');
  const { profile } = useBusinessStore();
  const isMill = isMillBillingPackage(profile?.packageType);
  const [detail, setDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  // Inline amount edit — correct an imported/typed bill whose total was off.
  const [editing, setEditing] = useState(false);
  const [editAmount, setEditAmount] = useState(String(transaction.amount || ''));
  const [savingEdit, setSavingEdit] = useState(false);
  const [displayAmount, setDisplayAmount] = useState(transaction.amount);

  async function saveEdit() {
    const amt = parseFloat(editAmount.replace(/[₹,\s]/g, ''));
    if (!isFinite(amt) || amt <= 0) { alert(t('enterAmountGreaterThanZero') || 'Enter a valid amount'); return; }
    setSavingEdit(true);
    try {
      await api.patch(`/suppliers/${supplierId}/transactions/${transaction.id}`, { amount: amt });
      setDisplayAmount(amt);
      setEditing(false);
      onSaved?.();
    } catch (e: any) {
      alert(e?.response?.data?.detail || e?.message || (t('failedToSave') || 'Failed to save'));
    } finally {
      setSavingEdit(false);
    }
  }

  // Delete a whole purchase bill (invoice) from the supplier's Payment History.
  // Shopkeeper picks whether stock added by this bill is also reversed, then
  // the DELETE hits /purchases/{id} (same endpoint the Purchases page uses),
  // which snapshots the invoice to the Recycle Bin. If a shopkeeper later
  // restores it from Recycle Bin, stock is put back only if it was reversed
  // here — mirror of the delete direction.
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteReverseStock, setDeleteReverseStock] = useState(true);
  const [deletingBill, setDeletingBill] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  async function confirmDeleteBill() {
    const invoiceId = detail?.invoice?.id;
    if (!invoiceId) return;
    setDeletingBill(true);
    setDeleteError('');
    try {
      await api.delete(`/purchases/${invoiceId}`, { data: { reverseStock: deleteReverseStock } });
      setShowDeleteConfirm(false);
      onSaved?.();
      onClose();
    } catch (e: any) {
      const body = e?.response?.data;
      if (body?.code === 'REVERSAL_BLOCKED') {
        setDeleteError(body.error || 'Some stock from this bill has already been sold — untick the reverse-stock option to still delete the invoice.');
      } else {
        setDeleteError(body?.error || e?.message || (t('failedToDelete') || 'Failed to delete'));
      }
    } finally {
      setDeletingBill(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(`/suppliers/${supplierId}/transactions/${transaction.id}`)
      .then((res) => { if (!cancelled) setDetail(res.data); })
      .catch((e) => console.error('Failed to load transaction detail', e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [supplierId, transaction.id]);

  const items = detail?.invoice?.items || [];
  const isPayment = transaction.type === 'payment';

  async function handleDownload() {
    setDownloading(true);
    try {
      await generatePurchaseBillPDF({
        shop: {
          name: profile.shopName || 'Vyapar Sarthi',
          address: profile.address || null,
          mobile: profile.mobile || null,
          gst: profile.gst || null,
          pan: profile.pan || null,
        },
        supplierName,
        bill: {
          type: transaction.type,
          amount: transaction.amount,
          note: transaction.note,
          billNumber: detail?.invoice?.invoiceNumber || transaction.billNumber,
          date: transaction.date,
          dueDate: detail?.transaction?.dueDate || null,
        },
        items,
        // Prefer the linked PurchaseInvoice's own invoiceNumber, then the
        // transaction's billNumber, before ever falling back to a raw
        // internal id — a filename like "purchase-4c0030bc-....pdf" isn't
        // something a shopkeeper can recognize later in a downloads folder.
        filename: `${isPayment ? 'payment' : 'purchase'}-${(detail?.invoice?.invoiceNumber || transaction.billNumber || transaction.id).toString().trim().replace(/\s+/g, '-').toLowerCase()}`,
      });
    } catch (e) {
      console.error('Failed to generate bill PDF', e);
      alert(t('failedToGenerateStatement') || 'Failed to generate the PDF.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-xl flex flex-col overflow-hidden max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {transaction.note || (isPayment ? t('paymentType') : t('purchaseType'))}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide ${isPayment ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'}`}>
                {isPayment ? t('paymentType') : t('purchaseType')}
              </span>
              {transaction.billNumber && <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">#{transaction.billNumber}</span>}
              <span>{fmtDate(transaction.date)}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {isPayment ? t('paidHeader') : t('purchasedHeader')}
              </span>
              {editing ? (
                <div className="flex items-center gap-1.5">
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                    <input
                      type="number" autoFocus value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className="w-28 h-9 pl-6 pr-2 rounded-lg text-sm font-bold text-right border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                    />
                  </div>
                  <button onClick={saveEdit} disabled={savingEdit} className="h-9 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-60">
                    {savingEdit ? <Loader2 size={13} className="animate-spin" /> : (t('saveBtn') || 'Save')}
                  </button>
                  <button onClick={() => { setEditing(false); setEditAmount(String(displayAmount || '')); }} className="h-9 px-2 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-white text-xs font-bold">
                    {t('cancelBtn') || 'Cancel'}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className={`text-xl font-black ${isPayment ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                    {isPayment ? '−' : '+'}{rupee(displayAmount)}
                  </span>
                  <button
                    onClick={() => { setEditAmount(String(displayAmount || '')); setEditing(true); }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    title={t('editAmountTitle') || 'Edit amount'}
                  >
                    <Pencil size={15} />
                  </button>
                </div>
              )}
            </div>
            {editing && (
              <p className="text-[10px] text-slate-500 mt-2">{t('editAmountHint') || 'Correcting the amount updates this supplier’s outstanding and the purchase total.'}</p>
            )}
          </div>

          {billPhotos.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {billPhotos.length > 1
                  ? (t('billPhotosCount', { count: billPhotos.length }) || `${billPhotos.length} attached bill photos`)
                  : (t('viewBillTitle') || 'View attached bill photo')}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {billPhotos.map((p, i) => {
                  const rawName = (p.name || '').split(/[\\/]/).pop() || '';
                  const shownName = rawName || `${t('billPhotoLabel') || 'Bill'}${billPhotos.length > 1 ? ` ${i + 1}` : ''}`;
                  return (
                  <button
                    key={p.id}
                    onClick={() => onViewDoc({ url: p.url, label: shownName })}
                    className="group relative flex flex-col items-center gap-1 p-2 rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors overflow-hidden"
                    title={shownName}
                  >
                    {/* Thumbnail — a real preview for image URLs, a plain icon
                        for PDFs (loading a PDF into an <img> silently blanks). */}
                    {/\.pdf(\?|$)/i.test(p.url) ? (
                      <div className="w-full aspect-square flex items-center justify-center text-indigo-500">
                        <FileImage size={28} />
                      </div>
                    ) : (
                      <img src={p.url} alt="" className="w-full aspect-square object-cover rounded-lg" />
                    )}
                    <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 truncate w-full text-center px-1">{shownName}</span>
                  </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
              {t('itemsHeader') || 'Products'}
            </h3>
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-xs text-slate-500 italic">
                {t('noItemBreakdown') || 'No itemised product breakdown is available for this entry.'}
              </p>
            ) : (
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold">{t('product') || 'Product'}</th>
                      <th className="px-3 py-2 text-right font-bold">{t('qty') || 'Qty'}</th>
                      <th className="px-3 py-2 text-right font-bold">{t('costPrice') || 'Cost'}</th>
                      <th className="px-3 py-2 text-right font-bold">{t('totalUpper') || 'Total'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {items.map((it: any, i: number) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">
                          {it.productName}{it.variant ? <span className="text-slate-400"> · {it.variant}</span> : null}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{it.quantity}{it.unit ? ` ${it.unit}` : ''}</td>
                        <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{rupee(it.cost)}</td>
                        <td className="px-3 py-2 text-right font-bold text-slate-900 dark:text-white">{rupee(it.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0 flex gap-2">
          <button
            onClick={handleDownload}
            disabled={downloading || loading}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-60"
          >
            {downloading ? <Loader2 size={16} className="animate-spin" /> : <ReceiptText size={16} />}
            {t('downloadBillPdfBtn') || 'Download PDF'}
          </button>
          {!isPayment && detail?.invoice?.id && (
            <button
              onClick={() => { setDeleteReverseStock(true); setDeleteError(''); setShowDeleteConfirm(true); }}
              disabled={loading}
              className="flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-red-700 dark:text-red-400 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-60"
              title={t('deleteBillBtn') || 'Delete Bill'}
            >
              <Trash2 size={16} />
              {t('deleteBillBtn') || 'Delete Bill'}
            </button>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center text-red-600 dark:text-red-400">
                <AlertTriangle size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {t('deleteBillTitle') || 'Delete this bill?'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t('deleteBillSubtitle') || 'The invoice and its supplier ledger entry will be removed. You can restore it from the Recycle Bin.'}
                </p>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteReverseStock}
                  onChange={(e) => setDeleteReverseStock(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-red-600"
                />
                <div className="text-sm">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {isMill
                      ? 'Also remove the raw material lot this purchase created'
                      : (t('reverseStockLabel') || 'Also reverse the stock this purchase added')}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {isMill
                      ? (deleteReverseStock
                          ? 'The raw material lot created by this purchase will be deleted. Blocked if that lot has already been used in a production batch.'
                          : 'Raw material lot stays as-is — only the invoice and its supplier ledger entry are removed.')
                      : (deleteReverseStock
                          ? (t('reverseStockOnHint') || 'Stock added by this purchase will be subtracted back out. Blocked if that stock has already been sold — uncheck to still delete the invoice.')
                          : (t('reverseStockOffHint') || 'Stock stays exactly as it is now — only the invoice and its supplier balance/ledger entry are removed.'))}
                  </div>
                </div>
              </label>
              {deleteError && (
                <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-3">
                  {deleteError}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deletingBill}
                className="px-4 py-2 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
              >
                {t('cancelBtn') || 'Cancel'}
              </button>
              <button
                onClick={confirmDeleteBill}
                disabled={deletingBill}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-red-600 hover:bg-red-700 text-white disabled:opacity-60"
              >
                {deletingBill ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {t('deleteBtn') || 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TransactionForm({ supplierId, mode, remaining, creditLimit, dueBills, onDone, onCancel }: {
  supplierId: string; mode: 'purchase' | 'payment'; remaining: number; creditLimit: number;
  dueBills: DueBill[]; onDone: () => void; onCancel: () => void;
}) {
  const t = useTranslations('Suppliers');
  const [amount, setAmount] = useState('');
  const [paid, setPaid] = useState('');
  const [date, setDate] = useState(toInputDate(new Date()));
  const [billNumber, setBillNumber] = useState('');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Card'>('Cash');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Payment mode: pick a specific open bill so the amount + "currently due"
  // reflect THAT bill instead of the supplier's whole balance. Purely a UX
  // convenience — the payment still settles FIFO against the account like
  // before; selecting a bill just pre-fills amount/billNumber for it.
  const [billSearch, setBillSearch] = useState('');
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const selectedBill = dueBills.find((b) => b.id === selectedBillId) || null;
  const filteredBills = dueBills.filter((b) => {
    const needle = billSearch.trim().toLowerCase();
    if (!needle) return true;
    return (b.billNumber || '').toLowerCase().includes(needle) || String(b.remaining).includes(needle);
  });

  function selectBill(b: DueBill) {
    setSelectedBillId(b.id);
    setAmount(String(b.remaining));
    setBillNumber(b.billNumber || '');
  }
  function clearBillSelection() {
    setSelectedBillId(null);
    setBillSearch('');
  }

  const amountNum = parseFloat(amount) || 0;
  const paidNum = parseFloat(paid) || 0;
  // Soft warning only — the shop may legitimately choose to go over with a
  // trusted supplier, so this never blocks submission.
  const projectedOutstanding = mode === 'purchase' ? remaining + Math.max(0, amountNum - paidNum) : remaining;
  const overLimitBy = creditLimit > 0 ? projectedOutstanding - creditLimit : 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billNumber.trim()) { setError(t('billNumberRequiredError')); return; }
    if (!note.trim()) { setError(t('descriptionRequiredError')); return; }
    if (amountNum <= 0) { setError(t('enterAmountGreaterThanZero')); return; }
    if (mode === 'purchase' && paidNum > amountNum) {
      setError(t('paidExceedsAmount'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post(`/suppliers/${supplierId}/transactions`, {
        type: mode,
        amount: amountNum,
        ...(mode === 'purchase' ? { paidAmount: paidNum } : {}),
        ...(mode === 'payment' || paidNum > 0 ? { paymentMethod } : {}),
        date,
        billNumber,
        note,
      });
      onDone();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || t('failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="px-4 py-4 bg-slate-100 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 space-y-3 shrink-0 animate-in slide-in-from-top-2"
    >
      {mode === 'payment' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-400">{t('payAgainstBillLabel')}</label>
            {selectedBill && (
              <button type="button" onClick={clearBillSelection} className="text-xs font-bold text-slate-400 hover:text-red-500 transition-colors">
                {t('clearSelectionBtn')}
              </button>
            )}
          </div>

          {selectedBill ? (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {selectedBill.billNumber ? `#${selectedBill.billNumber}` : t('purchaseType')}
                </p>
                <p className="text-xs text-slate-500">
                  {fmtDate(selectedBill.date)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('currentlyDueLabel')}</p>
                <p className="text-sm font-black text-red-600 dark:text-red-400">{rupee(selectedBill.remaining)}</p>
              </div>
            </div>
          ) : dueBills.length === 0 ? (
            <p className="text-xs text-slate-500">{t('noDueBills')}</p>
          ) : (
            <>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={billSearch}
                  onChange={(e) => setBillSearch(e.target.value)}
                  placeholder={t('searchBillPlaceholder')}
                  className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              {filteredBills.length > 0 ? (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                  {filteredBills.map((b) => (
                    <button
                      type="button"
                      key={b.id}
                      onClick={() => selectBill(b)}
                      className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {b.billNumber ? `#${b.billNumber}` : t('purchaseType')}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {b.date ? new Date(b.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                        </p>
                      </div>
                      <span className="text-xs font-black text-red-600 dark:text-red-400 shrink-0">{rupee(b.remaining)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 px-1">{t('noDueBills')}</p>
              )}
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label={mode === 'purchase' ? t('purchaseAmountLabel') : t('paymentAmountLabel')}>
          <input
            type="number" min="0" step="0.01" autoFocus
            value={amount} onChange={(e) => setAmount(e.target.value)}
            className={inputCls} placeholder="0"
          />
        </Field>
        {mode === 'purchase' ? (
          <Field label={t('paidNowLabel')}>
            <input
              type="number" min="0" step="0.01"
              value={paid} onChange={(e) => setPaid(e.target.value)}
              className={inputCls} placeholder="0"
            />
          </Field>
        ) : (
          <Field label={t('currentlyDueLabel')}>
            <div className="h-10 flex items-center px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-bold text-red-600">
              {rupee(selectedBill ? selectedBill.remaining : remaining)}
            </div>
          </Field>
        )}
        <Field label={t('dateLabel')}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label={t('billNoLabel')} required>
          <input required value={billNumber} onChange={(e) => setBillNumber(e.target.value)} className={inputCls} placeholder={t('billNoPlaceholder')} />
        </Field>
      </div>

      {(mode === 'payment' || paidNum > 0) && (
        <Field label={t('paymentMethodLabel') || 'Payment Method'}>
          <div className="flex gap-1.5 flex-wrap">
            {(['Cash', 'UPI', 'Card'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPaymentMethod(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                  paymentMethod === m
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {m === 'Cash' ? (t('paymentMethodCash') || 'Cash') : m === 'UPI' ? (t('paymentMethodUpi') || 'UPI') : (t('paymentMethodCard') || 'Card')}
              </button>
            ))}
          </div>
        </Field>
      )}

      <Field label={t('descriptionLabel')} required>
        <input
          required
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={inputCls}
          placeholder={mode === 'purchase' ? t('descriptionPurchasePlaceholder') : t('descriptionPaymentPlaceholder')}
        />
      </Field>

      {mode === 'purchase' && amountNum > 0 && (
        <p className="text-xs font-bold text-slate-500">
          {t('remainingAfterPurchaseLabel')}{' '}
          <span className="text-red-600 dark:text-red-400">{rupee(Math.max(0, amountNum - paidNum))}</span>
        </p>
      )}

      {mode === 'purchase' && amountNum > 0 && overLimitBy > 0 && (
        <p className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-3 py-2">
          <AlertTriangle size={14} /> {t('creditLimitExceededBy', { amount: rupee(overLimitBy) })}
        </p>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 font-medium flex items-center gap-2">
          <AlertCircle size={15} /> {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-50 flex items-center gap-2 ${
            mode === 'purchase' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'
          }`}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <IndianRupee size={16} />}
          {mode === 'purchase' ? t('savePurchaseBtn') : t('savePaymentBtn')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-5 py-2.5 rounded-xl text-sm font-bold border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 transition-colors"
        >
          {t('cancelBtn')}
        </button>
      </div>
    </form>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: 'slate' | 'emerald' | 'red' | 'amber' }) {
  const color = {
    slate: 'text-slate-900 dark:text-white',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    red: 'text-red-600 dark:text-red-400',
    amber: 'text-amber-600 dark:text-amber-400',
  };
  return (
    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-lg font-black tracking-tight ${color[tone]}`}>{value}</p>
    </div>
  );
}

const inputCls =
  'w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-emerald-500 transition-all';

function Field({ label, hint, required, children }: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
        {hint && <span className="ml-1.5 font-medium text-slate-400">({hint})</span>}
      </label>
      {children}
    </div>
  );
}
