'use client';

import { useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronRight } from 'lucide-react';

interface Column {
  key: string;
  label: string;
  type?: 'text' | 'currency' | 'number' | 'percent' | 'date' | 'badge';
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
}

interface ReportTableProps {
  columns: Column[];
  rows: any[];
  onRowClick?: (row: any) => void;
  emptyMessage?: string;
  maxHeight?: string;
  loading?: boolean;
}

function formatCell(value: any, type?: string) {
  if (value === null || value === undefined) return '—';
  switch (type) {
    case 'currency': return `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    case 'number': return Number(value).toLocaleString('en-IN');
    case 'percent': return `${Number(value).toFixed(1)}%`;
    case 'date': return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    default: return String(value);
  }
}

export default function ReportTable({ columns, rows, onRowClick, emptyMessage = 'No data found', maxHeight, loading }: ReportTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const filtered = rows.filter(row => {
    if (!search) return true;
    return Object.values(row).some(v => String(v).toLowerCase().includes(search.toLowerCase()));
  });

  const sorted = sortKey ? [...filtered].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    const diff = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? diff : -diff;
  }) : filtered;

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-10 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {rows.length > 8 && (
        <div className="px-4 pb-3">
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full text-sm px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      )}
      <div style={{ maxHeight }} className={maxHeight ? 'overflow-y-auto' : ''}>
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 select-none ${col.sortable ? 'cursor-pointer hover:text-slate-800 dark:hover:text-white' : ''} ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}`}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    {col.label}
                    {col.sortable && (
                      sortKey === col.key
                        ? sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                        : <ArrowUpDown size={12} className="opacity-30" />
                    )}
                  </span>
                </th>
              ))}
              {onRowClick && <th className="w-8" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (onRowClick ? 1 : 0)} className="px-4 py-12 text-center text-slate-400 font-medium">
                  {emptyMessage}
                </td>
              </tr>
            ) : sorted.map((row, i) => (
              <tr
                key={i}
                className={`${onRowClick ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50' : ''} transition-colors group`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map(col => (
                  <td key={col.key} className={`px-4 py-3 text-slate-700 dark:text-slate-300 ${col.align === 'right' ? 'text-right font-mono font-bold' : col.align === 'center' ? 'text-center' : ''} ${col.type === 'currency' ? 'font-bold text-slate-900 dark:text-white' : ''}`}>
                    {col.type === 'badge' ? (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {String(row[col.key] ?? '—')}
                      </span>
                    ) : formatCell(row[col.key], col.type)}
                  </td>
                ))}
                {onRowClick && (
                  <td className="px-2">
                    <ChevronRight size={14} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > 0 && (
        <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100 dark:border-slate-800">
          Showing {sorted.length} {sorted.length !== rows.length ? `of ${rows.length} ` : ''}records
        </div>
      )}
    </div>
  );
}
