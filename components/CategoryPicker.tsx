'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Free-text Category input with a custom, styled, scrollable suggestion
 * dropdown — replaces the native `<input list>` + `<datalist>` pattern,
 * which can't be styled, doesn't reliably scroll, and can render past the
 * bottom of the viewport with no visible affordance that there's more below
 * it (reported live: a shop with a long category history showed a dropdown
 * that overlapped the page with no scrollbar). This is a real combobox:
 * still fully free-text (typing something new and committing it, same as
 * before, creates a new category), but suggestions are capped, scrollable,
 * and keyboard-navigable.
 *
 * Typing stays in local state and only commits to the parent on blur/Enter/
 * selecting an option — same reasoning as `LocalInput` in SizeVariantGrid.tsx
 * (this form is large enough that every keystroke updating parent state
 * measurably slows typing; see feedback_memoize_derived_values_in_large_forms).
 */
export function CategoryPicker({
  value, onChange, suggestions, placeholder, className, required, autoFocus, renderLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  required?: boolean;
  /** Optional display-only translation (e.g. translateData(c, locale)) — the
   *  committed value is always the canonical suggestion string, this only
   *  changes what's shown in the dropdown row. */
  renderLabel?: (value: string) => string;
  autoFocus?: boolean;
}) {
  const [local, setLocal] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLocal(value); }, [value]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const filtered = useMemo(() => {
    const q = local.trim().toLowerCase();
    const list = q ? suggestions.filter(s => s.toLowerCase().includes(q)) : suggestions;
    return list.slice(0, 50); // keep the panel itself cheap even if a shop has hundreds of saved categories
  }, [local, suggestions]);

  function commit(v: string) {
    const clean = v;
    setLocal(clean);
    if (clean !== value) onChange(clean);
    setOpen(false);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <input
        ref={inputRef}
        type="text"
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={className}
        value={local}
        onChange={e => { setLocal(e.target.value); setHighlight(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { if (local !== value) onChange(local); }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHighlight(h => Math.min(h + 1, filtered.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); commit(open && filtered[highlight] ? filtered[highlight] : local); inputRef.current?.blur(); }
          else if (e.key === 'Escape') { setOpen(false); }
        }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl py-1">
          {filtered.map((s, i) => (
            <button
              key={s}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => commit(s)}
              className={cn(
                'w-full text-left px-3 py-2 text-sm transition-colors',
                i === highlight
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
              )}
            >
              {renderLabel ? (renderLabel(s) || s) : s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
