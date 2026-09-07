'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Loader2, Hourglass, ArrowUpFromLine, ArrowDownToLine, Scale as ScaleIcon, Search } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useRouter, useParams } from 'next/navigation';

type SupplierBill = {
  id: string; supplierId: string; supplierName: string; supplierMobile: string;
  billNumber: string; date: string | null; dueDate: string | null; originalAmount: number; remaining: number;
};
type PartyBill = {
  id: string; entityId: string; entityName: string; entityMobile: string;
  billNumber: string; date: string | null; dueDate: string | null; originalAmount: number; remaining: number;
};

const fetcher = (u: string) => api.get(u).then(r => r.data);
const rupee = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

function isOverdue(dueDate: string | null) {
  if (!dueDate) return false;
  return new Date(dueDate).getTime() < Date.now();
}

export default function OutstandingPage() {
  const t = useTranslations('Outstanding');
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [tab, setTab] = useState<'payable' | 'receivable'>('payable');
  const [search, setSearch] = useState('');

  const { data: payableData, isLoading: loadingPayable } = useSWR<{ bills: SupplierBill[]; summary: { totalPending: number; billCount: number } }>(
    activeShopId ? ['/suppliers/pending-bills', activeShopId] : null,
    ([u]) => fetcher(u),
  );
  const { data: receivableData, isLoading: loadingReceivable } = useSWR<{ bills: PartyBill[]; summary: { totalPending: number; billCount: number } }>(
    activeShopId ? ['/crm/pending-bills?entityType=party', activeShopId] : null,
    ([u]) => fetcher(u),
  );

  const payable = payableData?.bills || [];
  const receivable = receivableData?.bills || [];
  const totalPayable = payableData?.summary?.totalPending || 0;
  const totalReceivable = receivableData?.summary?.totalPending || 0;
  const net = totalReceivable - totalPayable;

  const needle = search.trim().toLowerCase();
  const filteredPayable = needle
    ? payable.filter(b => b.supplierName.toLowerCase().includes(needle) || (b.billNumber || '').toLowerCase().includes(needle))
    : payable;
  const filteredReceivable = needle
    ? receivable.filter(b => b.entityName.toLowerCase().includes(needle) || (b.billNumber || '').toLowerCase().includes(needle))
    : receivable;

  const loading = tab === 'payable' ? loadingPayable : loadingReceivable;
  const rows = tab === 'payable' ? filteredPayable : filteredReceivable;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Hourglass size={22} className="text-amber-600" /> {t('title')}
        </h1>
        <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={ArrowUpFromLine} label={t('totalPayable')} value={rupee(totalPayable)} tone="rose" />
        <StatCard icon={ArrowDownToLine} label={t('totalReceivable')} value={rupee(totalReceivable)} tone="emerald" />
        <StatCard icon={ScaleIcon} label={t('netPosition')} value={rupee(net)} tone={net >= 0 ? 'emerald' : 'rose'} />
      </div>

      <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        <button onClick={() => setTab('payable')} className={cn('px-4 py-2 rounded-lg text-sm font-bold transition-colors', tab === 'payable' ? 'bg-white dark:bg-slate-700 shadow-sm text-rose-600' : 'text-slate-500')}>
          {t('payableTab')} ({payable.length})
        </button>
        <button onClick={() => setTab('receivable')} className={cn('px-4 py-2 rounded-lg text-sm font-bold transition-colors', tab === 'receivable' ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-600' : 'text-slate-500')}>
          {t('receivableTab')} ({receivable.length})
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <Hourglass size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm text-slate-500">{t('noBills')}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {tab === 'payable'
              ? filteredPayable.map((b) => (
                <li key={b.id}
                  onClick={() => router.push(`/${locale}/suppliers`)}
                  className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors flex items-center justify-between gap-4 flex-wrap"
                  title={t('openSupplierHint')}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 dark:text-white">{b.supplierName}</span>
                      {b.billNumber && <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">#{b.billNumber}</span>}
                      {isOverdue(b.dueDate) && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400">{t('overdue')}</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {b.date ? new Date(b.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                      {b.dueDate && ` · ${t('due')} ${new Date(b.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                    </p>
                  </div>
                  <span className="text-lg font-black text-rose-600 dark:text-rose-400 shrink-0">{rupee(b.remaining)}</span>
                </li>
              ))
              : filteredReceivable.map((b) => (
                <li key={b.id}
                  onClick={() => router.push(`/${locale}/party`)}
                  className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors flex items-center justify-between gap-4 flex-wrap"
                  title={t('openPartyHint')}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 dark:text-white">{b.entityName}</span>
                      {b.billNumber && <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">#{b.billNumber}</span>}
                      {isOverdue(b.dueDate) && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400">{t('overdue')}</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {b.date ? new Date(b.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                      {b.dueDate && ` · ${t('due')} ${new Date(b.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                    </p>
                  </div>
                  <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 shrink-0">{rupee(b.remaining)}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone: 'rose' | 'emerald' }) {
  const map = { rose: 'text-rose-500', emerald: 'text-emerald-500' };
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <Icon size={18} className={map[tone]} />
      <p className="mt-2 text-xl font-black text-slate-900 dark:text-white">{value}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}
