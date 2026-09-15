'use client';

import { Maximize2, Minimize2 } from 'lucide-react';
import { useUIStore } from '@/lib/uiStore';
import { cn } from '@/lib/utils';

/**
 * Hides/restores the sidebar (desktop only — see uiStore.ts) from inside a
 * data-heavy page's own toolbar, e.g. a wide table with many columns (ML
 * Matrix, All Stock) that benefits from the extra width more than the
 * sidebar's own small collapse arrow would suggest reaching for. Same
 * toggle, just a second entry point placed where the user already is.
 */
export default function ExpandViewButton({ className }: { className?: string }) {
  const { sidebarHidden, toggleSidebar } = useUIStore();

  return (
    <button
      onClick={toggleSidebar}
      title={sidebarHidden ? 'Show sidebar' : 'Expand — hide sidebar for more width'}
      className={cn(
        'hidden md:flex items-center gap-2 px-4 py-2 font-bold rounded-xl transition-colors shadow-sm text-sm border',
        'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800',
        className,
      )}
    >
      {sidebarHidden ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      {sidebarHidden ? 'Collapse' : 'Expand'}
    </button>
  );
}
