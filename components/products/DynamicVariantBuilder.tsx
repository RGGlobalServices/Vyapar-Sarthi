'use client';
/**
 * DynamicVariantBuilder
 * A variant row editor that derives its axis columns from CategoryConfig.variantAxes
 * instead of hardcoding Color / Size.
 *
 * Each variant row maps to an entry in Product.variants[] JSON.  Known keys:
 *   color, size → stored at v.color / v.size (existing convention)
 *   anything else → stored at v.extraAttrs[key]  (new, non-breaking)
 *
 * Pricing columns (MRP, Cost, Wholesale, Retail, Stock) are always shown.
 */
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CategoryAttributeSchema, AttributeDef } from '@/lib/categoryConfig';

// Map well-known keys to their existing variant row fields
function getAxisVal(row: any, key: string): string {
  if (key === 'color') return row.color ?? '';
  if (key === 'size') return row.size ?? '';
  return (row.extraAttrs?.[key] ?? '');
}
function setAxisVal(row: any, key: string, val: string): any {
  if (key === 'color') return { ...row, color: val };
  if (key === 'size') return { ...row, size: val };
  return { ...row, extraAttrs: { ...(row.extraAttrs ?? {}), [key]: val } };
}

interface Props {
  schema: CategoryAttributeSchema;
  variants: any[];
  onChange: (rows: any[]) => void;
  samePrice: boolean;
}

export default function DynamicVariantBuilder({ schema, variants, onChange, samePrice }: Props) {
  const axes = schema.variantAxes.length > 0
    ? schema.attributes.filter(a => schema.variantAxes.includes(a.key))
    : schema.attributes.filter(a => a.inVariant);

  // Fall back to old Color/Size if no axes configured
  const effectiveAxes: AttributeDef[] = axes.length > 0 ? axes : [
    { key: 'color', label: 'Color', type: 'text', required: false, inVariant: true },
    { key: 'size',  label: 'Size',  type: 'text', required: false, inVariant: true },
  ];

  const addRow = () => {
    const seed: any = {};
    effectiveAxes.forEach(a => {
      if (a.key === 'color') seed.color = '';
      else if (a.key === 'size') seed.size = '';
      else seed.extraAttrs = { ...(seed.extraAttrs ?? {}), [a.key]: '' };
    });
    onChange([...variants, { ...seed, mrp: 0, costPrice: 0, wholesalePrice: 0, sellingPrice: 0, stock: 0 }]);
  };

  const update = (i: number, patch: Partial<any>) => {
    const next = variants.map((r, idx) => idx === i ? { ...r, ...patch } : r);
    onChange(next);
  };

  const remove = (i: number) => onChange(variants.filter((_, idx) => idx !== i));

  const setAxis = (i: number, key: string, val: string) => {
    onChange(variants.map((r, idx) => idx === i ? setAxisVal(r, key, val) : r));
  };

  const inputCls = 'w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white shadow-sm outline-none focus:ring-1 focus:ring-emerald-500';

  return (
    <div className="space-y-4">
      {variants.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-6 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-slate-400 text-sm">
          <span>No variants yet</span>
          <button type="button" onClick={addRow} className="text-indigo-600 hover:underline text-xs">+ Add first row</button>
        </div>
      )}

      {variants.map((v, i) => (
        <div key={i} className="flex flex-wrap sm:flex-nowrap gap-3 items-end p-4 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 relative group">
          {/* Dynamic axis columns */}
          {effectiveAxes.map(attr => (
            <AxisInput
              key={attr.key}
              attr={attr}
              value={getAxisVal(v, attr.key)}
              onChange={val => setAxis(i, attr.key, val)}
              className="min-w-[100px] flex-1"
            />
          ))}

          {/* Pricing (hidden when samePrice) */}
          {!samePrice && (
            <>
              <div className="w-24 shrink-0">
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">MRP</label>
                <input type="number" className={inputCls} value={v.mrp || ''} onChange={e => update(i, { mrp: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="w-24 shrink-0">
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Cost</label>
                <input type="number" className={inputCls} value={v.costPrice || ''} onChange={e => update(i, { costPrice: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="w-24 shrink-0">
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Wholesale</label>
                <input type="number" className={inputCls} value={v.wholesalePrice || ''} onChange={e => update(i, { wholesalePrice: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="w-24 shrink-0">
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Retail</label>
                <input type="number" className={inputCls} value={v.sellingPrice || ''} onChange={e => update(i, { sellingPrice: parseFloat(e.target.value) || 0 })} />
              </div>
            </>
          )}

          {/* Stock */}
          <div className="w-24 shrink-0">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Stock</label>
            <input type="number" className={inputCls} value={v.stock || ''} onChange={e => update(i, { stock: parseFloat(e.target.value) || 0 })} />
          </div>

          <button type="button" onClick={() => remove(i)}
            className="self-end pb-2.5 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-sm text-slate-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add variant row
      </button>
    </div>
  );
}

function AxisInput({ attr, value, onChange, className }: {
  attr: AttributeDef;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const cls = 'w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white shadow-sm outline-none focus:ring-1 focus:ring-emerald-500';

  return (
    <div className={className}>
      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">{attr.label}</label>

      {attr.type === 'select' && attr.options && attr.options.length > 0 ? (
        <>
          <select className={cls} value={value} onChange={e => onChange(e.target.value)}>
            <option value="">—</option>
            {attr.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          {/* Quick pills for common options */}
          {attr.options.length <= 12 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {attr.options.map(o => (
                <button key={o} type="button" onClick={() => onChange(o)}
                  className={cn('text-[9px] px-1.5 py-0.5 rounded border transition-colors',
                    value === o
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-emerald-400')}>
                  {o}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <input
          type={attr.type === 'number' ? 'number' : 'text'}
          className={cls}
          value={value}
          placeholder={attr.placeholder ?? attr.label}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
