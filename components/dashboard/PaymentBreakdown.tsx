'use client';

import { Banknote } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { rupees } from './StatCard';

/**
 * How the period's collection arrived, one tile per mode. Every figure is the server's own `collection_*` value —
 * nothing is derived here. "Other" is `collection_unclassified` (modes the server could not classify), so Bank and
 * Cheque are never folded into it.
 */
export default function PaymentBreakdown({ summary }: { summary: Record<string, any> }) {
  const t = useTranslations('Dashboard');
  const tiles: { key: string; label: string; amount: number }[] = [
    { key: 'cash', label: t('cashLabel'), amount: Number(summary.collection_cash ?? 0) },
    { key: 'upi', label: t('upiLabel'), amount: Number(summary.collection_upi ?? 0) },
    { key: 'bank', label: t('bankLabel'), amount: Number(summary.collection_bank ?? 0) },
    { key: 'cheque', label: t('chequeLabel'), amount: Number(summary.collection_cheque ?? 0) },
    { key: 'card', label: t('cardLabel'), amount: Number(summary.collection_card ?? 0) },
    { key: 'other', label: t('otherLabel'), amount: Number(summary.collection_unclassified ?? 0) },
  ];
  return (
    <Card data-testid="payment-breakdown" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl">
      <CardHeader className="p-4 md:p-6 pb-2 flex flex-row items-center justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
            <Banknote size={16} className="text-emerald-500 shrink-0" /> {t('paymentBreakdown')}
          </CardTitle>
          <p className="text-[11px] text-slate-500 mt-0.5">{t('paymentBreakdownNote')}</p>
        </div>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3">
          {tiles.map((x) => (
            <div key={x.key} data-mode={x.key} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 px-3 py-2.5 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 break-words">{x.label}</p>
              <p className={cn('text-base md:text-lg font-black tracking-tight break-words', x.amount > 0 ? 'text-slate-900 dark:text-slate-50' : 'text-slate-400 dark:text-slate-600')}>
                {rupees(x.amount)}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
