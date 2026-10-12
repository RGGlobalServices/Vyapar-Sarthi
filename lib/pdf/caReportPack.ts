import { PDF_LAYOUT, renderProfessionalHeader, renderProfessionalFooter, renderSectionTitle, renderSummaryBox, renderSignatureBlock, ensureRoom, fmtInr, embedDevanagariFont, getProfessionalTableStyles, PROFESSIONAL_TABLE_STYLES, type ShopHeader, type SummaryItem } from './professionalTemplate';

export interface CAPackColumn {
  key: string;
  label: string;
  type?: 'text' | 'currency' | 'number' | 'date';
}

export interface CAPackSection {
  title: string;
  columns: CAPackColumn[];
  rows: any[];
  summary?: SummaryItem[];
  /** Wide registers (many columns) read better in landscape; summaries stay portrait. */
  orientation?: 'portrait' | 'landscape';
}

// ── SMART COLUMN WIDTHS ──────────────────────────────────────────────────────
// Fixed widths (mm) per column key. Unknown keys share the leftover space.
const FIXED_COL_WIDTHS: Record<string, number> = {
  // Dates
  date: 18,
  purchaseDate: 18,
  closingDate: 18,
  // Short IDs / codes
  hsn: 14,
  hsnCode: 14,
  gstRate: 11,
  rate: 11,
  quantity: 11,
  qty: 11,
  unit: 10,
  // Invoice numbers (alphanumeric, ~12 chars)
  invoiceNumber: 24,
  billNumber: 24,
  docNumber: 24,
  lotNumber: 20,
  // GSTIN (15 chars) — needs a bit of room
  customerGstin: 30,
  supplierGstin: 30,
  gstin: 30,
  // Currency amounts
  cgst: 20,
  sgst: 20,
  igst: 14,
  taxableValue: 22,
  invoiceTotal: 22,
  totalAmount: 22,
  totalCost: 22,
  amount: 22,
  netGst: 22,
  outputGst: 22,
  inputGst: 22,
  outputTaxable: 22,
  inputTaxable: 22,
  total: 22,
  // Short status / mode
  paymentStatus: 18,
  paymentMode: 16,
  direction: 16,
  classification: 18,
  // Ageing buckets
  current: 20,
  '1_30': 20,
  '31_60': 20,
  '61_90': 20,
  'over_90': 20,
  totalOutstanding: 22,
};

/**
 * Build jsPDF-autotable `columnStyles` so every column gets a sensible width.
 * Columns whose keys are in FIXED_COL_WIDTHS get a hard width; the rest share
 * what's left proportionally (at least 16 mm each to avoid impossible wraps).
 */
function buildColumnStyles(
  columns: CAPackColumn[],
  pageWidthMm: number,
): Record<number, { cellWidth: number }> {
  const usable = pageWidthMm - PDF_LAYOUT.marginX * 2;
  let fixedTotal = 0;
  let autoCount = 0;
  columns.forEach((col) => {
    const fw = FIXED_COL_WIDTHS[col.key];
    if (fw) fixedTotal += fw;
    else autoCount++;
  });
  const autoWidth = autoCount > 0
    ? Math.max(16, (usable - fixedTotal) / autoCount)
    : 0;

  const styles: Record<number, { cellWidth: number }> = {};
  columns.forEach((col, i) => {
    styles[i] = { cellWidth: FIXED_COL_WIDTHS[col.key] ?? autoWidth };
  });
  return styles;
}

/**
 * One combined "CA Report Pack" PDF — a fresh page per selected report
 * section, each rendered with the exact same letterhead/table/footer
 * primitives every other document in lib/pdf/*.ts already uses (so this
 * reads as part of the same document family, not a bespoke one-off). Mixed
 * orientation per section is supported by constructing each new page with
 * jsPDF's own addPage(format, orientation) overload.
 */
export async function generateCAReportPackPdf({
  shop,
  fyLabel,
  dateRangeLabel,
  sections,
}: {
  shop: ShopHeader;
  fyLabel: string;
  dateRangeLabel: string;
  sections: CAPackSection[];
}): Promise<Blob> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const disclaimer = "Prepared from recorded business transactions. Subject to review and finalization by the business's CA/Accountant.";

  let doc: any = null;
  for (const [i, section] of sections.entries()) {
    const orientation = section.orientation || 'portrait';
    if (i === 0) {
      doc = new jsPDF({ orientation });
      await embedDevanagariFont(doc);
    } else {
      doc.addPage(undefined, orientation);
    }

    const pageW = doc.internal.pageSize.getWidth();
    const isWide = section.columns.length > 8;

    let y = renderProfessionalHeader(doc, shop, `CA Report Pack — ${section.title}`, dateRangeLabel, {
      periodLabel: fyLabel,
      generatedLabel: 'Generated',
    });

    if (section.summary?.length) {
      y = renderSummaryBox(doc, y, section.summary);
    }

    y = ensureRoom(doc, y, 20);
    y = renderSectionTitle(doc, y, section.title);

    if (!section.rows.length) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text('No records for this period.', PDF_LAYOUT.marginX, y + 8);
    } else {
      const body = section.rows.map((row) =>
        section.columns.map((col) => {
          const val = row[col.key];
          if (val === null || val === undefined || val === '') return '—';
          if (col.type === 'date') {
            const _d = new Date(val);
            return `${String(_d.getDate()).padStart(2, '0')}-${String(_d.getMonth() + 1).padStart(2, '0')}-${_d.getFullYear()}`;
          }
          if (col.type === 'currency') return { content: fmtInr(Number(val) || 0), styles: { halign: 'right' as const } };
          if (col.type === 'number') return { content: Number(val).toLocaleString('en-IN'), styles: { halign: 'right' as const } };
          return String(val);
        })
      );

      const baseStyles = getProfessionalTableStyles(true);
      autoTable(doc, {
        startY: y,
        head: [section.columns.map((c) => c.label)],
        body,
        ...baseStyles,
        // Tighter sizing for wide registers so everything fits cleanly
        styles: {
          ...baseStyles.styles,
          fontSize: isWide ? 7.5 : 9,
          cellPadding: isWide ? 1.8 : 2.5,
          overflow: 'linebreak' as const,
          minCellHeight: isWide ? 6 : 8,
        },
        headStyles: {
          ...baseStyles.headStyles,
          fontSize: isWide ? 7.5 : 9,
          cellPadding: isWide ? 1.8 : 2.5,
        },
        columnStyles: buildColumnStyles(section.columns, pageW),
        tableWidth: pageW - PDF_LAYOUT.marginX * 2,
      });
    }
  }

  if (!doc) { doc = new jsPDF(); await embedDevanagariFont(doc); }

  // Signature + disclaimer on the LAST page only — the pack is one document.
  const lastY = (doc.lastAutoTable?.finalY ?? PDF_LAYOUT.headerBottomY) + 12;
  const sigY = ensureRoom(doc, lastY, 28);
  renderSignatureBlock(doc, sigY);
  renderProfessionalFooter(doc, disclaimer);

  return doc.output('blob') as Blob;
}
