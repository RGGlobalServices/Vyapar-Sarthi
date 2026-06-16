'use client';
import { cn } from '@/lib/utils';

interface SizeVariantGridProps {
  sizeChart: string[];       // e.g. ['UK5','UK6','UK7','UK8']
  value: Record<string, number>; // e.g. { UK6: 5, UK8: 12 }
  onChange: (variants: Record<string, number>) => void;
  readOnly?: boolean;
}

export default function SizeVariantGrid({ sizeChart, value, onChange, readOnly }: SizeVariantGridProps) {
  const total = Object.values(value).reduce((s, v) => s + (v || 0), 0);

  function handleChange(size: string, rawVal: string) {
    const qty = Math.max(0, parseInt(rawVal) || 0);
    onChange({ ...value, [size]: qty });
  }

  const inp = 'w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-100 text-center text-sm font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors';

  return (
    <div className="space-y-3">
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(sizeChart.length, 4)}, 1fr)` }}>
        {sizeChart.map(size => {
          const qty = value[size] ?? 0;
          const isEmpty = qty === 0;
          return (
            <div key={size} className="space-y-1">
              <div className={cn(
                'text-[10px] font-bold text-center rounded-md px-1 py-0.5 uppercase tracking-wide',
                isEmpty
                  ? 'bg-slate-800 text-slate-500'
                  : qty <= 2
                  ? 'bg-red-500/20 text-red-400'
                  : qty <= 5
                  ? 'bg-orange-500/20 text-orange-400'
                  : 'bg-emerald-500/20 text-emerald-400'
              )}>
                {size}
              </div>
              {readOnly ? (
                <div className={cn(
                  'text-center font-black text-lg rounded-lg py-1',
                  isEmpty ? 'text-slate-600' : 'text-slate-200'
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
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between bg-slate-800/50 rounded-lg px-4 py-2 border border-slate-700/50">
        <span className="text-xs text-slate-400 font-medium">Total Stock</span>
        <span className={cn(
          'text-lg font-black',
          total === 0 ? 'text-slate-600' : 'text-emerald-400'
        )}>
          {total} pairs
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
