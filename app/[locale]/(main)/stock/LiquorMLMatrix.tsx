'use client';
import { useMemo, useState } from 'react';
import { Wine, Search, Plus, Minus, Loader2, FileText, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { buildLiquorMatrix, type LiquorMatrixInputRow, type LiquorMatrixCell } from '@/lib/liquorMatrix';
import { exportLiquorMlMatrixPDF } from '@/lib/pdf/liquorMlMatrix';

interface Props {
  rows: LiquorMatrixInputRow[];
  loading?: boolean;
  shopName?: string;
  // Instant +/- on one cell — the caller owns the optimistic update (its own
  // products/items state) and the actual API call; this component just
  // re-renders once `rows` reflects the change, no local shadow state.
  onAdjustCell: (cell: LiquorMatrixCell, delta: number) => void;
  // "Dynamic Entry" — one new brand with stock/price filled in for however
  // many of the current columns the shopkeeper fills in (zero-qty columns
  // are skipped, not created as empty rows).
  onAddBrand: (name: string, entries: Array<{ column: string; qty: number; price: number }>) => Promise<void> | void;
}

export default function LiquorMLMatrix({ rows, loading, shopName, onAdjustCell, onAddBrand }: Props) {
  const [search, setSearch] = useState('');
  const [pendingCell, setPendingCell] = useState<string | null>(null);
  const matrix = useMemo(() => buildLiquorMatrix(rows), [rows]);
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return matrix.rows;
    return matrix.rows.filter(r => r.brand.toLowerCase().includes(q));
  }, [matrix.rows, search]);

  const [newName, setNewName] = useState('');
  const [newVals, setNewVals] = useState<Record<string, { qty: string; price: string }>>({});
  const [adding, setAdding] = useState(false);

  const updateNewVal = (col: string, field: 'qty' | 'price', value: string) => {
    setNewVals(v => ({ ...v, [col]: { qty: v[col]?.qty ?? '', price: v[col]?.price ?? '', [field]: value } }));
  };

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    const entries = matrix.columns
      .map(col => ({ column: col, qty: Number(newVals[col]?.qty) || 0, price: Number(newVals[col]?.price) || 0 }))
      .filter(e => e.qty > 0);
    if (entries.length === 0) return;
    setAdding(true);
    try {
      await onAddBrand(name, entries);
      setNewName('');
      setNewVals({});
    } finally {
      setAdding(false);
    }
  }

  async function handleAdjust(cell: LiquorMatrixCell, col: string, delta: number) {
    if (delta < 0 && cell.stock <= 0) return;
    const key = `${cell.productId}:${cell.variantIndex ?? col}`;
    setPendingCell(key);
    try {
      await onAdjustCell(cell, delta);
    } finally {
      setPendingCell(null);
    }
  }

  function downloadPDF() {
    if (matrix.rows.length === 0) return;
    exportLiquorMlMatrixPDF({ columns: matrix.columns, rows: filteredRows }, shopName || 'Vyapar Sarthi');
  }

  function downloadCSV() {
    if (matrix.rows.length === 0) return;
    const headers = ['Brand', ...matrix.columns.map(c => `${c} Qty`), ...matrix.columns.map(c => `${c} Price`), 'Total'];
    const csvRows = filteredRows.map(row => {
      const qtyCells = matrix.columns.map(col => row.cells[col]?.stock ?? '');
      const priceCells = matrix.columns.map(col => row.cells[col]?.price ?? '');
      return [`"${row.brand.replace(/"/g, '""')}"`, ...qtyCells, ...priceCells, row.total].join(',');
    });
    const csvString = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `ML_Matrix_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Wine size={16} className="text-emerald-500" />
        One row per brand, one column per pack size — use +/- to adjust stock right here, or add a new brand below.
      </div>

      {/* Dynamic Entry — add a brand and fill stock/price for every size at once */}
      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[180px] flex-1">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Product Name</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Kingfisher Strong"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            {matrix.columns.map(col => (
              <div key={col} className="w-36">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">{col} (Qty / ₹)</label>
                <div className="flex gap-1">
                  <input
                    type="number" min="0" placeholder="Qty"
                    value={newVals[col]?.qty ?? ''}
                    onChange={e => updateNewVal(col, 'qty', e.target.value)}
                    className="w-full px-2 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <input
                    type="number" min="0" placeholder="₹"
                    value={newVals[col]?.price ?? ''}
                    onChange={e => updateNewVal(col, 'price', e.target.value)}
                    className="w-full px-2 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            ))}
            <button
              onClick={handleAdd}
              disabled={adding || !newName.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg text-sm transition-colors"
            >
              {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add Product
            </button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search brand…"
            className="pl-8 pr-3 py-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <button
          onClick={downloadPDF}
          disabled={filteredRows.length === 0}
          title="Download PDF"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 whitespace-nowrap">
          <FileText size={14} /> PDF
        </button>
        <button
          onClick={downloadCSV}
          disabled={filteredRows.length === 0}
          title="Download Excel"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 whitespace-nowrap">
          <FileSpreadsheet size={14} /> Excel
        </button>
      </div>

      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 dark:bg-slate-800/60 text-slate-400 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 sticky left-0 bg-slate-100 dark:bg-slate-800/60 z-10 min-w-[180px]">Brand</th>
                  {matrix.columns.map(col => (
                    <th key={col} className="px-3 py-3 text-center whitespace-nowrap">{col}</th>
                  ))}
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {loading ? (
                  <tr><td colSpan={matrix.columns.length + 2} className="px-4 py-12 text-center text-slate-500">Loading…</td></tr>
                ) : filteredRows.length === 0 ? (
                  <tr><td colSpan={matrix.columns.length + 2} className="px-4 py-12 text-center text-slate-500">No sized liquor products found — add one above.</td></tr>
                ) : filteredRows.map(row => (
                  <tr key={row.brand} className="text-slate-900 dark:text-slate-200">
                    <td className="px-4 py-2.5 font-semibold sticky left-0 bg-white dark:bg-slate-900">{row.brand}</td>
                    {matrix.columns.map(col => {
                      const cell: LiquorMatrixCell | undefined = row.cells[col];
                      if (!cell) {
                        return <td key={col} className="px-3 py-2.5 text-center text-slate-300 dark:text-slate-700">—</td>;
                      }
                      const key = `${cell.productId}:${cell.variantIndex ?? col}`;
                      const isPending = pendingCell === key;
                      return (
                        <td key={col} className="px-3 py-2.5">
                          <div className={cn('mx-auto w-[120px] rounded-lg border p-1.5',
                            cell.stock <= 0 ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700')}>
                            <div className="flex items-center justify-between gap-1">
                              <button
                                onClick={() => handleAdjust(cell, col, -1)}
                                disabled={isPending || cell.stock <= 0}
                                className="w-6 h-6 flex items-center justify-center rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
                              >
                                <Minus size={12} />
                              </button>
                              <span className={cn('text-sm font-bold tabular-nums', cell.stock <= 0 ? 'text-red-500' : 'text-slate-900 dark:text-slate-100')}>
                                {isPending ? <Loader2 size={12} className="animate-spin" /> : cell.stock}
                              </span>
                              <button
                                onClick={() => handleAdjust(cell, col, 1)}
                                disabled={isPending}
                                className="w-6 h-6 flex items-center justify-center rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                            {cell.price != null && <div className="text-center text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">₹{cell.price.toFixed(0)}</div>}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-4 py-2.5 text-right font-bold text-slate-600 dark:text-slate-300">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
