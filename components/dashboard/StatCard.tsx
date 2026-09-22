'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

export type Accent = 'slate' | 'emerald' | 'blue' | 'rose' | 'indigo' | 'red' | 'amber';

// Bottom border tints the card by meaning: money-in green, money-out red,
// the closing figure indigo. Keeps the row scannable at a glance.
const ACCENT_BAR: Record<Accent, string> = {
  slate: 'border-b-slate-200 dark:border-b-slate-800',
  emerald: 'border-b-emerald-500',
  blue: 'border-b-blue-500',
  rose: 'border-b-rose-500',
  indigo: 'border-b-indigo-500',
  red: 'border-b-red-500',
  amber: 'border-b-amber-500',
};

export function StatCard({ title, value, icon, href, subtitle, accent = 'slate', highlight, breakdown, footnote, className }: {
  title: string; value: string; icon: React.ReactNode; href?: string; subtitle?: string;
  accent?: Accent; highlight?: boolean;
  /** Payment-mode split shown under the value. Zero rows are dropped. */
  breakdown?: { label: string; amount: number }[];
  footnote?: string;
  /** Layout classes for the outer wrapper (e.g. a column span). */
  className?: string;
}) {
  const shownBreakdown = (breakdown || []).filter(b => Math.round(b.amount) > 0);
  const card = (
    <Card className={cn(
      'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl border-b-4 transition-all duration-300 h-full min-w-0',
      href && 'cursor-pointer hover:border-emerald-500/50',
      ACCENT_BAR[accent],
      highlight && 'ring-1 ring-indigo-500/25 shadow-md shadow-indigo-500/5',
    )}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-1 md:pb-2 p-4 md:p-6">
        <CardTitle className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest leading-tight break-words min-w-0">{title}</CardTitle>
        <div className="scale-75 md:scale-100 origin-right shrink-0">{icon}</div>
      </CardHeader>
      <CardContent className="px-4 pb-4 md:px-6 md:pb-6 pt-0 flex flex-col justify-end min-h-[60px]">
        <div className={cn(
          'text-xl md:text-2xl font-black tracking-tighter break-words',
          accent === 'red' ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-50',
        )}>{value}</div>
        {subtitle && (
          <p className={cn(
            'text-[10px] md:text-xs font-bold mt-1 break-words',
            accent === 'rose' ? 'text-rose-600 dark:text-rose-400'
              : accent === 'red' ? 'text-red-600 dark:text-red-400'
              : accent === 'blue' ? 'text-blue-600 dark:text-blue-400'
              : accent === 'indigo' ? 'text-indigo-600 dark:text-indigo-400'
              : accent === 'amber' ? 'text-amber-600 dark:text-amber-400'
              : 'text-emerald-600 dark:text-emerald-400',
          )}>{subtitle}</p>
        )}

        {shownBreakdown.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {shownBreakdown.map(b => (
              <span key={b.label}
                className="text-[9px] md:text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {b.label} ₹{Math.round(b.amount).toLocaleString('en-IN')}
              </span>
            ))}
          </div>
        )}

        {footnote && (
          <p className="text-[9px] md:text-[10px] font-medium text-slate-400 mt-1.5 leading-tight break-words">{footnote}</p>
        )}
      </CardContent>
    </Card>
  );

  return href ? (
    <Link href={href as any} className={cn('block group min-w-0', className)}>
      {card}
    </Link>
  ) : (className ? <div className={className}>{card}</div> : card);
}

export const rupees = (n: number) => `₹ ${Math.round(n).toLocaleString('en-IN')}`;
/** Signed two-decimal money — the round-off is under ₹1, so whole-rupee rounding would hide it. */
export const signedRupees = (n: number) => `${n < 0 ? '−' : n > 0 ? '+' : ''}₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
