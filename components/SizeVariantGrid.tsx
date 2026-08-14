'use client';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, IndianRupee, Plus, X } from 'lucide-react';

/**
 * Legacy shoe products stored bare "UK8"-style size keys before the shoe
 * size charts switched to "UK/IND 8" — UK and Indian shoe sizes are the same
 * number, so labelling both avoids a customer misreading it as a UK-only or
 * US size. Display-only: never touches the stored key, since stock lookups,
 * cart entries, and per-variant barcodes all key off the exact string.
 */
export function formatSizeLabel(size: string): string {
  const m = size.trim().match(/^UK\s*(\d+(?:\.\d+)?)$/i);
  return m ? `UK/IND ${m[1]}` : size;
}

/** Chip multi-select + free-text "add custom" for which sizes appear as grid
 *  columns — mirrors ColorPicker's exact UX (components/ColorSizeVariantGrid.tsx)
 *  so a business-type's default size chart (XS/S/M/L…) is a starting palette
 *  a shopkeeper can trim or extend, not a hard-coded list. Deselecting a chip
 *  only removes it from the *chart*; it doesn't touch any stock already
 *  entered for that size — the caller is expected to keep passing that size
 *  in `value` (via sizeChart's caller-side union with existing data) so real
 *  stock is never silently hidden or dropped. */
export function SizePicker({
  sizeChart, value, onChange, placeholder,
}: {
  sizeChart: string[];
  value: string[];
  onChange: (sizes: string[]) => void;
  placeholder?: string;
}) {
  const t = useTranslations('Variants');
  const [custom, setCustom] = useState('');
  function toggle(s: string) {
    onChange(value.includes(s) ? value.filter(x => x !== s) : [...value, s]);
  }
  function addCustom() {
    const s = custom.trim();
    if (s && !value.includes(s)) onChange([...value, s]);
    setCustom('');
  }
  const palette = Array.from(new Set([...sizeChart, ...value]));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {palette.map(s => {
          const active = value.includes(s);
          return (
            <button
              type="button"
              key={s}
              onClick={() => toggle(s)}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all',
                active
                  ? 'bg-violet-500/15 border-violet-500/40 text-violet-600 dark:text-violet-300'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              )}
            >
              {formatSizeLabel(s)}
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

/** Types into its own local state and only commits (calls onCommit) on blur
 *  or Enter — used for every per-variant input in this grid (quantity,
 *  barcode, MRP/Selling/Cost/MinStock). A plain controlled input on any of
 *  these re-renders the whole Add/Edit Product form AND every other colour
 *  section's grid alongside it on every keystroke — for the quantity input
 *  specifically this is worse than the others, since its onChange updates
 *  the form's entire `size_variants` object, which the whole modal reads
 *  from in many places, not just this one field's own row. For a product
 *  with several colours × sizes that's a lot of unrelated re-rendering for
 *  one digit typed into one box, and it's exactly what made typing feel
 *  heavy/laggy. Isolating keystrokes to this one small component's own
 *  state keeps typing itself cheap regardless of how big the surrounding
 *  form is; the parent only re-renders once, when the field is actually
 *  done being edited. Re-syncs from the `value` prop when it changes from
 *  OUTSIDE this input (Generate-barcodes button, another field's edit
 *  finishing, switching product) — the effect's dependency is `value`
 *  alone, so it doesn't fire mid-typing.
 *
 *  Trade-off, accepted deliberately: anything computed FROM this field and
 *  displayed elsewhere (the "= N" running-total hint under a quantity box,
 *  the Total Stock bar) only refreshes once the field is committed, not on
 *  every keystroke — standard behaviour for a form this size, not a bug. */
export function LocalInput({ value, onCommit, type = 'text', placeholder, className, min, max, step, list, required, autoFocus }: {
  value: string;
  onCommit: (v: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  list?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <input
      type={type}
      min={min}
      max={max}
      step={step}
      list={list}
      required={required}
      autoFocus={autoFocus}
      placeholder={placeholder}
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) onCommit(local); }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className={className}
    />
  );
}

export interface SizePriceEntry {
  mrp: number;
  sellingPrice: number;
  cost: number;
  minStock?: number;
  /** Per-variant scannable barcode. When present, a desktop scanner reading
   *  this code lands the exact colour/size on the bill (see billing scan
   *  handler + /api/v1/products/barcode/:code). Empty = no dedicated code,
   *  scanner falls back to the product-level barcode. */
  barcode?: string;
}

interface SizeVariantGridProps {
  sizeChart: string[];       // e.g. ['50ml','100ml','500ml','1L']
  value: Record<string, number>; // e.g. { '100ml': 50, '500ml': 20 }
  onChange: (variants: Record<string, number>) => void;
  readOnly?: boolean;
  unitLabel?: string;        // e.g. 'packet', 'bottle', 'pairs'
  // Per-size pricing
  perSizePricing?: boolean;
  sizePrices?: Record<string, SizePriceEntry>;
  onSizePricesChange?: (prices: Record<string, SizePriceEntry>) => void;
  /** When true, each cell shows the CURRENT stock (from `baseValue`) as a
   *  read-only badge, and the input represents ADD-quantity — final saved
   *  qty = baseValue + delta. Empty input means no change (stays at base).
   *  Used in the Edit-Product modal so a shopkeeper receiving new stock
   *  doesn't have to retype the whole total. */
  additiveMode?: boolean;
  baseValue?: Record<string, number>;
}

const inp = 'w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-900 dark:text-slate-100 text-center text-sm font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors';
const priceInp = 'w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-slate-900 dark:text-slate-100 text-center text-[11px] font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors';

export default function SizeVariantGrid({
  sizeChart, value, onChange, readOnly,
  unitLabel = 'units',
  perSizePricing, sizePrices = {}, onSizePricesChange,
  additiveMode = false, baseValue,
}: SizeVariantGridProps) {
  const t = useTranslations('Variants');
  const total = Object.values(value).reduce((s, v) => s + (v || 0), 0);
  const [expandedSize, setExpandedSize] = useState<string | null>(null);

  const baseFor = (size: string) => baseValue?.[size] || 0;

  function handleChange(size: string, rawVal: string) {
    const raw = rawVal.trim();
    if (additiveMode) {
      // Empty input → no change (stay at base). Non-empty → base + delta.
      const base = baseFor(size);
      if (raw === '') {
        onChange({ ...value, [size]: base });
        return;
      }
      const delta = Math.max(0, parseInt(raw) || 0);
      onChange({ ...value, [size]: base + delta });
      return;
    }
    const qty = Math.max(0, parseInt(raw) || 0);
    onChange({ ...value, [size]: qty });
  }

  function handlePriceChange(size: string, field: keyof SizePriceEntry, rawVal: string) {
    const num = Math.max(0, parseFloat(rawVal) || 0);
    const current = sizePrices[size] || { mrp: 0, sellingPrice: 0, cost: 0, minStock: undefined };
    const updated = { ...sizePrices, [size]: { ...current, [field]: num } };
    onSizePricesChange?.(updated);
  }

  // Barcode is a free-text field, not numeric. Store the raw typed value —
  // including an explicit empty string when the shopkeeper clears the field
  // — so the caller-side auto-fill can distinguish "user has never touched
  // this field" (undefined → auto-fill) from "user deliberately cleared it"
  // (empty string → leave empty, don't auto-fill back on the next render).
  function handleBarcodeChange(size: string, raw: string) {
    const current = sizePrices[size] || { mrp: 0, sellingPrice: 0, cost: 0 };
    const updated = { ...sizePrices, [size]: { ...current, barcode: raw } };
    onSizePricesChange?.(updated);
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(sizeChart.length, 4)}, 1fr)` }}>
        {sizeChart.map(size => {
          const qty = value[size] ?? 0;
          const isEmpty = qty === 0;
          const isExpanded = perSizePricing && expandedSize === size;
          const prices = sizePrices[size] || { mrp: 0, sellingPrice: 0, cost: 0, minStock: undefined };

          // Additive mode: the input represents the delta being added on top
          // of the base (current DB) stock. The badge shows the base so the
          // shopkeeper knows what's already there.
          const base = baseFor(size);
          const delta = additiveMode ? Math.max(0, qty - base) : 0;

          return (
            <div key={size} className="space-y-1">
              {/* Size Label */}
              <div className={cn(
                'text-[10px] font-bold text-center rounded-md px-1 py-0.5 uppercase tracking-wide',
                isEmpty
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                  : qty <= 2
                  ? 'bg-red-50 dark:bg-red-500/20 text-red-500 dark:text-red-400'
                  : qty <= 5
                  ? 'bg-orange-50 dark:bg-orange-500/20 text-orange-500 dark:text-orange-400'
                  : 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
              )}>
                {formatSizeLabel(size)}
              </div>

              {/* Current-stock badge. The label is a visible line, not just a
                  `title` tooltip — a tooltip never shows on the touchscreens
                  this app is mostly used on, which left the bare number here
                  reading as "stock is N" with no indication that the (empty)
                  input below it is an ADD delta, not the stock itself. */}
              {!readOnly && baseValue !== undefined && (
                <div className={cn(
                  'text-center rounded-md px-1 py-0.5 leading-tight',
                  base === 0
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                    : 'bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300'
                )}>
                  <div className="text-[11px] font-bold">{base}</div>
                  <div className="text-[8px] font-semibold uppercase tracking-wide opacity-80">{t('currentInStock')}</div>
                </div>
              )}

              {/* Quantity Input */}
              {readOnly ? (
                <div className={cn(
                  'text-center font-black text-lg rounded-lg py-1',
                  isEmpty ? 'text-slate-400 dark:text-slate-600' : 'text-slate-800 dark:text-slate-200'
                )}>
                  {qty}
                </div>
              ) : additiveMode ? (
                <LocalInput
                  type="number"
                  min="0"
                  value={delta === 0 ? '' : String(delta)}
                  placeholder={t('addPlaceholder')}
                  onCommit={v => handleChange(size, v)}
                  className={cn(inp, delta > 0 && 'border-emerald-400 dark:border-emerald-500/60 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300')}
                />
              ) : (
                <LocalInput
                  type="number"
                  min="0"
                  value={qty === 0 ? '' : String(qty)}
                  placeholder="0"
                  onCommit={v => handleChange(size, v)}
                  className={inp}
                />
              )}

              {/* New-total hint when the user is adding stock */}
              {additiveMode && delta > 0 && (
                <div className="text-center text-[9px] font-bold text-emerald-600 dark:text-emerald-400 tracking-wide uppercase">
                  = {qty}
                </div>
              )}

              {/* Per-size price: inline selling-price input + expander for MRP / cost */}
              {perSizePricing && !readOnly && qty > 0 && (
                <div className="flex items-center gap-0.5">
                  <div className="relative flex-1">
                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none">₹</span>
                    <LocalInput
                      type="number"
                      min="0"
                      value={prices.sellingPrice ? String(prices.sellingPrice) : ''}
                      placeholder={t('pricePlaceholder')}
                      onCommit={v => handlePriceChange(size, 'sellingPrice', v)}
                      className={cn(priceInp, 'pl-4 text-emerald-600 dark:text-emerald-400')}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedSize(prev => prev === size ? null : size)}
                    title={t('mrpCostTitle')}
                    className={cn(
                      'shrink-0 rounded-md p-1 transition-colors',
                      isExpanded
                        ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                    )}
                  >
                    {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Expanded per-size pricing panel */}
      {perSizePricing && expandedSize && !readOnly && (
        <div className="bg-amber-50/50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-xl p-3 space-y-2 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <IndianRupee size={12} className="text-amber-500" />
            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">
              {t('pricingFor', { size: formatSizeLabel(expandedSize) })}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1">{t('mrp')}</label>
              <LocalInput
                type="number"
                min="0"
                placeholder="0"
                value={sizePrices[expandedSize]?.mrp ? String(sizePrices[expandedSize].mrp) : ''}
                onCommit={v => handlePriceChange(expandedSize, 'mrp', v)}
                className={priceInp}
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1">{t('selling')}</label>
              <LocalInput
                type="number"
                min="0"
                placeholder="0"
                value={sizePrices[expandedSize]?.sellingPrice ? String(sizePrices[expandedSize].sellingPrice) : ''}
                onCommit={v => handlePriceChange(expandedSize, 'sellingPrice', v)}
                className={cn(priceInp, 'text-emerald-600 dark:text-emerald-400')}
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1">{t('cost')}</label>
              <LocalInput
                type="number"
                min="0"
                placeholder="0"
                value={sizePrices[expandedSize]?.cost ? String(sizePrices[expandedSize].cost) : ''}
                onCommit={v => handlePriceChange(expandedSize, 'cost', v)}
                className={cn(priceInp, 'text-amber-600 dark:text-amber-400')}
              />
            </div>
          </div>
          {/* Min Stock for this one size used to live here too, as a 4th
              field — moved to the always-visible "Variant Details" list
              below (with Barcode) so a shopkeeper can see and set every
              size's Min Stock at a glance, instead of it only existing for
              whichever size happens to be expanded right now. */}
        </div>
      )}

      {/* Every stocked variant's Barcode AND Min Stock, always visible and
          editable — not hidden behind expanding one size at a time. Barcode:
          this is what "Generate variant barcodes" (the caller's button,
          above this grid) actually produces a visible result for — without
          this list, clicking Generate silently filled sizePrices[*].barcode
          with nothing on screen to show for it. When set, the billing
          scanner matches this exact code and drops the right colour/size
          straight onto the bill; left blank, a scan falls back to the
          product's own barcode. Min Stock: per-size override for the
          low-stock alert threshold — left blank, that size falls back to
          the product's own overall Min Stock field further down (see the
          comment on that field for why it's a separate, not-a-duplicate,
          control). */}
      {perSizePricing && !readOnly && (() => {
        const stocked = sizeChart.filter(s => (value[s] ?? 0) > 0);
        if (stocked.length === 0) return null;
        return (
          <div className="space-y-1.5 pt-1">
            <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
              Variant Details
            </p>
            <div className="space-y-1.5">
              {stocked.map(size => (
                <div key={size} className="flex items-center gap-1.5">
                  <span className="shrink-0 w-14 text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate" title={formatSizeLabel(size)}>
                    {formatSizeLabel(size)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <label className="block text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-0.5">{t('variantBarcode')}</label>
                    <LocalInput
                      type="text"
                      placeholder={t('variantBarcodePlaceholder')}
                      value={sizePrices[size]?.barcode || ''}
                      onCommit={v => handleBarcodeChange(size, v)}
                      className={cn(priceInp, 'w-full text-left px-2.5 font-mono')}
                    />
                  </div>
                  <div className="w-16 shrink-0">
                    <label className="block text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-0.5" title="Fallback to the product's overall Min Stock if left blank">Min Stock</label>
                    <LocalInput
                      type="number"
                      min="0"
                      placeholder="Fallback"
                      value={sizePrices[size]?.minStock ? String(sizePrices[size].minStock) : ''}
                      onCommit={v => handlePriceChange(size, 'minStock', v)}
                      className={priceInp}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Total Stock Bar */}
      <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 rounded-lg px-4 py-2 border border-slate-200 dark:border-slate-700/50">
        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t('totalStock')}</span>
        <span className={cn(
          'text-lg font-black',
          total === 0 ? 'text-slate-300 dark:text-slate-600' : 'text-emerald-600 dark:text-emerald-400'
        )}>
          {total} {unitLabel}
        </span>
      </div>
    </div>
  );
}

/** Auto-generate a per-variant barcode from a base product code + variant key.
 *  Keeps it human-readable (e.g. "BAR-1782-BLUE-M") so a shopkeeper can eyeball
 *  a wrong scan; keeps it stable so re-generating twice on the same variant
 *  yields the same code (idempotent). Fills only missing entries — existing
 *  edits made by the user are left untouched.
 *
 *  When adding new variants later, only their empty slots get a new code, so
 *  the barcodes assigned to earlier variants never change (client requirement:
 *  new colours/sizes should not shift already-printed labels). */
export function generateVariantBarcodes(
  baseCode: string,
  variants: Record<string, number>,
  existing: Record<string, SizePriceEntry>,
): Record<string, SizePriceEntry> {
  const base = (baseCode || 'PRD').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  const next: Record<string, SizePriceEntry> = { ...existing };
  const used = new Set(
    Object.values(existing).map(e => (e.barcode || '').trim().toUpperCase()).filter(Boolean),
  );
  for (const key of Object.keys(variants)) {
    if (variants[key] <= 0) continue; // skip zero-qty rows to avoid label clutter
    const entry = next[key] || { mrp: 0, sellingPrice: 0, cost: 0 };
    // Preserve any user-set value INCLUDING an explicit empty string. A blank
    // input reads as "shopkeeper doesn't want a per-variant code here, fall
    // back to the product-level barcode when scanning" — never as "please
    // fill it in for me again." Only genuinely-untouched entries (undefined
    // barcode) get the auto-generated default.
    if (entry.barcode !== undefined) continue;
    const suffix = key.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
    let code = `${base}-${suffix}`;
    // In the rare case the same suffix collides (e.g. duplicated variant keys
    // after a migration), tack on a 3-char nonce so we never emit the same
    // code twice for two different variants.
    if (used.has(code)) {
      code = `${code}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    }
    used.add(code);
    next[key] = { ...entry, barcode: code };
  }
  return next;
}

/** Parse size_variants JSON string from DB into Record */
export function parseSizeVariants(json: string | null | undefined): Record<string, number> {
  if (!json) return {};
  try { return JSON.parse(json); } catch { return {}; }
}

/** Serialize size variants to JSON string for DB */
export function serializeSizeVariants(variants: Record<string, number>): string {
  return JSON.stringify(variants);
}

/** Calculate total stock from size variants */
export function totalFromSizes(variants: Record<string, number>): number {
  return Object.values(variants).reduce((s, v) => s + (v || 0), 0);
}

/** Parse size prices from metadata JSON */
export function parseSizePrices(metadata: any): Record<string, SizePriceEntry> {
  if (!metadata) return {};
  try {
    const m = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
    return m?.size_prices || {};
  } catch { return {}; }
}

/** Merge size_prices into existing metadata */
export function mergeSizePricesIntoMetadata(
  existingMetadata: any,
  sizePrices: Record<string, SizePriceEntry> | null,
  perSizePricing: boolean
): any {
  const m = typeof existingMetadata === 'string'
    ? (function() { try { return JSON.parse(existingMetadata); } catch { return {}; } })()
    : (existingMetadata || {});
  if (perSizePricing && sizePrices && Object.keys(sizePrices).length > 0) {
    return { ...m, size_prices: sizePrices, per_size_pricing: true };
  }
  // Clear per-size pricing
  const { size_prices, per_size_pricing, ...rest } = m;
  return rest;
}
