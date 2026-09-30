'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { IndianRupee } from 'lucide-react';

/**
 * Compact "add extra cost" control placed next to a product's Cost field.
 *
 * The shopkeeper enters a % or a flat ₹ that represents per-unit expenses
 * (freight, loading, etc.) they pay ON TOP of the vendor's cost. On Apply it
 * hands the parent a pure transform `(value) => newValue` so the parent can
 * bump the COST and re-derive the SELLING price(s) by the same amount — the
 * margin is preserved (same % on both for a percent markup; same ₹ added to
 * both for an amount markup). Negative values are allowed (a discount).
 *
 * Intentionally does NOT own any product state: it only produces the transform
 * and calls `onApply`, so it drops into the Udyog and Vyapar/Dukan Add-Product
 * forms identically without knowing their field shapes.
 */
export default function CostMarkupControl({
  onApply,
  className,
}: {
  onApply: (transform: (value: number) => number) => void;
  className?: string;
}) {
  const t = useTranslations('CostMarkup');
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<'percent' | 'amount'>('percent');
  const [note, setNote] = useState('');

  const apply = () => {
    const v = Number(value);
    if (!isFinite(v) || v === 0) { setNote(t('enterValue')); return; }
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const transform = (x: number) => {
      const n = Number(x) || 0;
      if (n <= 0) return n; // nothing to mark up on an empty field
      return mode === 'percent' ? round2(n * (1 + v / 100)) : Math.max(0, round2(n + v));
    };
    onApply(transform);
    const label = mode === 'percent' ? `${v > 0 ? '+' : ''}${v}%` : `${v > 0 ? '+' : ''}₹${v}`;
    // ICU message carries the {m} placeholder — must pass it as a param, not
    // via a post-hoc .replace() (next-intl errors on a missing param and
    // returns the raw key path otherwise).
    setNote(t('applied', { m: label }));
  };

  return (
    <div className={`rounded-lg border border-amber-300 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/5 p-2.5 space-y-2 ${className || ''}`}>
      <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1">
        <IndianRupee size={11} /> {t('title') || 'Add extra cost (freight/loading)'}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="number" inputMode="decimal" value={value}
          onChange={e => { setValue(e.target.value); setNote(''); }}
          placeholder={mode === 'percent' ? '10' : '5'}
          className="w-16 h-8 px-2 rounded-md text-sm font-semibold text-center border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-amber-500 text-slate-900 dark:text-white"
        />
        <div className="flex bg-slate-200 dark:bg-slate-800 rounded-md p-0.5 h-8">
          {([['percent', '%'], ['amount', '₹']] as const).map(([m, lbl]) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`px-2.5 rounded text-sm font-bold ${mode === m ? 'bg-amber-500 text-white' : 'text-slate-500'}`}>{lbl}</button>
          ))}
        </div>
        <button type="button" onClick={apply}
          className="h-8 px-3 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold whitespace-nowrap">
          {t('apply') || 'Add to cost'}
        </button>
      </div>
      {note
        ? <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">{note}</p>
        : <p className="text-[10px] text-slate-400">{t('hint') || 'Bumps cost and raises selling by the same, so margin stays the same.'}</p>}
    </div>
  );
}
