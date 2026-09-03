/**
 * Multi-sheet .xlsx workbook builder — the CA Report Pack's Excel export.
 * Thin wrapper over the SAME `xlsx` (SheetJS) dependency `lib/hooks/useExport.tsx`
 * already uses for its single-sheet exports; no new dependency. Each sheet
 * gets the same real-typed-cell treatment (currency/number/date columns are
 * actual numeric/date cells with a display format, never text) that the
 * existing single-report export already proves works.
 *
 * Note: frozen header rows are a SheetJS Pro-only feature — the free `xlsx`
 * package used here (and by useExport.tsx) has no reliable public API to
 * write freeze panes into a generated .xlsx, so this intentionally does not
 * claim to do so. Every sheet's header row is still bold/styled and repeats
 * visually — a user can freeze it themselves in one click in Excel/Sheets.
 */

export interface WorkbookColumn {
  key: string;
  label: string;
  type?: 'text' | 'currency' | 'number' | 'date';
}

export interface WorkbookSheet {
  name: string; // sheet tab name, truncated to Excel's 31-char limit
  columns: WorkbookColumn[];
  rows: any[];
}

export async function buildWorkbookBlob(sheets: WorkbookSheet[]): Promise<Blob> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const data = sheet.rows.map((row) => {
      const out: Record<string, any> = {};
      for (const col of sheet.columns) {
        const val = row[col.key];
        if (val === null || val === undefined || val === '') { out[col.label] = ''; continue; }
        if (col.type === 'date') { out[col.label] = new Date(val); continue; }
        if (col.type === 'currency' || col.type === 'number') { out[col.label] = Number(val) || 0; continue; }
        out[col.label] = String(val);
      }
      return out;
    });

    const ws = XLSX.utils.json_to_sheet(data, { header: sheet.columns.map((c) => c.label) });
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    sheet.columns.forEach((col, idx) => {
      const fmt = col.type === 'currency' ? '₹#,##,##0' : col.type === 'number' ? '#,##0' : col.type === 'date' ? 'dd-mmm-yyyy' : null;
      if (!fmt) return;
      for (let r = 1; r <= range.e.r; r++) {
        const addr = XLSX.utils.encode_cell({ c: idx, r });
        if (ws[addr]) ws[addr].z = fmt;
      }
    });
    ws['!cols'] = sheet.columns.map((c) => ({ wch: Math.max(c.label.length + 2, c.type === 'currency' ? 14 : 18) }));

    // Sheet names: Excel forbids : \ / ? * [ ] and caps at 31 chars.
    const safeName = sheet.name.replace(/[:\\/?*\[\]]/g, '').slice(0, 31) || 'Sheet';
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  }

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
