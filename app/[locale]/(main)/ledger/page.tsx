'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { Loader2, NotebookText, TrendingUp, TrendingDown, Calendar } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

type CashEntry = {
  id: string; type: string; amount: number; description: string | null;
  referenceId: string | null; date: string;
};

const fetcher = (u: string) => api.get(u).then(r => r.data);
const rupee = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/** Local YYYY-MM-DD, matching the convention already used across this app's forms. */
const toInputDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// A cash-inflow type adds to the till; everything else takes from it. Matches
// CashBook.type's real values (see prisma/schema.prisma's comment on the model).
const INFLOW_TYPES = new Set(['sale', 'collection', 'deposit', 'opening_balance']);

const TYPE_LABELS: Record<string, string> = {
  sale: 'Sale', purchase: 'Purchase', expense: 'Expense', collection: 'Collection',
  withdrawal: 'Withdrawal', opening_balance: 'Opening Balance', deposit: 'Deposit',
  production_output: 'Production Output',
};

const TYPE_TONE: Record<string, string> = {
  sale: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  collection: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  deposit: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  opening_balance: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  purchase: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
  expense: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
  withdrawal: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
};

export default function LedgerPage() {
  const t = useTranslations('Ledger');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 86400000);
  const [from, setFrom] = useState(toInputDate(monthAgo));
  const [to, setTo] = useState(toInputDate(today));

  const { data: entries = [], isLoading } = useSWR<CashEntry[]>(
    activeShopId ? [`/cashbook?from=${from}&to=${to}`, activeShopId] : null,
    ([u]) => fetcher(u),
  );

  // API returns newest-first; running balance reads naturally oldest-first,
  // so reverse once here rather than re-deriving order per render.
  const chronological = useMemo(() => [...entries].reverse(), [entries]);
  const withRunningBalance = useMemo(() => {
    let bal = 0;
    return chronological.map((e) => {
      const signed = INFLOW_TYPES.has(e.type) ? e.amount : -e.amount;
      bal += signed;
      return { ...e, signed, runningBalance: bal };
    });
  }, [chronological]);

  const totals = useMemo(() => {
    let totalIn = 0, totalOut = 0;
    for (const e of entries) {
      if (INFLOW_TYPES.has(e.type)) totalIn += e.amount; else totalOut += e.amount;
    }
    return { totalIn, totalOut, net: totalIn - totalOut };
  }, [entries]);

  // Newest-first for display, but each row already carries the running
  // balance computed in chronological order above.
  const displayRows = useMemo(() => [...withRunningBalance].reverse(), [withRunningBalance]);

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <NotebookText size={22} className="text-blue-600" /> {t('title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2">
          <Calendar size={15} className="text-slate-400" />
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="bg-transparent text-sm outline-none" />
          <span className="text-slate-400">—</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="bg-transparent text-sm outline-none" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={TrendingUp} label={t('totalIn')} value={rupee(totals.totalIn)} tone="emerald" />
        <StatCard icon={TrendingDown} label={t('totalOut')} value={rupee(totals.totalOut)} tone="rose" />
        <StatCard icon={NotebookText} label={t('net')} value={rupee(totals.net)} tone={totals.net >= 0 ? 'emerald' : 'rose'} />
      </div>

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : displayRows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <NotebookText size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm text-slate-500">{t('noEntries')}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {displayRows.map((e) => (
              <li key={e.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full', TYPE_TONE[e.type] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>
                      {TYPE_LABELS[e.type] || e.type}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(e.date).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {e.description && <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">{e.description}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className={cn('text-lg font-black', e.signed >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                    {e.signed >= 0 ? '+' : '−'}{rupee(Math.abs(e.signed))}
                  </p>
                  <p className="text-[10px] text-slate-400">{t('balance')}: {rupee(e.runningBalance)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone: 'emerald' | 'rose' }) {
  const map = { emerald: 'text-emerald-500', rose: 'text-rose-500' };
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <Icon size={18} className={map[tone]} />
      <p className="mt-2 text-xl font-black text-slate-900 dark:text-white">{value}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}
