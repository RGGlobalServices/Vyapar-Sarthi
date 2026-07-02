'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, IndianRupee } from 'lucide-react';

export interface SizePriceEntry {
  mrp: number;
  sellingPrice: number;
  cost: number;
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
}

const inp = 'w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-900 dark:text-slate-100 text-center text-sm font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors';
const priceInp = 'w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-slate-900 dark:text-slate-100 text-center text-[11px] font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors';

export default function SizeVariantGrid({
  sizeChart, value, onChange, readOnly,
  unitLabel = 'units',
  perSizePricing, sizePrices = {}, onSizePricesChange,
}: SizeVariantGridProps) {
  const t = useTranslations('Variants');
  const total = Object.values(value).reduce((s, v) => s + (v || 0), 0);
  const [expandedSize, setExpandedSize] = useState<string | null>(null);

  function handleChange(size: string, rawVal: string) {
    const qty = Math.max(0, parseInt(rawVal) || 0);
    onChange({ ...value, [size]: qty });
  }

  function handlePriceChange(size: string, field: keyof SizePriceEntry, rawVal: string) {
    const num = Math.max(0, parseFloat(rawVal) || 0);
    const current = sizePrices[size] || { mrp: 0, sellingPrice: 0, cost: 0 };
    const updated = { ...sizePrices, [size]: { ...current, [field]: num } };
    onSizePricesChange?.(updated);
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(sizeChart.length, 4)}, 1fr)` }}>
        {sizeChart.map(size => {
          const qty = value[size] ?? 0;
          const isEmpty = qty === 0;
          const isExpanded = perSizePricing && expandedSize === size;
          const prices = sizePrices[size] || { mrp: 0, sellingPrice: 0, cost: 0 };

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
                {size}
              </div>

              {/* Quantity Input */}
              {readOnly ? (
                <div className={cn(
                  'text-center font-black text-lg rounded-lg py-1',
                  isEmpty ? 'text-slate-400 dark:text-slate-600' : 'text-slate-800 dark:text-slate-200'
                )}>
                  {qty}
                </div>
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
              {t('pricingFor', { size: expandedSize })}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
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
