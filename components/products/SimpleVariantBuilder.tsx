'use client';

import { useEffect, useState } from 'react';
import { X, Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cssColor } from '@/components/ColorSizeVariantGrid';
import type { SizePriceEntry } from '@/components/SizeVariantGrid';
import { variantGridKeys, splitList, splitVariantKey, FREE_SIZE } from '@/lib/variants';

/**
 * Simple variant builder — the same idea Zoho / Shopify / GoFrugal use:
 *   1. type the sizes (or tap a preset)      2. (optional) pick colours
 *   3. a table of every colour × size appears — the shopkeeper only types quantities.
 * Controlled component: it works on the same state the old grids used
 * (colours[], sizes[], {"Colour / Size": qty}, per-variant prices), so the Add/Edit
 * submit logic did not have to change.
 */

type Props = {
  colors: string[];
  onColorsChange: (next: string[]) => void;
  sizes: string[];
  onSizesChange: (next: string[]) => void;
  value: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  /** Edit mode: existing stock per key. Typed numbers are stock ADDED on top (value = base + typed). */
  baseValue?: Record<string, number>;
  sizePrices?: Record<string, SizePriceEntry>;
  onSizePricesChange?: (next: Record<string, SizePriceEntry>) => void;
  perSizePricing?: boolean;
  colorOptions?: string[];
  showSwatch?: boolean;
  colorLabel?: string;
  sizeLabel?: string;
  sizeChart: string[];
  allowColors?: boolean;
  unitLabel?: string;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** number input that commits on blur / Enter so typing never re-renders the whole (huge) product form */
function QtyInput({ value, onCommit, placeholder, className, next }: {
  value: string; onCommit: (v: string) => void; placeholder?: string; className?: string; next?: () => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      type="number" inputMode="numeric" min={0} value={v} placeholder={placeholder ?? '0'}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onCommit(v); next?.(); } }}
      onFocus={(e) => e.currentTarget.select()}
      className={className}
    />
  );
}

export default function SimpleVariantBuilder({
  colors, onColorsChange, sizes, onSizesChange, value, onChange, baseValue,
  sizePrices = {}, onSizePricesChange, perSizePricing = false,
  colorOptions = [], showSwatch = true, colorLabel = 'colour', sizeLabel = 'size',
  sizeChart, allowColors = true, unitLabel = 'pcs',
}: Props) {
  const additive = !!baseValue;
  const [sizeText, setSizeText] = useState('');
  const [colorText, setColorText] = useState('');
  const [allQty, setAllQty] = useState('');

  const rows = variantGridKeys(colors, sizes);
  const baseOf = (key: string) => Number(baseValue?.[key]) || 0;
  const total = rows.reduce((s, r) => s + (Number(value[r.key]) || 0), 0);
  const cLabel = cap(colorLabel);
  const sLabel = cap(sizeLabel);

  const inp = 'w-full h-9 px-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-violet-500';
  const chipBase = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors';

  // ── sizes ─────────────────────────────────────────────────────────────────
  const hasBaseStock = (kind: 'size' | 'color', name: string) =>
    additive && Object.entries(baseValue!).some(([k, q]) => {
      const p = splitVariantKey(k);
      return (Number(q) || 0) > 0 && (kind === 'size' ? p.size === name : p.color === name);
    });

  const addSizes = (list: string[]) => {
    const have = new Set(sizes.map((s) => s.toLowerCase()));
    const merged = [...sizes, ...list.filter((s) => !have.has(s.toLowerCase()))];
    if (merged.length !== sizes.length) onSizesChange(merged);
  };
  const removeSize = (s: string) => {
    if (hasBaseStock('size', s)) return;
    onSizesChange(sizes.filter((x) => x !== s));
    // drop that size's quantities / prices so they don't get saved
    const keep = (k: string) => splitVariantKey(k).size !== s;
    onChange(Object.fromEntries(Object.entries(value).filter(([k]) => keep(k))));
    if (onSizePricesChange) onSizePricesChange(Object.fromEntries(Object.entries(sizePrices).filter(([k]) => keep(k))));
  };
  const commitSizeText = () => { const l = splitList(sizeText); if (l.length) addSizes(l); setSizeText(''); };

  // ── colours ───────────────────────────────────────────────────────────────
  const addColors = (list: string[]) => {
    const have = new Set(colors.map((c) => c.toLowerCase()));
    const merged = [...colors, ...list.filter((c) => !have.has(c.toLowerCase()))];
    if (merged.length !== colors.length) onColorsChange(merged);
  };
  const toggleColor = (c: string) => {
    if (colors.includes(c)) { if (!hasBaseStock('color', c)) onColorsChange(colors.filter((x) => x !== c)); }
    else addColors([c]);
  };
  const commitColorText = () => { const l = splitList(colorText).map(cap); if (l.length) addColors(l); setColorText(''); };

  // ── presets from the category's own chart ─────────────────────────────────
  const has = (s: string) => sizeChart.some((x) => x.toUpperCase() === s);
  const presets: Array<{ label: string; list: string[] }> = [];
  if (sizeChart.length) presets.push({ label: `All ${sizeChart.length}`, list: sizeChart });
  if (has('S') && has('XXL')) presets.push({ label: 'S – XXL', list: sizeChart.filter((x) => ['S', 'M', 'L', 'XL', 'XXL'].includes(x.toUpperCase())) });
  if (has('S') && has('XL')) presets.push({ label: 'S – XL', list: sizeChart.filter((x) => ['S', 'M', 'L', 'XL'].includes(x.toUpperCase())) });
  presets.push({ label: FREE_SIZE, list: [FREE_SIZE] });

  const setQty = (key: string, raw: string) => {
    const t = raw.trim();
    if (additive) {
      const base = baseOf(key);
      onChange({ ...value, [key]: t === '' ? base : base + Math.max(0, parseInt(t) || 0) });
    } else {
      onChange({ ...value, [key]: Math.max(0, parseInt(t) || 0) });
    }
  };
  const applyAll = () => {
    const n = Math.max(0, parseInt(allQty) || 0);
    const next = { ...value };
    for (const r of rows) next[r.key] = additive ? baseOf(r.key) + n : n;
    onChange(next);
  };
  const setPrice = (key: string, field: 'mrp' | 'sellingPrice' | 'cost', raw: string) => {
    if (!onSizePricesChange) return;
    const cur = sizePrices[key] || { mrp: 0, sellingPrice: 0, cost: 0 };
    onSizePricesChange({ ...sizePrices, [key]: { ...cur, [field]: Math.max(0, Number(raw) || 0) } });
  };

  // Every generated row becomes a real variant (0 stock) even if no quantity is typed for it.
  const missingKeys = JSON.stringify(rows.filter((r) => !(r.key in value)).map((r) => r.key));
  useEffect(() => {
    if (missingKeys === '[]') return;
    const next = { ...value };
    for (const k of JSON.parse(missingKeys) as string[]) next[k] = baseOf(k);
    onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKeys]);

  const rowFocusNext = (i: number) => () => {
    const nextEl = document.querySelector<HTMLInputElement>(`[data-vb-qty="${i + 1}"]`);
    nextEl?.focus();
  };

  return (
    <div className="space-y-4">
      {/* Step 1: sizes */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 p-3 space-y-2">
        <p className="text-xs font-black text-slate-700 dark:text-slate-200"><span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-violet-500 text-white text-[10px] mr-1.5">1</span>Which {sizeLabel}s?</p>
        <div className="flex gap-2">
          <input
            value={sizeText} onChange={(e) => setSizeText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitSizeText(); } }}
            onBlur={commitSizeText}
            placeholder="Type & press Enter:  S, M, L, XL   or   28, 30, 32"
            className="flex-1 h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <button type="button" onClick={commitSizeText} className="h-10 px-3 rounded-lg bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 font-bold text-sm flex items-center gap-1"><Plus size={14} />Add</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button key={p.label} type="button" onClick={() => addSizes(p.list)}
              className={cn(chipBase, 'border-dashed border-violet-300 dark:border-violet-500/40 text-violet-600 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-500/10')}>
              + {p.label}
            </button>
          ))}
        </div>
        {sizes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {sizes.map((s) => (
              <span key={s} className={cn(chipBase, 'bg-violet-100 dark:bg-violet-500/20 border-violet-200 dark:border-violet-500/30 text-violet-700 dark:text-violet-300')}>
                {s}
                <button type="button" onClick={() => removeSize(s)} disabled={hasBaseStock('size', s)} title={hasBaseStock('size', s) ? 'Has stock — cannot remove' : 'Remove'} className="opacity-70 hover:opacity-100 disabled:opacity-30"><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Step 2: colours */}
      {allowColors && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 p-3 space-y-2">
          <p className="text-xs font-black text-slate-700 dark:text-slate-200"><span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-violet-500 text-white text-[10px] mr-1.5">2</span>{cLabel}s <span className="font-medium text-slate-400">(optional — skip if none)</span></p>
          {colorOptions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {colorOptions.map((c) => {
                const on = colors.includes(c);
                return (
                  <button key={c} type="button" onClick={() => toggleColor(c)}
                    className={cn(chipBase, on ? 'bg-emerald-100 dark:bg-emerald-500/20 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800')}>
                    {showSwatch && <span className="w-3 h-3 rounded-full border border-slate-300" style={{ background: cssColor(c) }} />}
                    {c}{on && <Check size={12} />}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={colorText} onChange={(e) => setColorText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitColorText(); } }}
              onBlur={commitColorText}
              placeholder={`Type another ${colorLabel} & Enter  (Maroon, Cream)`}
              className="flex-1 h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <button type="button" onClick={commitColorText} className="h-10 px-3 rounded-lg bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 font-bold text-sm flex items-center gap-1"><Plus size={14} />Add</button>
          </div>
          {colors.filter((c) => !colorOptions.includes(c)).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {colors.filter((c) => !colorOptions.includes(c)).map((c) => (
                <span key={c} className={cn(chipBase, 'bg-emerald-100 dark:bg-emerald-500/20 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300')}>
                  {showSwatch && <span className="w-3 h-3 rounded-full border border-slate-300" style={{ background: cssColor(c) }} />}{c}
                  <button type="button" onClick={() => toggleColor(c)} disabled={hasBaseStock('color', c)} className="opacity-70 hover:opacity-100 disabled:opacity-30"><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3: table */}
      {rows.length === 0 ? (
        <p className="text-center text-xs text-slate-500 dark:text-slate-400 py-2">
          Add a {sizeLabel} above — a table appears here, just type the quantities.
        </p>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
            <p className="text-xs font-black text-slate-700 dark:text-slate-200"><span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-violet-500 text-white text-[10px] mr-1.5">3</span>Enter quantity ({rows.length} variants)</p>
            <div className="ml-auto flex items-center gap-1.5">
              <QtyInput value={allQty} onCommit={setAllQty} placeholder="All" className={cn(inp, 'w-24 h-8')} />
              <button type="button" onClick={applyAll} className="h-8 px-3 rounded-lg bg-violet-500 text-white text-xs font-bold hover:bg-violet-600">Apply to all</button>
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r, i) => {
              const qty = Number(value[r.key]) || 0;
              const base = baseOf(r.key);
              const delta = Math.max(0, qty - base);
              const price = sizePrices[r.key];
              return (
                <div key={r.key} className="px-3 py-2 flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 min-w-[7rem] flex-1">
                    {r.color && showSwatch && <span className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0" style={{ background: cssColor(r.color) }} />}
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{r.color ? `${r.color} · ${r.size}` : r.size}</span>
                    {additive && <span className="text-[10px] font-bold text-slate-400">has: {base}</span>}
                  </div>
                  <div className="w-24">
                    <QtyInput
                      value={additive ? (delta ? String(delta) : '') : (qty ? String(qty) : '')}
                      placeholder={additive ? '+ add' : '0'}
                      onCommit={(v) => setQty(r.key, v)}
                      next={rowFocusNext(i)}
                      className={cn(inp, additive && delta > 0 && 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10')}
                    />
                  </div>
                  {perSizePricing && (
                    <div className="flex items-center gap-1.5 w-full sm:w-auto">
                      {(['sellingPrice', 'mrp', 'cost'] as const).map((f) => (
                        <div key={f} className="w-20">
                          <QtyInput value={price?.[f] ? String(price[f]) : ''} onCommit={(v) => setPrice(r.key, f, v)}
                            placeholder={f === 'sellingPrice' ? 'Sell ₹' : f === 'mrp' ? 'MRP ₹' : 'Cost ₹'} className={cn(inp, 'text-xs')} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200">
            Total: <span className="text-emerald-600 dark:text-emerald-400">{total} {unitLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
}
