'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  Search, Loader2, Phone, X, Plus, Mail, MapPin, Truck,
  IndianRupee, TrendingUp, Wallet, AlertCircle, Calendar,
  ChevronDown, ChevronRight, CheckCircle2, ReceiptText,
  UploadCloud, Eye, Trash2, FileImage, Pencil, User, AlertTriangle,
} from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import DocumentViewerModal from '@/components/DocumentViewerModal';
import { ExportButton } from '@/lib/hooks/useExport';

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
        />
        <StatCard
          label={t('remainingToPay')}
          value={rupee(summary.totalRemaining)}
          icon={<AlertCircle size={18} className="text-red-500" />}
          tone="red"
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
            <table className="w-full text-left min-w-[720px]">
              <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-200 dark:border-slate-800">
                <tr>
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
    </div>
  );
}

/* ─── Small presentational pieces ─────────────────────────────────────────── */

function StatCard({ label, value, subtitle, icon, tone }: {
  label: string; value: string; subtitle?: string; icon: React.ReactNode;
  tone: 'blue' | 'emerald' | 'red' | 'amber';
}) {
  const ring: Record<string, string> = {
    blue: 'border-b-blue-500/40',
    emerald: 'border-b-emerald-500/40',
    red: 'border-b-red-500/40',
    amber: 'border-b-amber-500/40',
  };
  return (
    <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 border-b-4 ${ring[tone]} rounded-2xl p-4`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-tight">{label}</p>
        {icon}
      </div>
      <p className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tighter">{value}</p>
      {subtitle && <p className="text-[11px] font-bold text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
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
    creditLimit: '', creditDays: '',
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
        openingBalance: '0',
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
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState({ from: '', to: '' });
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<'none' | 'purchase' | 'payment'>('none');
  // 'general' = the top-level Bill Photos uploader; a transaction id = that
  // specific purchase row's inline uploader. Keyed so uploading one doesn't
  // show every row as busy.
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<{ url: string; label: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteSupplier() {
    // Two-step delete: the server refuses (409) when the supplier has any
    // transaction or purchase-invoice history, and returns a `code: HAS_HISTORY`
    // signal. On that, we ask a second time whether to purge everything and
    // retry with ?cascade=true — otherwise the raw Prisma FK error would leak
    // into the alert (that's the "supplier_transactions_supplier_id_fkey"
    // message the user actually saw).
    if (!s) return;
    if (!confirm(`Delete supplier "${s.name}"?\n\nThis cannot be undone.`)) return;
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
        if (!ok) { setDeleting(false); return; }
        try {
          await api.delete(`/suppliers/${supplierId}?cascade=true`);
          onChanged();
          onClose();
        } catch (err2: any) {
          alert(err2?.response?.data?.error || err2?.message || 'Failed to delete supplier.');
        }
      } else {
        alert(body?.error || err?.message || 'Failed to delete supplier.');
      }
    } finally {
      setDeleting(false);
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

  const s = data?.supplier;
  const totals = data?.totals || { totalPurchased: 0, totalPaid: 0, remaining: 0, dueInvoicesCount: 0, overdueAmount: 0 };
  // transactionId, when present, ties a bill photo to one specific purchase
  // row instead of leaving it as a general, unlinked supplier document.
  const documents: { id: string; url: string; uploadedAt: string; transactionId?: string }[] = s?.documents || [];
  // The generic Bill Photos strip is for documents not already tied to one
  // purchase row — those are shown inline on their row instead, so a bill
  // doesn't appear twice.
  const generalDocuments = documents.filter((d) => !d.transactionId);

  async function handleUploadBill(e: React.ChangeEvent<HTMLInputElement>, transactionId?: string) {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    e.target.value = '';
    setUploadingFor(transactionId || 'general');
    const body = new FormData();
    body.append('file', file);
    body.append('folder', 'supplier-docs');
    try {
      const res = await api.post('/upload', body);
      if (res.data.url) {
        const next = [...documents, {
          id: crypto.randomUUID(),
          url: res.data.url,
          uploadedAt: new Date().toISOString(),
          ...(transactionId ? { transactionId } : {}),
        }];
        await api.patch(`/suppliers/${supplierId}`, { documents: next });
        setData((prev: any) => ({ ...prev, supplier: { ...prev.supplier, documents: next } }));
      }
    } catch (err) {
      console.error(err);
      alert(t('uploadFailed'));
    } finally {
      setUploadingFor(null);
    }
  }

  async function handleDeleteBill(id: string) {
    if (!confirm(t('confirmRemoveBill'))) return;
    const next = documents.filter((d) => d.id !== id);
    try {
      await api.patch(`/suppliers/${supplierId}`, { documents: next });
      setData((prev: any) => ({ ...prev, supplier: { ...prev.supplier, documents: next } }));
    } catch (err) {
      console.error(err);
      alert(t('failedToDeleteBill'));
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
              onClick={handleDeleteSupplier}
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
            onDone={() => { setMode('none'); load(); onChanged(); }}
            onCancel={() => setMode('none')}
          />
        )}

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
              {generalDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-2 pl-3 pr-1.5 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300"
                >
                  <FileImage size={14} className="text-slate-400 shrink-0" />
                  <span>
                    {new Date(doc.uploadedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                  <button
                    onClick={() => setViewingDoc({ url: doc.url, label: t('billPhotoLabel') })}
                    title={t('viewBillTitle')}
                    className="p-1 rounded text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    onClick={() => handleDeleteBill(doc.id)}
                    title={t('deleteBillTitle')}
                    className="p-1 rounded text-slate-500 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Month-wise history */}
        <div className="p-4 sm:p-6">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
            {t('paymentHistoryTitle')}
          </h3>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-500" />
            </div>
          ) : !data?.months?.length ? (
            <div className="py-12 text-center text-sm text-slate-500">
              {t('noTransactionsInPeriod')}
            </div>
          ) : (
            <div className="space-y-3">
              {data.months.map((m: any) => {
                const open = !!openMonths[m.month];
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
                          <div key={it.id} className="flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                it.type === 'payment'
                                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600'
                                  : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'
                              }`}>
                                {it.type === 'payment' ? <Wallet size={14} /> : <ReceiptText size={14} />}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                  {it.type === 'payment' ? t('paymentType') : t('purchaseType')}
                                  {it.billNumber && (
                                    <span className="ml-2 text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">
                                      {it.billNumber}
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-slate-500 truncate">
                                  {it.date ? new Date(it.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                                  {it.note ? ` · ${it.note}` : ''}
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
                                      Due {due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
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
                                    onClick={() => setViewingDoc({ url: linked.url, label: t('billPhotoLabel') })}
                                    title={t('viewBillTitle')}
                                    className="p-1.5 rounded-lg text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                                  >
                                    <FileImage size={15} />
                                  </button>
                                ) : (
                                  <label
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
      </div>

      {viewingDoc && (
        <DocumentViewerModal url={viewingDoc.url} label={viewingDoc.label} onClose={() => setViewingDoc(null)} />
      )}
    </div>
  );
}

function TransactionForm({ supplierId, mode, remaining, creditLimit, onDone, onCancel }: {
  supplierId: string; mode: 'purchase' | 'payment'; remaining: number; creditLimit: number;
  onDone: () => void; onCancel: () => void;
}) {
  const t = useTranslations('Suppliers');
  const [amount, setAmount] = useState('');
  const [paid, setPaid] = useState('');
  const [date, setDate] = useState(toInputDate(new Date()));
  const [billNumber, setBillNumber] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const amountNum = parseFloat(amount) || 0;
  const paidNum = parseFloat(paid) || 0;
  // Soft warning only — the shop may legitimately choose to go over with a
  // trusted supplier, so this never blocks submission.
  const projectedOutstanding = mode === 'purchase' ? remaining + Math.max(0, amountNum - paidNum) : remaining;
  const overLimitBy = creditLimit > 0 ? projectedOutstanding - creditLimit : 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
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
              {rupee(remaining)}
            </div>
          </Field>
        )}
        <Field label={t('dateLabel')}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label={t('billNoLabel')} hint={t('optionalTag')}>
          <input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} className={inputCls} />
        </Field>
      </div>

      <Field label={t('noteLabel')} hint={t('optionalTag')}>
        <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder={t('notePlaceholder')} />
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
