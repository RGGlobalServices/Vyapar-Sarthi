'use client';

import { Trash2, X } from 'lucide-react';
import type { ReactNode } from 'react';

interface SelectionActionBarProps {
  count: number;
  itemLabel?: string; // e.g. "product" — pluralized automatically
  onDelete: () => void;
  onClear: () => void;
  disabled?: boolean;
  extraActions?: ReactNode;
  deleteLabel?: string;
}

/**
 * The selected-count pill + bulk-action bar, generalized from the one that
 * used to live only inside WholesaleProductsUI.tsx so every module's
 * multi-select delete UI looks and behaves the same way.
 */
export function SelectionActionBar({ count, itemLabel = 'item', onDelete, onClear, disabled, extraActions, deleteLabel = 'Delete' }: SelectionActionBarProps) {
  if (count === 0) return null;
  return (
    <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30 rounded-2xl p-3 mb-4 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
      <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
        {count} {count === 1 ? itemLabel : `${itemLabel}s`} selected
      </span>
      <div className="flex items-center gap-2">
        {extraActions}
        <button
          onClick={onDelete}
          disabled={disabled}
          className="text-xs bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-800/50 hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          <Trash2 size={14} /> {deleteLabel}
        </button>
        <button
          onClick={onClear}
          disabled={disabled}
          title="Clear selection"
          className="p-1.5 rounded-lg text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-800/40 transition-colors disabled:opacity-50"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
