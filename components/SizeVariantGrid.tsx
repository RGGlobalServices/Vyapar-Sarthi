'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, IndianRupee } from 'lucide-react';

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

  // Barcode is a free-text field, not numeric — needs its own setter so a
  // shopkeeper can paste a real EAN, a scanner-generated code, or leave it
  // blank to fall back to the product-level barcode. Empty string clears it
  // (works as the client's requested "delete" action).
  function handleBarcodeChange(size: string, raw: string) {
    const current = sizePrices[size] || { mrp: 0, sellingPrice: 0, cost: 0 };
    const updated = { ...sizePrices, [size]: { ...current, barcode: raw.trim() || undefined } };
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

              {/* Current-stock badge */}
              {!readOnly && baseValue !== undefined && (
                <div className={cn(
                  'text-center text-[10px] font-bold rounded-md px-1 py-0.5',
                  base === 0
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                    : 'bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300'
                )} title={t('currentInStock')}>
                  {base}
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
                <input
                  type="number"
                  min="0"
                  value={delta === 0 ? '' : delta}
                  placeholder={t('addPlaceholder')}
                  onChange={e => handleChange(size, e.target.value)}
                  className={cn(inp, delta > 0 && 'border-emerald-400 dark:border-emerald-500/60 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300')}
                />
              ) : (
                <input
                  type="number"
                  min="0"
                  value={qty === 0 ? '' : qty}
                  placeholder="0"
                  onChange={e => handleChange(size, e.target.value)}
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
                    <input
                      type="number"
                      min="0"
                      value={prices.sellingPrice || ''}
                      placeholder={t('pricePlaceholder')}
                      onChange={e => handlePriceChange(size, 'sellingPrice', e.target.value)}
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1">{t('mrp')}</label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={sizePrices[expandedSize]?.mrp || ''}
                onChange={e => handlePriceChange(expandedSize, 'mrp', e.target.value)}
                className={priceInp}
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1">{t('selling')}</label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={sizePrices[expandedSize]?.sellingPrice || ''}
                onChange={e => handlePriceChange(expandedSize, 'sellingPrice', e.target.value)}
                className={cn(priceInp, 'text-emerald-600 dark:text-emerald-400')}
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1">{t('cost')}</label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={sizePrices[expandedSize]?.cost || ''}
                onChange={e => handlePriceChange(expandedSize, 'cost', e.target.value)}
                className={cn(priceInp, 'text-amber-600 dark:text-amber-400')}
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1" title="Fallback to global min stock if empty">Min Stock</label>
              <input
                type="number"
                min="0"
                placeholder="Global"
                value={sizePrices[expandedSize]?.minStock || ''}
                onChange={e => handlePriceChange(expandedSize, 'minStock', e.target.value)}
                className={priceInp}
              />
            </div>
          </div>
          {/* Per-variant barcode. When set, the billing scanner matches this
              exact code and drops the right colour/size straight into the bill. */}
          <div>
            <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1" title="Scannable code for this specific variant. Leave empty to fall back to the product's barcode.">
              {t('variantBarcode')}
            </label>
            <input
              type="text"
              placeholder={t('variantBarcodePlaceholder')}
              value={sizePrices[expandedSize]?.barcode || ''}
              onChange={e => handleBarcodeChange(expandedSize, e.target.value)}
              className={cn(priceInp, 'text-left px-3 font-mono')}
            />
          </div>
        </div>
      )}

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
    if (entry.barcode && entry.barcode.trim()) continue; // preserve user edits
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
