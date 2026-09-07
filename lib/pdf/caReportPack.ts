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

  const disclaimer = 'Prepared from recorded business transactions. Subject to review and finalization by the business’s CA/Accountant.';

  let doc: any = null;
  let fontEmbedded = false;
  for (const [i, section] of sections.entries()) {
    const orientation = section.orientation || 'portrait';
    if (i === 0) {
      doc = new jsPDF({ orientation });
      await embedDevanagariFont(doc);
      fontEmbedded = true;
    } else {
      doc.addPage(undefined, orientation);
    }

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
          if (col.type === 'date') return new Date(val).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
          if (col.type === 'currency') return { content: fmtInr(Number(val) || 0), styles: { halign: 'right' as const } };
          if (col.type === 'number') return { content: Number(val).toLocaleString('en-IN'), styles: { halign: 'right' as const } };
          return String(val);
        })
      );
      autoTable(doc, {
        startY: y,
        head: [section.columns.map((c) => c.label)],
        body,
        ...getProfessionalTableStyles(true),
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
