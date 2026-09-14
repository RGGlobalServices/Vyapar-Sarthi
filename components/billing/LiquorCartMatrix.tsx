'use client';
import { useMemo } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildLiquorCartMatrix, type LiquorMatrixInputRow, type LiquorCartInputLine, type LiquorCartCell } from '@/lib/liquorMatrix';

interface Props {
  catalogRows: LiquorMatrixInputRow[]; // full product catalogue (so a touched brand's untouched sizes still show)
  lines: LiquorCartInputLine[]; // what's actually in the cart right now
  onAdd: (productId: string | number, variantKey: string | undefined) => void;
  onDecrement: (productId: string | number, variantKey: string | undefined, newQty: number) => void;
  onRemoveRow: (productId: string | number, variantKey: string | undefined) => void;
}

export default function LiquorCartMatrix({ catalogRows, lines, onAdd, onDecrement, onRemoveRow }: Props) {
  const matrix = useMemo(() => buildLiquorCartMatrix(catalogRows, lines), [catalogRows, lines]);
  const grandTotal = useMemo(() => matrix.rows.reduce((s, r) => s + r.total, 0), [matrix.rows]);

  if (matrix.rows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border-2 border-slate-300 dark:border-slate-700">
      <table className="w-full text-left text-sm border-collapse min-w-[500px]">
        <thead>
          <tr className="bg-slate-800 dark:bg-slate-900">
            <th className="px-4 py-3 font-black text-white uppercase tracking-wide text-xs border-r border-slate-600">Brand</th>
            {matrix.columns.map(col => (
              <th key={col} className="px-3 py-3 text-center font-black text-white uppercase tracking-wide text-xs border-r border-slate-600 whitespace-nowrap">{col}</th>
            ))}
            <th className="px-4 py-3 text-right font-black text-white uppercase tracking-wide text-xs border-r border-slate-600 whitespace-nowrap">Total</th>
            <th className="px-3 py-3 w-8 bg-slate-800 dark:bg-slate-900" />
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row, rowIdx) => (
            <tr key={row.brand} className={cn('border-b-2 border-slate-300 dark:border-slate-700', rowIdx % 2 === 1 && 'bg-slate-50 dark:bg-slate-800/40')}>
              <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-700">{row.brand}</td>
              {matrix.columns.map(col => {
                const cell: LiquorCartCell | undefined = row.cells[col];
                if (!cell) return <td key={col} className="px-3 py-3 text-center text-slate-300 dark:text-slate-700 border-r border-slate-200 dark:border-slate-700">—</td>;
                const outOfStock = cell.stock <= 0 && cell.qty <= 0;
                return (
                  <td key={col} className="px-3 py-3 border-r border-slate-200 dark:border-slate-700">
                    <div className={cn('mx-auto w-[96px] rounded-lg border p-1.5 text-center',
                      cell.qty > 0 ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700')}>
                      <div className="flex items-center justify-between gap-1">
                        <button
                          onClick={() => onDecrement(cell.productId, cell.variantKey, Math.max(0, cell.qty - 1))}
                          disabled={cell.qty <= 0}
                          className="w-6 h-6 flex items-center justify-center rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors"
                        >
                          <Minus size={12} />
                        </button>
                        <span className={cn('text-sm font-bold tabular-nums', cell.qty > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400')}>
                          {cell.qty}
                        </span>
                        <button
                          onClick={() => onAdd(cell.productId, cell.variantKey)}
                          disabled={outOfStock}
                          className="w-6 h-6 flex items-center justify-center rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                      <div className="text-[10px] font-semibold text-slate-500 mt-1">
                        {outOfStock ? 'Out' : `${cell.stock} left`}{cell.price != null ? ` · ₹${cell.price.toFixed(0)}` : ''}
                      </div>
                    </div>
                  </td>
                );
              })}
              <td className="px-4 py-3 text-right font-black text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-700">₹{row.total.toLocaleString('en-IN')}</td>
              <td className="px-3 py-3">
                <button
                  onClick={() => {
                    for (const cell of Object.values(row.cells)) if (cell.qty > 0) onRemoveRow(cell.productId, cell.variantKey);
                  }}
                  title="Remove brand from bill"
                  className="text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        {matrix.rows.length > 1 && (
          <tfoot>
            <tr className="bg-slate-100 dark:bg-slate-800/60">
              <td colSpan={matrix.columns.length + 1} className="px-4 py-2.5 text-right text-xs font-black text-slate-600 dark:text-slate-300 uppercase border-r border-slate-200 dark:border-slate-700">Liquor Subtotal</td>
              <td className="px-4 py-2.5 text-right font-black text-slate-900 dark:text-slate-100">₹{grandTotal.toLocaleString('en-IN')}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
