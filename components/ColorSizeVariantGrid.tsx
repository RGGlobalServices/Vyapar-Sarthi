'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Plus, X } from 'lucide-react';
import SizeVariantGrid from '@/components/SizeVariantGrid';
import type { SizePriceEntry } from '@/components/SizeVariantGrid';

/**
 * Two-dimensional variant grid (Colour × Size) for categories like clothes & shoes.
 *
 * It stores everything in the SAME flat `Record<string, number>` used by the single
 * dimension SizeVariantGrid, but with composite keys "Colour / Size" (e.g. "Red / M",
 * "Black / UK9"). This means stock-in/out, per-variant pricing (metadata.size_prices)
 * and billing variant selection all keep working unchanged — they treat the key as an
 * opaque string.
 */

export const VARIANT_SEP = ' / ';

export function makeVariantKey(color: string, size: string) {
  return `${color}${VARIANT_SEP}${size}`;
}

export function splitVariantKey(key: string): { color: string; size: string } {
  const idx = key.indexOf(VARIANT_SEP);
  if (idx === -1) return { color: '', size: key };
  return { color: key.slice(0, idx), size: key.slice(idx + VARIANT_SEP.length) };
}

/** True when the variant map uses composite "Colour / Size" keys. */
export function isColorSizeVariants(value: Record<string, number>): boolean {
  return Object.keys(value).some(k => k.includes(VARIANT_SEP));
}

/** Distinct colours present in a composite variant map, in first-seen order. */
export function colorsFromVariants(value: Record<string, number>): string[] {
  const out: string[] = [];
  for (const k of Object.keys(value)) {
    const { color } = splitVariantKey(k);
    if (color && !out.includes(color)) out.push(color);
  }
  return out;
}

/** Distinct sizes present in a composite variant map, in first-seen order. */
export function sizesFromVariants(value: Record<string, number>): string[] {
  const out: string[] = [];
  for (const k of Object.keys(value)) {
    const { size } = splitVariantKey(k);
    if (size && !out.includes(size)) out.push(size);
  }
  return out;
}

export function cssColor(name: string): string {
  const map: Record<string, string> = {
    black: '#000000', white: '#ffffff', red: '#ef4444', blue: '#3b82f6', green: '#22c55e',
    yellow: '#eab308', pink: '#ec4899', grey: '#6b7280', gray: '#6b7280', brown: '#92400e',
    tan: '#d2b48c', navy: '#1e3a8a', maroon: '#7f1d1d', orange: '#f97316', purple: '#a855f7',
    beige: '#f5f5dc', cream: '#fdf6e3', gold: '#d4af37', silver: '#c0c0c0', olive: '#808000',
  };
  return map[name.trim().toLowerCase()] || '#cbd5e1';
}

interface ColorSizeVariantGridProps {
  colors: string[];
  sizeChart: string[];
  value: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
  readOnly?: boolean;
  unitLabel?: string;
  perSizePricing?: boolean;
  sizePrices?: Record<string, SizePriceEntry>;
  onSizePricesChange?: (p: Record<string, SizePriceEntry>) => void;
  /** Show a colour swatch next to each group label. Off for non-colour dimensions (e.g. Type). */
  showSwatch?: boolean;
  /** Lower-cased dimension name used in the empty-state hint (e.g. "colour", "type"). */
  dimensionLabel?: string;
  /** Additive mode: cells show current stock as a badge and the input is a delta.
   *  Passed through to the per-colour SizeVariantGrid and the legacy row. */
  additiveMode?: boolean;
  baseValue?: Record<string, number>;
}

export default function ColorSizeVariantGrid({
  colors, sizeChart, value, onChange, readOnly,
  unitLabel = 'units',
  perSizePricing, sizePrices = {}, onSizePricesChange,
  showSwatch = true, dimensionLabel = 'colour',
  additiveMode = false, baseValue,
}: ColorSizeVariantGridProps) {
  const t = useTranslations('Variants');
  const grandTotal = Object.values(value).reduce((s, v) => s + (v || 0), 0);

  // Legacy products (imported before the colour picker, or in a colour-enabled
  // shop that only tracked sizes) store bare size keys — e.g. {"S":10,"M":3}.
  // colorsFromVariants() returns [] for those, so without this fallback the
  // grid renders as "Add at least one option above" while the DB quietly
  // holds the stock. Surface them under an Unassigned row so the shopkeeper
  // sees + keeps their existing quantities (and can re-assign to a real
  // colour by adding it above and clearing the Unassigned cells).
  const legacySizes = Object.keys(value).filter(k => !k.includes(VARIANT_SEP));
  const hasLegacy = legacySizes.length > 0;
  const legacyChart = Array.from(new Set([...sizeChart, ...legacySizes]));

  return (
    <div className="space-y-3">
      {colors.length === 0 && !hasLegacy && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center py-2">
          {t('emptyHint')}
        </p>
      )}

      {hasLegacy && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-500/40 p-3 bg-amber-50/40 dark:bg-amber-500/5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wide">
              {t('unassignedLabel')}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">
              {legacySizes.reduce((s, k) => s + (value[k] || 0), 0)} {unitLabel}
            </span>
          </div>
          <SizeVariantGrid
            sizeChart={legacyChart}
            value={Object.fromEntries(legacySizes.map(k => [k, value[k]]))}
            readOnly={readOnly}
            unitLabel={unitLabel}
            perSizePricing={perSizePricing}
            additiveMode={additiveMode}
            baseValue={baseValue ? Object.fromEntries(Object.keys(baseValue).filter(k => !k.includes(VARIANT_SEP)).map(k => [k, baseValue[k]])) : undefined}
            sizePrices={Object.fromEntries(legacySizes.filter(k => sizePrices[k]).map(k => [k, sizePrices[k]]))}
            onChange={v => {
              const next = { ...value };
              // Drop every existing legacy key, then re-add non-zero ones.
              legacyChart.forEach(s => { if (!s.includes(VARIANT_SEP)) delete next[s]; });
              Object.entries(v).forEach(([s, q]) => { if (q > 0) next[s] = q; });
              onChange(next);
            }}
            onSizePricesChange={onSizePricesChange ? p => {
              const next = { ...sizePrices };
              legacyChart.forEach(s => { if (!s.includes(VARIANT_SEP)) delete next[s]; });
              Object.entries(p).forEach(([s, entry]) => { next[s] = entry; });
              onSizePricesChange(next);
            } : undefined}
          />
          <p className="text-[10px] text-amber-700/80 dark:text-amber-300/70">
            {t('unassignedHint')}
          </p>
        </div>
      )}

      {colors.map(color => {
        // Scope the flat composite map down to a per-colour { size: qty } map for the
        // underlying single-dimension grid, then translate edits back to composite keys.
        const subValue: Record<string, number> = {};
        const subPrices: Record<string, SizePriceEntry> = {};
        sizeChart.forEach(s => {
          const k = makeVariantKey(color, s);
          if (value[k] != null) subValue[s] = value[k];
          if (sizePrices[k] != null) subPrices[s] = sizePrices[k];
        });
        const colorTotal = sizeChart.reduce((sum, s) => sum + (value[makeVariantKey(color, s)] || 0), 0);

        return (
          <div key={color} className="rounded-xl border border-slate-200 dark:border-slate-700/60 p-3 bg-white/40 dark:bg-slate-900/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                {showSwatch && <span className="w-3 h-3 rounded-full border border-slate-300 dark:border-slate-600 shrink-0" style={{ background: cssColor(color) }} />}
                {color}
              </span>
              <span className="text-[10px] text-slate-400">{colorTotal} {unitLabel}</span>
            </div>
            {/* Per-colour base map for additive mode — same slicing as subValue. */}
            <SizeVariantGrid
              sizeChart={sizeChart}
              value={subValue}
              readOnly={readOnly}
              unitLabel={unitLabel}
              perSizePricing={perSizePricing}
              additiveMode={additiveMode}
              baseValue={baseValue ? Object.fromEntries(sizeChart.map(s => [s, baseValue[makeVariantKey(color, s)] || 0]).filter(([, v]) => v > 0)) : undefined}
              sizePrices={subPrices}
              onChange={v => {
                const next = { ...value };
                sizeChart.forEach(s => {
                  const k = makeVariantKey(color, s);
                  const q = v[s] || 0;
                  if (q > 0) next[k] = q; else delete next[k];
                });
                onChange(next);
              }}
              onSizePricesChange={onSizePricesChange ? p => {
                const next = { ...sizePrices };
                sizeChart.forEach(s => {
                  const k = makeVariantKey(color, s);
                  if (p[s] != null) next[k] = p[s]; else delete next[k];
                });
                onSizePricesChange(next);
              } : undefined}
            />
          </div>
        );
      })}

      {colors.length > 1 && (
        <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 rounded-lg px-4 py-2 border border-slate-200 dark:border-slate-700/50">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t('grandTotal')}</span>
          <span className={cn('text-lg font-black', grandTotal === 0 ? 'text-slate-300 dark:text-slate-600' : 'text-emerald-600 dark:text-emerald-400')}>
            {grandTotal} {unitLabel}
          </span>
        </div>
      )}
    </div>
  );
}

/** Chip multi-select for choosing a variant dimension (colours, or types like LED/Tubelight). */
export function ColorPicker({
  colorChart, value, onChange, showSwatch = true, placeholder,
}: {
  colorChart: string[];
  value: string[];
  onChange: (c: string[]) => void;
  showSwatch?: boolean;
  placeholder?: string;
}) {
  const t = useTranslations('Variants');
  const [custom, setCustom] = useState('');
  function toggle(c: string) {
    onChange(value.includes(c) ? value.filter(x => x !== c) : [...value, c]);
  }
  function addCustom() {
    const c = custom.trim();
    if (c && !value.includes(c)) onChange([...value, c]);
    setCustom('');
  }
  const palette = Array.from(new Set([...colorChart, ...value]));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {palette.map(c => {
          const active = value.includes(c);
          return (
            <button
              type="button"
              key={c}
              onClick={() => toggle(c)}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all',
                active
                  ? 'bg-violet-500/15 border-violet-500/40 text-violet-600 dark:text-violet-300'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              )}
            >
              {showSwatch && <span className="w-2.5 h-2.5 rounded-full border border-slate-300 dark:border-slate-600 shrink-0" style={{ background: cssColor(c) }} />}
              {c}
              {active && <X size={10} />}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <input
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
          placeholder={placeholder ?? t('addCustomPlaceholder')}
          className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
        <button type="button" onClick={addCustom} className="px-3 rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-300 text-xs font-bold flex items-center gap-1">
          <Plus size={12} />{t('add')}
        </button>
      </div>
    </div>
  );
}
