'use client';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Plus, X, Palette, Scaling } from 'lucide-react';

export type VariantItem = {
  color?: string;
  size?: string;
  quantity: number;
};

interface VariantBuilderProps {
  value: VariantItem[];
  onChange: (variants: VariantItem[]) => void;
  sizeChart?: string[]; // predefined sizes from business config
  hasColors?: boolean;
  hasSizes?: boolean;
}

export default function VariantBuilder({ value, onChange, sizeChart = [], hasColors = true, hasSizes = true }: VariantBuilderProps) {
  // Extract unique colors and sizes from the current value
  const activeColors = useMemo(() => {
    const c = new Set<string>();
    value.forEach(v => { if (v.color) c.add(v.color); });
    return Array.from(c);
  }, [value]);

  const activeSizes = useMemo(() => {
    const s = new Set<string>();
    value.forEach(v => { if (v.size) s.add(v.size); });
    return Array.from(s);
  }, [value]);

  // If component is mounted with empty value, we can prepopulate rows/cols
  // For simplicity, we let the user explicitly add a Color Row.
  const [newColor, setNewColor] = useState('');
  
  // We use the superset of sizes: bizConfig sizeChart + any custom sizes added.
  const columns = Array.from(new Set([...sizeChart, ...activeSizes]));
  const rows = activeColors.length > 0 ? activeColors : ['Default']; // If no colors added, use a default row if hasColors=false

  const totalStock = value.reduce((sum, v) => sum + (v.quantity || 0), 0);

  const getQty = (c: string, s: string) => {
    return value.find(v => v.color === c && v.size === s)?.quantity || 0;
  };

  const handleUpdate = (c: string, s: string, rawVal: string) => {
    const qty = Math.max(0, parseInt(rawVal) || 0);
    let next = [...value];
    const idx = next.findIndex(v => v.color === c && v.size === s);
    if (idx >= 0) {
      if (qty === 0) {
        next.splice(idx, 1); // remove if 0 to keep JSON clean
      } else {
        next[idx].quantity = qty;
      }
    } else if (qty > 0) {
      next.push({ color: c, size: s, quantity: qty });
    }
    onChange(next);
  };

  const addColorRow = () => {
    const c = newColor.trim();
    if (!c || activeColors.includes(c)) return;
    // We just trigger a state update by adding a 0-qty item (or we can just let activeColors be driven by actual items)
    // To make an empty row appear, we MUST add an item with 0 quantity.
    // Let's add it for the first available size column.
    const firstCol = columns[0] || 'Default';
    onChange([...value, { color: c, size: firstCol, quantity: 0 }]);
    setNewColor('');
  };

  const removeColorRow = (c: string) => {
    onChange(value.filter(v => v.color !== c));
  };

  const inp = 'w-full min-w-[60px] md:min-w-[70px] bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-2 text-slate-900 dark:text-slate-100 text-center text-sm font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

  if (!hasColors && !hasSizes) return null;

  return (
    <div className="space-y-4 bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700/50 rounded-xl p-4">
      
      {/* Header / Add Color */}
      {hasColors && (
        <div className="flex items-center gap-2">
          <Palette size={16} className="text-slate-500" />
          <input
            className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none"
            placeholder="Add new color (e.g. Red, XL...)"
            value={newColor}
            onChange={e => setNewColor(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addColorRow())}
          />
          <button type="button" onClick={addColorRow} className="bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-emerald-600 transition-colors flex items-center gap-1">
            <Plus size={14} /> Add Color
          </button>
        </div>
      )}

      {/* Matrix */}
      <div className="overflow-x-auto pb-2">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr>
              {hasColors && <th className="p-2 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 uppercase">Color</th>}
              {hasSizes && columns.map(col => (
                <th key={col} className="p-2 border-b border-slate-200 dark:border-slate-700 text-center">
                  <span className="text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded px-2 py-1 uppercase tracking-wide">
                    {col}
                  </span>
                </th>
              ))}
              {hasColors && <th className="p-2 border-b border-slate-200 dark:border-slate-700 w-10"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(color => {
              const displayColor = color === 'Default' ? 'Default Color' : color;
              return (
                <tr key={color} className="group">
                  {hasColors && (
                    <td className="p-2 align-middle border-b border-slate-100 dark:border-slate-800/50">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: color.toLowerCase() }} />
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200 capitalize">{displayColor}</span>
                      </div>
                    </td>
                  )}
                  {hasSizes && columns.map(size => {
                    const qty = getQty(color, size);
                    return (
                      <td key={size} className="p-2 align-middle border-b border-slate-100 dark:border-slate-800/50">
                        <input
                          type="number" min="0" placeholder="0"
                          value={qty === 0 ? '' : qty}
                          onChange={e => handleUpdate(color, size, e.target.value)}
                          className={cn(inp, qty > 0 ? 'border-emerald-500 dark:border-emerald-500/50 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : '')}
                        />
                      </td>
                    );
                  })}
                  {hasColors && (
                    <td className="p-2 align-middle border-b border-slate-100 dark:border-slate-800/50 text-center">
                      <button type="button" onClick={() => removeColorRow(color)} className="opacity-100 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 p-1.5 rounded transition-all">
                        <X size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-lg px-4 py-3 border border-slate-200 dark:border-slate-800">
        <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total Variants Stock</span>
        <span className={cn('text-xl font-black', totalStock === 0 ? 'text-slate-400' : 'text-emerald-500')}>
          {totalStock}
        </span>
      </div>
    </div>
  );
}
