'use client';

import { useCallback, createContext, useContext, useMemo, type ReactNode } from 'react';
import { Download, FileText, Printer, FileSpreadsheet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { saveOrShareBlob } from '@/lib/nativeSave';
import { useBusinessStore } from '@/lib/businessStore';

// Ambient "current report period" — set once at the page level so every
// ExportButton on the page can put the correct "01 Jul 2026 – 31 Jul 2026"
// on the PDF/print letterhead without each callsite having to pass it.
const ReportPeriodContext = createContext<string | null>(null);

const fmtDate = (v: string | Date) =>
  new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export function ReportPeriodProvider({
  startDate,
  endDate,
  children,
}: {
  startDate?: string;
  endDate?: string;
  children: ReactNode;
}) {
  const label = useMemo(() => {
    if (!startDate && !endDate) return null;
    if (startDate && endDate) return `${fmtDate(startDate)} – ${fmtDate(endDate)}`;
    return fmtDate((startDate || endDate) as string);
  }, [startDate, endDate]);
  return <ReportPeriodContext.Provider value={label}>{children}</ReportPeriodContext.Provider>;
}

interface ExportColumn {
  key: string;
  label: string;
  type?: 'text' | 'currency' | 'number' | 'date';
}

interface ExportConfig {
  filename?: string;
  columns: ExportColumn[];
  data: any[];
}

export function useExport() {
  const { profile } = useBusinessStore();
  const t = useTranslations('Export');

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

  // Real .xlsx via SheetJS (already in the bundle for other importers). Opens
  // natively in Excel / Google Sheets / LibreOffice with correct number and
  // date types — CSV can't carry those.
  const exportToXLSX = useCallback(async ({ filename = 'report', columns, data, title }: ExportConfig & { title?: string }) => {
    const XLSX = await import('xlsx');
    const rows = data.map(row => {
      const out: Record<string, any> = {};
      for (const col of columns) {
        const val = row[col.key];
        if (val === null || val === undefined || val === '') { out[col.label] = ''; continue; }
        if (col.type === 'date') { out[col.label] = new Date(val); continue; }
        if (col.type === 'currency' || col.type === 'number') { out[col.label] = Number(val) || 0; continue; }
        out[col.label] = String(val);
      }
      return out;
    });
    const ws = XLSX.utils.json_to_sheet(rows, { header: columns.map(c => c.label) });
    // Format currency / number / date columns so Excel doesn't render numbers
    // as text and dates as ISO strings.
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    columns.forEach((col, idx) => {
      const fmt = col.type === 'currency' ? '₹#,##,##0' : col.type === 'number' ? '#,##0' : col.type === 'date' ? 'dd-mmm-yyyy' : null;
      if (!fmt) return;
      for (let r = 1; r <= range.e.r; r++) {
        const addr = XLSX.utils.encode_cell({ c: idx, r });
        if (ws[addr]) ws[addr].z = fmt;
      }
    });
    ws['!cols'] = columns.map(c => ({ wch: Math.max(c.label.length + 2, c.type === 'currency' ? 14 : 18) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, (title || 'Report').slice(0, 31));
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const name = `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`;
    if (await saveOrShareBlob(blob, name)) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.setAttribute('download', name);
    document.body.appendChild(link); link.click(); link.remove();
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

  // Print view — mirrors the CA-grade PDF template so a browser print preview
  // and the downloaded PDF are visually the same statement. Any edit to the
  // palette / spacing should also be reflected in lib/pdf/professionalTemplate.ts.
  const printTable = useCallback((
    { title, columns, data, dateRange, summary }:
    ExportConfig & {
      title?: string;
      dateRange?: string;
      summary?: { label: string; value: string; tone?: 'default' | 'positive' | 'negative' }[];
    },
  ) => {
    const shop = {
      name: profile.shopName || 'Vyapar Sarthi',
      address: profile.address || '',
      mobile: profile.mobile || '',
      gst: profile.gst || '',
      pan: profile.pan || '',
    };
    const reportTitle = title || t('reportFallback');
    const range = dateRange || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const generatedAt = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    const L = { period: t('period'), generated: t('generated'), prepared: t('preparedBy'), verified: t('verifiedBy'), authorized: t('authorizedSignatory'), disclaimer: t('footerDisclaimer'), noRecords: t('noRecords') };

    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[ch]);

    const metaLine2 = [shop.mobile && `Mob: ${shop.mobile}`, shop.gst && `GSTIN: ${shop.gst}`, shop.pan && `PAN: ${shop.pan}`]
      .filter(Boolean).join('  |  ');

    const summaryHtml = summary?.length
      ? `<div class="kpis">${summary.map(k => {
          const tone = k.tone === 'positive' ? 'pos' : k.tone === 'negative' ? 'neg' : '';
          return `<div class="kpi"><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value ${tone}">${esc(k.value)}</div></div>`;
        }).join('')}</div>`
      : '';

    const rowsHtml = data.length
      ? data.map(row => `<tr>${columns.map(col => {
          const val = row[col.key];
          if (val === null || val === undefined || val === '') return '<td>—</td>';
          if (col.type === 'date') return `<td>${esc(new Date(val).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }))}</td>`;
          if (col.type === 'currency') return `<td class="num">₹${Number(val).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>`;
          if (col.type === 'number') return `<td class="num">${Number(val).toLocaleString('en-IN')}</td>`;
          return `<td>${esc(val)}</td>`;
        }).join('')}</tr>`).join('')
      : `<tr><td colspan="${columns.length}" class="empty">${esc(L.noRecords)}</td></tr>`;

    const html = `<!doctype html><html><head>
      <meta charset="utf-8" />
      <title>${esc(reportTitle)}</title>
      <style>
        @page { size: A4; margin: 15mm 15mm 18mm; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
        html, body { background: #ffffff; }
        body { font-family: Helvetica, Arial, sans-serif; color: #1e293b; font-size: 11px; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 12mm 15mm; }

        /* Letterhead — matches renderProfessionalHeader */
        .letterhead { display: flex; justify-content: space-between; align-items: flex-start; }
        .brand h1 { font-size: 18px; font-weight: 800; margin: 0 0 4px; color: #1e293b; letter-spacing: 0.2px; }
        .brand .meta { color: #64748b; font-size: 10px; line-height: 1.55; }
        .doc-title { text-align: right; }
        .doc-title .tt { font-size: 14px; font-weight: 800; color: #107a59; letter-spacing: 1px; text-transform: uppercase; margin: 0; }
        .doc-title .sub { color: #64748b; font-size: 10px; margin-top: 4px; line-height: 1.5; }
        .accent-bar { height: 3px; background: #107a59; margin: 10px 0 16px; border-radius: 1px; }

        /* KPI strip — matches renderSummaryBox */
        .kpis { display: flex; border: 1px solid #107a59; background: #e8f6f0; border-radius: 4px; margin-bottom: 14px; }
        .kpi { flex: 1; padding: 10px 12px; text-align: center; border-right: 1px solid #cbd5e1; }
        .kpi:last-child { border-right: none; }
        .kpi-label { font-size: 9px; text-transform: uppercase; color: #64748b; letter-spacing: 0.4px; font-weight: 700; }
        .kpi-value { font-size: 14px; font-weight: 800; color: #1e293b; margin-top: 4px; }
        .kpi-value.pos { color: #16a34a; }
        .kpi-value.neg { color: #dc2626; }

        /* Section title — matches renderSectionTitle */
        .section-title { display: flex; align-items: center; gap: 8px; font-weight: 800; text-transform: uppercase; font-size: 12px; letter-spacing: 0.6px; color: #1e293b; margin: 4px 0 10px; }
        .section-title::before { content: ''; display: inline-block; width: 4px; height: 12px; background: #107a59; border-radius: 1px; }

        /* Table — matches PROFESSIONAL_TABLE_STYLES */
        table { width: 100%; border-collapse: collapse; }
        thead th { background: #107a59; color: #fff; text-align: left; font-weight: 700; font-size: 10px; padding: 7px 8px; border: 1px solid #107a59; }
        tbody td { padding: 6px 8px; border: 1px solid #cbd5e1; font-size: 10.5px; color: #1e293b; }
        tbody tr:nth-child(even) td { background: #f9fafb; }
        td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
        td.empty { text-align: center; font-style: italic; color: #94a3b8; padding: 18px; }

        /* Signature block — matches renderSignatureBlock */
        .signatures { display: flex; margin-top: 32px; }
        .sig { flex: 1; text-align: center; padding: 0 8px; }
        .sig .line { border-top: 1px solid #cbd5e1; margin: 26px 12px 6px; }
        .sig .label { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; }

        /* Footer — printed on every page via running elements */
        .footer-note { position: fixed; bottom: 4mm; left: 15mm; right: 15mm; padding-top: 4px; border-top: 1px solid #cbd5e1; display: flex; justify-content: space-between; font-size: 8px; color: #64748b; }
        .footer-note .pg::after { content: 'Page ' counter(page) ' of ' counter(pages); }

        @media print {
          thead { display: table-header-group; }
          tr, td, th { page-break-inside: avoid; }
        }
      </style>
    </head><body>
      <div class="letterhead">
        <div class="brand">
          <h1>${esc(shop.name)}</h1>
          <div class="meta">
            ${shop.address ? `<div>${esc(shop.address)}</div>` : ''}
            ${metaLine2 ? `<div>${esc(metaLine2)}</div>` : ''}
          </div>
        </div>
        <div class="doc-title">
          <p class="tt">${esc(reportTitle)}</p>
          <div class="sub">
            <div>${esc(L.period)}: ${esc(range)}</div>
            <div>${esc(L.generated)}: ${esc(generatedAt)}</div>
          </div>
        </div>
      </div>
      <div class="accent-bar"></div>

      ${summaryHtml}

      <div class="section-title">${esc(reportTitle)}</div>
      <table>
        <thead><tr>${columns.map(c => `<th${c.type === 'currency' || c.type === 'number' ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>

      <div class="signatures">
        <div class="sig"><div class="line"></div><div class="label">${esc(L.prepared)}</div></div>
        <div class="sig"><div class="line"></div><div class="label">${esc(L.verified)}</div></div>
        <div class="sig"><div class="line"></div><div class="label">${esc(L.authorized)}</div></div>
      </div>

      <div class="footer-note">
        <span>${esc(L.disclaimer)}</span>
        <span class="pg"></span>
      </div>
    </body></html>`;

    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    // Wait for layout before triggering print so the letterhead/table render.
    const trigger = () => { try { w.focus(); w.print(); } catch {} };
    if (w.document.readyState === 'complete') trigger();
    else w.addEventListener('load', trigger);
  }, [profile]);

  // CA-grade PDF for any tabular report — same letterhead/table/footer that
  // Udhar Khata already uses, so every export from the Reports page reads as
  // part of one coherent statement pack.
  const exportToPDF = useCallback(async ({
    filename = 'report',
    columns,
    data,
    title,
    dateRange,
    summary,
  }: ExportConfig & {
    title?: string;
    dateRange?: string;
    summary?: { label: string; value: string; tone?: 'default' | 'positive' | 'negative' }[];
  }) => {
    const [{ default: jsPDF }, { default: autoTable }, tpl] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
      import('@/lib/pdf/professionalTemplate'),
    ]);

    const doc = new jsPDF() as any;
    const shop = {
      name: profile.shopName || 'Vyapar Sarthi',
      address: profile.address || null,
      mobile: profile.mobile || null,
      gst: profile.gst || null,
      pan: profile.pan || null,
    };

    const reportTitle = title || filename.replace(/_/g, ' ');
    const range = dateRange || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    let y = tpl.renderProfessionalHeader(doc, shop, reportTitle, range, {
      periodLabel: t('period'),
      generatedLabel: t('generated'),
      businessNameFallback: t('businessNameFallback'),
    });

    if (summary?.length) {
      // jsPDF's default Helvetica has no glyph for the rupee sign (U+20B9),
      // so it renders as "¹". The rest of the template already uses "Rs "
      // via fmtInr — normalize summary values so callers can freely pass ₹.
      const safeSummary = summary.map(s => ({ ...s, value: String(s.value).replace(/₹\s?/g, 'Rs ') }));
      y = tpl.renderSummaryBox(doc, y, safeSummary);
    }

    y = tpl.ensureRoom(doc, y, 20);
    y = tpl.renderSectionTitle(doc, y, reportTitle);

    if (!data.length) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text(t('noRecords'), 20, y + 8);
      y += 20;
    } else {
      const body = data.map(row =>
        columns.map(col => {
          const val = row[col.key];
          if (val === null || val === undefined) return '';
          if (col.type === 'date') return new Date(val).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
          if (col.type === 'currency') return { content: tpl.fmtInr(Number(val) || 0), styles: { halign: 'right' } as any };
          if (col.type === 'number') return { content: Number(val).toLocaleString('en-IN'), styles: { halign: 'right' } as any };
          return String(val);
        })
      );

      autoTable(doc, {
        startY: y,
        head: [columns.map(c => c.label)],
        body,
        ...tpl.PROFESSIONAL_TABLE_STYLES,
      });
      y = (doc.lastAutoTable?.finalY ?? y) + 12;
    }

    y = tpl.ensureRoom(doc, y, 28);
    tpl.renderSignatureBlock(doc, y, [t('preparedBy'), t('verifiedBy'), t('authorizedSignatory')]);
    tpl.renderProfessionalFooter(doc, t('footerDisclaimer'));

    const name = `${filename}_${new Date().toISOString().split('T')[0]}.pdf`;
    const blob: Blob = doc.output('blob');
    if (await saveOrShareBlob(blob, name)) return;
    doc.save(name);
  }, [profile]);

  return { exportToCSV, exportToJSON, exportToXLSX, exportToPDF, printTable };
}

interface ExportButtonProps {
  columns: ExportColumn[];
  data: any[];
  filename?: string;
  title?: string;
  /** Human-readable period label, e.g. "01 Jul 2026 – 31 Jul 2026". Used on the PDF letterhead. */
  dateRange?: string;
  /** Optional KPI strip rendered above the table in the PDF (mirrors Udhar layout). */
  summary?: { label: string; value: string; tone?: 'default' | 'positive' | 'negative' }[];
}

export function ExportButton({ columns, data, filename, title, dateRange, summary }: ExportButtonProps) {
  const { exportToCSV, exportToXLSX, exportToPDF, printTable } = useExport();
  const t = useTranslations('Export');
  const contextRange = useContext(ReportPeriodContext);
  const effectiveRange = dateRange || contextRange || undefined;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={() => exportToPDF({ columns, data, filename, title, dateRange: effectiveRange, summary })}
        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors shadow-sm"
        title={t('pdfTooltip')}
      >
        <FileText size={13} />
        {t('pdf')}
      </button>
      <button
        onClick={() => exportToXLSX({ columns, data, filename, title })}
        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-green-700 text-white rounded-xl hover:bg-green-800 transition-colors shadow-sm"
        title={t('excelTooltip')}
      >
        <FileSpreadsheet size={13} />
        {t('excel')}
      </button>
      <button
        onClick={() => exportToCSV({ columns, data, filename })}
        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700"
        title={t('csvTooltip')}
      >
        <Download size={13} />
        {t('csv')}
      </button>
      <button
        onClick={() => printTable({ columns, data, filename, title, dateRange: effectiveRange, summary })}
        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700"
        title={t('printTooltip')}
      >
        <Printer size={13} />
        {t('print')}
      </button>
    </div>
  );
}
