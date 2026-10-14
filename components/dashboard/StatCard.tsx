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

  // A card is only ~150-200px wide in the grid, but a crore-level rupee value ("₹1,44,05,572")
  // is one unbreakable token with no spaces to wrap at. At a fixed font size that overflows the
  // card and visually overlaps the next one, so the font shrinks as the value gets longer instead.
  const valueLen = value.length;
  const valueSizeClass =
    valueLen > 14 ? 'text-sm md:text-base' :
    valueLen > 11 ? 'text-base md:text-lg' :
    valueLen > 8  ? 'text-lg md:text-xl' :
                    'text-xl md:text-2xl';

  const card = (
    <div className={cn(
      'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800',
      'border-l-4 rounded-xl shadow-sm transition-all duration-200 h-full min-w-0 flex flex-col min-h-[108px]',
      href && 'hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer',
      ACCENT_LEFT[accent],
      highlight && 'ring-1 ring-indigo-500/20',
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-1.5 md:px-4 md:pt-4">
        <p className="text-[11px] md:text-xs font-semibold text-slate-500 dark:text-slate-400 leading-snug">{title}</p>
        <div className="opacity-60 shrink-0 scale-90 md:scale-100 origin-right mt-0.5">{icon}</div>
      </div>

      {/* Value */}
      <div className="px-3 pb-3 md:px-4 md:pb-4 flex flex-col gap-1 flex-1 justify-end">
        <p className={cn(
          'font-bold tabular-nums tracking-tight leading-tight break-words [overflow-wrap:anywhere]',
          valueSizeClass,
          VALUE_COLOR[accent],
        )}>{value}</p>

        {subtitle && (
          <p className="text-[10px] md:text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5 break-words leading-snug">{subtitle}</p>
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
