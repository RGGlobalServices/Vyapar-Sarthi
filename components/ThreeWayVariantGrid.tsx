'use client';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import ColorSizeVariantGrid, {
  ColorPicker,
  makeVariantKey,
  splitVariantKey,
  cssColor,
  VARIANT_SEP,
} from '@/components/ColorSizeVariantGrid';
import type { SizePriceEntry } from '@/components/SizeVariantGrid';

/**
 * Color × (spec-type × spec-size) grid for electronics/electric shops that
 * ship the same product in multiple colours. A smartphone becomes
 *   Black  → 8GB × 128GB, 8GB × 256GB, 12GB × 256GB
 *   White  → 8GB × 128GB, 12GB × 256GB
 *   Gold   → 12GB × 512GB
 *
 * Wire format stays a flat Record<string, number>. The inner
 * ColorSizeVariantGrid writes 2-part composite keys like "8GB / 128GB";
 * this wrapper prepends the outer colour to get "Black / 8GB / 128GB".
 * splitVariantKey uses the *first* separator, so downstream code
 * (`sizesFromVariants`, PDF, billing) still gets a clean {color, size}
 * split without any change.
 */

interface ThreeWayVariantGridProps {
  /** Outer palette to offer in the colour chip picker. */
  colorPalette: string[];
  /** Which colours the shopkeeper currently has selected. */
  colors: string[];
  onColorsChange: (colors: string[]) => void;

  /** Inner rows (e.g. RAM options for a smartphone). */
  innerRowOptions: string[];
  onInnerRowsChange?: (rows: string[]) => void;
  /** Inner columns (e.g. Storage options for a smartphone). */
  innerColOptions: string[];

  value: Record<string, number>;
  onChange: (v: Record<string, number>) => void;

  readOnly?: boolean;
  unitLabel?: string;
  perSizePricing?: boolean;
  sizePrices?: Record<string, SizePriceEntry>;
  onSizePricesChange?: (p: Record<string, SizePriceEntry>) => void;

  /** Human labels for the inner axes — e.g. "RAM" and "Storage". */
  innerRowLabel?: string;
  innerColLabel?: string;

  /** Additive mode + base snapshot — mirrors ColorSizeVariantGrid props. */
  additiveMode?: boolean;
  baseValue?: Record<string, number>;
}

/** Slice a flat 3-part map down to the { "RAM / Storage": qty } map for one colour. */
function sliceByOuterColor(value: Record<string, number>, outerColor: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value)) {
    const { color, size } = splitVariantKey(k);
    if (color === outerColor) out[size] = v;
  }
  return out;
}

/** Same slice but for the per-size pricing map. */
function slicePricesByOuterColor(
  prices: Record<string, SizePriceEntry>,
  outerColor: string,
): Record<string, SizePriceEntry> {
  const out: Record<string, SizePriceEntry> = {};
  for (const [k, v] of Object.entries(prices)) {
    const { color, size } = splitVariantKey(k);
    if (color === outerColor) out[size] = v;
  }
  return out;
}

export default function ThreeWayVariantGrid({
  colorPalette, colors, onColorsChange,
  innerRowOptions, innerColOptions,
  value, onChange,
  readOnly, unitLabel = 'units',
  perSizePricing, sizePrices = {}, onSizePricesChange,
  innerRowLabel = 'Type', innerColLabel = 'Size',
  additiveMode = false, baseValue,
}: ThreeWayVariantGridProps) {
  const t = useTranslations('Variants');

  // Legacy 2-part keys (no outer colour) — same "Unassigned" concept as
  // ColorSizeVariantGrid, but here Unassigned means "no colour yet" so the
  // shopkeeper's older stock stays visible while they migrate.
  const legacyKeys = Object.keys(value).filter(k => {
    const parts = k.split(VARIANT_SEP);
    // 2-part = "RAM / Storage"; 3-part = "Colour / RAM / Storage".
    return parts.length < 3;
  });
  const hasLegacy = legacyKeys.length > 0;
  const legacyValue = useMemo(() => Object.fromEntries(legacyKeys.map(k => [k, value[k]])), [value, legacyKeys.join('|')]);

  const grandTotal = Object.values(value).reduce((s, v) => s + (v || 0), 0);

  return (
    <div className="space-y-4">
      <ColorPicker
        colorChart={colorPalette}
        value={colors}
        onChange={onColorsChange}
        showSwatch
      />

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
              {legacyKeys.reduce((s, k) => s + (value[k] || 0), 0)} {unitLabel}
            </span>
          </div>
          {/* Reuse ColorSizeVariantGrid for the legacy 2-part slice — no colour prefix. */}
          <ColorSizeVariantGrid
            colors={Array.from(new Set(legacyKeys.map(k => splitVariantKey(k).color).filter(Boolean)))}
            sizeChart={Array.from(new Set([...innerColOptions, ...legacyKeys.map(k => splitVariantKey(k).size)]))}
            value={legacyValue}
            readOnly={readOnly}
            unitLabel={unitLabel}
            perSizePricing={perSizePricing}
            sizePrices={Object.fromEntries(legacyKeys.filter(k => sizePrices[k]).map(k => [k, sizePrices[k]]))}
            additiveMode={additiveMode}
            baseValue={baseValue ? Object.fromEntries(Object.keys(baseValue).filter(k => k.split(VARIANT_SEP).length < 3).map(k => [k, baseValue[k]])) : undefined}
            showSwatch={false}
            onChange={(next) => {
              // Drop every legacy key from the outer value, then re-add the new set.
              const merged = { ...value };
              for (const k of legacyKeys) delete merged[k];
              for (const [k, q] of Object.entries(next)) if (q > 0) merged[k] = q;
              onChange(merged);
            }}
            onSizePricesChange={onSizePricesChange ? (next) => {
              const merged = { ...sizePrices };
              for (const k of legacyKeys) delete merged[k];
              for (const [k, entry] of Object.entries(next)) merged[k] = entry;
              onSizePricesChange(merged);
            } : undefined}
          />
          <p className="text-[10px] text-amber-700/80 dark:text-amber-300/70">
            {t('unassignedHint')}
          </p>
        </div>
      )}

      {colors.map((outerColor) => {
        const sub = sliceByOuterColor(value, outerColor);
        const subPrices = slicePricesByOuterColor(sizePrices, outerColor);
        const subBase = baseValue ? sliceByOuterColor(baseValue, outerColor) : undefined;
        const outerTotal = Object.values(sub).reduce((s, v) => s + (v || 0), 0);

        return (
          <div key={outerColor} className="rounded-xl border-2 border-violet-200 dark:border-violet-500/40 p-3 bg-white/60 dark:bg-slate-900/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-slate-700 dark:text-slate-100 uppercase tracking-wide flex items-center gap-2">
                <span className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600 shrink-0" style={{ background: cssColor(outerColor) }} />
                {outerColor}
              </span>
              <span className={cn('text-xs font-bold', outerTotal === 0 ? 'text-slate-400' : 'text-emerald-600 dark:text-emerald-400')}>
                {outerTotal} {unitLabel}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              {innerRowLabel} × {innerColLabel}
            </p>
            <ColorSizeVariantGrid
              colors={innerRowOptions}
              sizeChart={innerColOptions}
              value={sub}
              readOnly={readOnly}
              unitLabel={unitLabel}
              perSizePricing={perSizePricing}
              sizePrices={subPrices}
              additiveMode={additiveMode}
              baseValue={subBase}
              showSwatch={false}
              dimensionLabel={innerRowLabel.toLowerCase()}
              onChange={(nextSub) => {
                // Merge nextSub back under the outer colour prefix.
                const merged: Record<string, number> = { ...value };
                // First strip all keys that belong to this outer colour.
                for (const k of Object.keys(merged)) {
                  if (splitVariantKey(k).color === outerColor) delete merged[k];
                }
                // Then re-add non-zero entries with the prefix.
                for (const [innerKey, q] of Object.entries(nextSub)) {
                  if (q > 0) merged[makeVariantKey(outerColor, innerKey)] = q;
                }
                onChange(merged);
              }}
              onSizePricesChange={onSizePricesChange ? (nextPrices) => {
                const merged: Record<string, SizePriceEntry> = { ...sizePrices };
                for (const k of Object.keys(merged)) {
                  if (splitVariantKey(k).color === outerColor) delete merged[k];
                }
                for (const [innerKey, entry] of Object.entries(nextPrices)) {
                  merged[makeVariantKey(outerColor, innerKey)] = entry;
                }
                onSizePricesChange(merged);
              } : undefined}
            />
          </div>
        );
      })}

      {(colors.length > 1 || (colors.length > 0 && hasLegacy)) && (
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
