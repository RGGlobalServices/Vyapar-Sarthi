'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

/**
 * A discount field that can be entered either as a flat rupee amount or as a
 * percentage of the subtotal. `setDiscount` always receives the resolved
 * rupee amount — every consumer (total calculation, GST breakdown, the save
 * payload) keeps working unchanged; this is purely an input convenience.
 *
 * In percent mode the percentage is the source of truth: if the cart
 * subtotal changes (items added/removed) while a percentage is active, the
 * rupee discount recomputes automatically so the percentage stays correct.
 */
export default function DiscountInput({
  subtotal,
  discount,
  setDiscount,
}: {
  subtotal: number;
  discount: number;
  setDiscount: (value: number) => void;
}) {
  const [mode, setMode] = useState<'amount' | 'percent'>('amount');
  const [percentInput, setPercentInput] = useState('');

  // Percent mode: recompute the rupee discount whenever the typed percentage
  // or the subtotal changes, so switching packages/cart contents never leaves
  // a stale rupee amount behind a percentage the user actually typed.
  useEffect(() => {
    if (mode !== 'percent') return;
    const pct = percentInput === '' ? 0 : Math.max(0, Math.min(100, Number(percentInput)));
    setDiscount(Math.round((subtotal * pct) / 100));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, percentInput, subtotal]);

  const switchMode = (next: 'amount' | 'percent') => {
    if (next === mode) return;
    if (next === 'percent') {
      // One-time conversion so an existing ₹ discount shows as its equivalent %.
      const pct = subtotal > 0 ? (discount / subtotal) * 100 : 0;
      setPercentInput(pct === 0 ? '' : String(Math.round(pct * 100) / 100));
    }
    setMode(next);
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center bg-slate-100 dark:bg-slate-900 rounded-lg p-0.5 text-[10px] font-bold shrink-0">
        <button
          type="button"
          onClick={() => switchMode('amount')}
          className={cn('px-2 py-1 rounded transition-colors', mode === 'amount' ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-400')}
        >
          ₹
        </button>
        <button
          type="button"
          onClick={() => switchMode('percent')}
          className={cn('px-2 py-1 rounded transition-colors', mode === 'percent' ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-400')}
        >
          %
        </button>
      </div>
      <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1">
        {mode === 'amount' ? (
          <>
            <span className="text-emerald-500">₹</span>
            <input
              type="number" min={0}
              className="w-16 bg-transparent text-emerald-600 dark:text-emerald-500 font-bold outline-none text-right"
              value={discount === 0 ? '' : discount}
              placeholder="0"
              onChange={e => setDiscount(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
            />
          </>
        ) : (
          <>
            <input
              type="number" min={0} max={100}
              className="w-12 bg-transparent text-emerald-600 dark:text-emerald-500 font-bold outline-none text-right"
              value={percentInput}
              placeholder="0"
              onChange={e => setPercentInput(e.target.value)}
            />
            <span className="text-emerald-500">%</span>
          </>
        )}
      </div>
      {mode === 'percent' && discount > 0 && (
        <span className="text-[10px] text-slate-400 whitespace-nowrap">₹{discount.toLocaleString('en-IN')}</span>
      )}
    </div>
  );
}
