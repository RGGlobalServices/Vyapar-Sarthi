'use client';

import { useCallback } from 'react';
import { Download } from 'lucide-react';
import { saveOrShareBlob } from '@/lib/nativeSave';

interface ExportConfig {
  filename?: string;
  columns: { key: string; label: string; type?: 'text' | 'currency' | 'number' | 'date' }[];
  data: any[];
}

export function useExport() {
  const exportToCSV = useCallback(async ({ filename = 'report', columns, data }: ExportConfig) => {
    const headers = columns.map(c => c.label).join(',');
    const rows = data.map(row =>
      columns.map(col => {
        const val = row[col.key];
        if (val === null || val === undefined) return '';
        if (col.type === 'date') return new Date(val).toLocaleDateString('en-IN');
        if (col.type === 'currency' || col.type === 'number') return Number(val).toFixed(2);
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',')
    ).join('\n');

    const csv = `${headers}\n${rows}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const name = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    if (await saveOrShareBlob(blob, name)) return;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', name);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, []);

  const exportToJSON = useCallback(async ({ filename = 'report', data }: { filename?: string; data: any[] }) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const name = `${filename}_${new Date().toISOString().split('T')[0]}.json`;
    if (await saveOrShareBlob(blob, name)) return;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', name);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, []);

  const printTable = useCallback(({ title, columns, data }: ExportConfig & { title?: string }) => {
    const html = `
      <html><head><title>${title || 'Report'}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; padding: 20px; }
        h1 { font-size: 16px; margin-bottom: 4px; }
        p.meta { font-size: 10px; color: #666; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #1e293b; color: white; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
        td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
        tr:nth-child(even) td { background: #f8fafc; }
        tfoot td { font-weight: bold; background: #f1f5f9; border-top: 2px solid #1e293b; }
      </style>
      </head><body>
      <h1>${title || 'Report'}</h1>
      <p class="meta">Generated on ${new Date().toLocaleString('en-IN')} | Total Records: ${data.length}</p>
      <table>
        <thead><tr>${columns.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
        <tbody>
          ${data.map(row => `<tr>${columns.map(col => {
            const val = row[col.key];
            if (val === null || val === undefined) return '<td>—</td>';
            if (col.type === 'date') return `<td>${new Date(val).toLocaleDateString('en-IN')}</td>`;
            if (col.type === 'currency') return `<td>₹${Number(val).toLocaleString('en-IN')}</td>`;
            if (col.type === 'number') return `<td>${Number(val).toLocaleString('en-IN')}</td>`;
            return `<td>${String(val)}</td>`;
          }).join('')}</tr>`).join('')}
        </tbody>
      </table>
      </body></html>
    `;
    const w = window.open('', '_blank', 'width=900,height=700');
    w?.document.write(html);
    w?.document.close();
    w?.print();
  }, []);

  return { exportToCSV, exportToJSON, printTable };
}

interface ExportButtonProps {
  columns: ExportConfig['columns'];
  data: any[];
  filename?: string;
  title?: string;
}

export function ExportButton({ columns, data, filename, title }: ExportButtonProps) {
  const { exportToCSV, printTable } = useExport();
  const [open, setOpen] = ([] as any[]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          onClick={() => exportToCSV({ columns, data, filename })}
          className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700"
        >
          <Download size={14} />
          Export CSV
        </button>
        <button
          onClick={() => printTable({ columns, data, filename, title })}
          className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700"
        >
          Print
        </button>
      </div>
    </div>
  );
}
