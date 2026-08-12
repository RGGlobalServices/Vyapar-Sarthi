'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, Search, Calendar, Loader2, Users } from 'lucide-react';
import api from '@/lib/api';
import TransactionDetailModal from './TransactionDetailModal';

const rupee = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

type RangePreset = 'all' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';

/** Local YYYY-MM-DD (avoids the UTC shift toISOString would introduce). */
const toInputDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function presetRange(preset: RangePreset): { from: string; to: string } {
  const now = new Date();
  if (preset === 'thisMonth') {
    return { from: toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: toInputDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  }
  if (preset === 'lastMonth') {
    return { from: toInputDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: toInputDate(new Date(now.getFullYear(), now.getMonth(), 0)) };
  }
  if (preset === 'thisYear') {
    return { from: toInputDate(new Date(now.getFullYear(), 0, 1)), to: toInputDate(new Date(now.getFullYear(), 11, 31)) };
  }
  return { from: '', to: '' };
}

/**
 * Every pending bill / every payment across ALL parties (or ALL retail
 * Udhar customers), opened by clicking the Total Outstanding / Total
 * Collected stat card — the Party/Customer equivalent of Suppliers'
 * SupplierRollupView (suppliers/page.tsx). Shared (not local to one page)
 * because it's used from three call sites: /party's Wholesale Parties tab,
 * /party's Customers/Udhar tab, and Dukan/Vyapar's /customers page.
 */
export default function CustomerRollupView({
  entityType,
  mode,
  onBack,
  onOpenEntity,
}: {
  entityType: 'party' | 'customer';
  mode: 'pending' | 'paid';
  onBack: () => void;
  onOpenEntity: (entityId: string) => void;
}) {
  const t = useTranslations('LedgerView');
  const isPending = mode === 'pending';
  const entityLabel = entityType === 'party' ? (t('partyLabel') || 'Party') : (t('customerLabel') || 'Customer');

  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<{ totalPending?: number; billCount?: number; totalPaid?: number; paymentCount?: number }>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState<RangePreset>('all');
  const [range, setRange] = useState({ from: '', to: '' });
  const [viewing, setViewing] = useState<{ entityId: string; entityName: string; transaction: any } | null>(null);

  const applyPreset = (p: RangePreset) => {
    setPreset(p);
    if (p !== 'custom') setRange(presetRange(p));
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ entityType });
      if (range.from) params.set('from', range.from);
      if (range.to) params.set('to', range.to);
      if (search.trim()) params.set('search', search.trim());
      const res = await api.get(`/crm/${isPending ? 'pending-bills' : 'payments-all'}?${params.toString()}`);
      setRows(isPending ? (res.data?.bills || []) : (res.data?.payments || []));
      setSummary(res.data?.summary || {});
    } catch (e) {
      console.error('Failed to load CRM rollup', e);
    } finally {
      setLoading(false);
    }
  }, [entityType, isPending, range.from, range.to, search]);

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <div className="fixed inset-0 z-[60] bg-slate-50 dark:bg-slate-950 overflow-y-auto">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
        >
          <ChevronLeft size={18} /> {t('backBtn') || 'Back'}
        </button>

        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {isPending
              ? (t('allPendingBillsTitle', { entity: entityLabel }) || `All Pending ${entityLabel} Bills`)
              : (t('allPaymentsTitle', { entity: entityLabel }) || `All ${entityLabel} Payments Collected`)}
          </h1>
          <p className="text-slate-500 text-sm font-medium">
            {isPending
              ? (t('allPendingBillsSubtitle', { entity: entityLabel.toLowerCase() }) || `Every outstanding bill across every ${entityLabel.toLowerCase()}.`)
              : (t('allPaymentsSubtitle', { entity: entityLabel.toLowerCase() }) || `Every payment collected from every ${entityLabel.toLowerCase()}.`)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 max-w-md">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
              {isPending ? (t('totalOutstanding') || 'Total Outstanding') : (t('totalCollected') || 'Total Collected')}
            </p>
            <p className={`text-xl font-black ${isPending ? 'text-orange-600 dark:text-orange-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
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

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchRollupPlaceholder', { entity: entityLabel.toLowerCase() }) || `Search by ${entityLabel.toLowerCase()} name, mobile, or invoice/bill number...`}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mr-1">
              <Calendar size={13} /> {t('periodLabel') || 'Period'}
            </span>
            {([
              ['all', t('rangeAllTime') || 'All Time'],
              ['thisMonth', t('rangeThisMonth') || 'This Month'],
              ['lastMonth', t('rangeLastMonth') || 'Last Month'],
              ['thisYear', t('rangeThisYear') || 'This Year'],
              ['custom', t('rangeCustom') || 'Custom'],
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
                <span className="text-xs text-slate-400">{t('toSeparator') || 'to'}</span>
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
              <Users size={40} className="text-slate-300 dark:text-slate-700 mx-auto mb-3" />
              <p className="text-slate-600 dark:text-slate-300 font-bold">
                {isPending ? (t('noPendingBillsFound') || 'No pending bills found') : (t('noPaymentsFound') || 'No payments found')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[760px]">
                <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-5 py-3">{entityLabel}</th>
                    <th className="px-5 py-3">{t('billNumberHeader') || 'Bill No'}</th>
                    <th className="px-5 py-3">{isPending ? (t('billDateHeader') || 'Bill Date') : (t('dateHeader') || 'Date')}</th>
                    {isPending && <th className="px-5 py-3">GST</th>}
                    {isPending ? (
                      <th className="px-5 py-3 text-right">{t('remainingHeader') || 'Remaining'}</th>
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
                        entityId: r.entityId,
                        entityName: r.entityName,
                        transaction: {
                          id: r.id,
                          type: isPending ? 'udhar' : 'payment',
                          amount: isPending ? r.originalAmount : r.amount,
                          note: r.note || '',
                          billNumber: r.billNumber || '',
                          date: r.date,
                          gstPercent: null,
                          gstAmount: null,
                          items: [],
                        },
                      })}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); onOpenEntity(r.entityId); }}
                          className="text-left font-bold text-slate-900 dark:text-white text-sm hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline"
                        >
                          {r.entityName}
                        </button>
                        <p className="text-xs text-slate-500">{r.entityMobile || '-'}</p>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                        {r.billNumber || '-'}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                        {r.date ? new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                      </td>
                      {isPending && (
                        <td className="px-5 py-3.5 text-xs">
                          {r.gstPercent != null ? (
                            <span className="font-bold text-indigo-600 dark:text-indigo-400">{r.gstPercent}%</span>
                          ) : '-'}
                        </td>
                      )}
                      {isPending ? (
                        <td className="px-5 py-3.5 text-right font-black text-orange-600 dark:text-orange-400">
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
          entityId={viewing.entityId}
          entityType={entityType}
          entityName={viewing.entityName}
          transaction={viewing.transaction}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
