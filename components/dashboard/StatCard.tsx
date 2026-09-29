'use client';

import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

export type Accent = 'slate' | 'emerald' | 'blue' | 'rose' | 'indigo' | 'red' | 'amber';

const ACCENT_LEFT: Record<Accent, string> = {
  slate:   'border-l-slate-300 dark:border-l-slate-700',
  emerald: 'border-l-emerald-500',
  blue:    'border-l-blue-500',
  rose:    'border-l-rose-500',
  indigo:  'border-l-indigo-500',
  red:     'border-l-red-500',
  amber:   'border-l-amber-500',
};

const VALUE_COLOR: Record<Accent, string> = {
  slate:   'text-slate-800 dark:text-slate-100',
  emerald: 'text-slate-800 dark:text-slate-100',
  blue:    'text-slate-800 dark:text-slate-100',
  rose:    'text-slate-800 dark:text-slate-100',
  indigo:  'text-slate-800 dark:text-slate-100',
  red:     'text-red-600 dark:text-red-400',
  amber:   'text-amber-700 dark:text-amber-400',
};

export function StatCard({ title, value, icon, href, subtitle, accent = 'slate', highlight, breakdown, footnote, className }: {
  title: string; value: string; icon: React.ReactNode; href?: string; subtitle?: string;
  accent?: Accent; highlight?: boolean;
  breakdown?: { label: string; amount: number }[];
  footnote?: string;
  className?: string;
}) {
  const shownBreakdown = (breakdown || []).filter(b => Math.round(b.amount) > 0);

  const card = (
    <div className={cn(
      'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800',
      'border-l-4 rounded-xl shadow-sm transition-all duration-200 h-full min-w-0 flex flex-col',
      href && 'hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer',
      ACCENT_LEFT[accent],
      highlight && 'ring-1 ring-indigo-500/20',
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2 md:px-5 md:pt-5">
        <p className="text-[10px] md:text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide leading-tight">{title}</p>
        <div className="opacity-70 shrink-0 scale-90 md:scale-100 origin-right mt-0.5">{icon}</div>
      </div>

      {/* Value */}
      <div className="px-4 pb-4 md:px-5 md:pb-5 flex flex-col gap-1 flex-1 justify-end">
        <p className={cn(
          'text-xl md:text-2xl font-bold tabular-nums tracking-tight leading-none',
          VALUE_COLOR[accent],
        )}>{value}</p>

        {subtitle && (
          <p className="text-[10px] md:text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5 break-words">{subtitle}</p>
        )}

        {shownBreakdown.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {shownBreakdown.map(b => (
              <span key={b.label}
                className="text-[9px] md:text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                {b.label} ₹{Math.round(b.amount).toLocaleString('en-IN')}
              </span>
            ))}
          </div>
        )}

        {footnote && (
          <p className="text-[9px] md:text-[10px] font-medium text-slate-400 mt-1 leading-snug break-words">{footnote}</p>
        )}
      </div>
    </div>
  );

  return href ? (
    <Link href={href as any} className={cn('block group min-w-0', className)}>
      {card}
    </Link>
  ) : (className ? <div className={className}>{card}</div> : card);
}

export const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
/** Signed two-decimal money — the round-off is under ₹1, so whole-rupee rounding would hide it. */
export const signedRupees = (n: number) => `${n < 0 ? '−' : n > 0 ? '+' : ''}₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
