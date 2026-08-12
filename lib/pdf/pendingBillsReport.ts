import { PDF_LAYOUT, renderProfessionalHeader, renderProfessionalFooter, fmtInr, type ShopHeader } from './professionalTemplate';

export interface DueBillRow {
  billNumber: string;
  date: string | Date | null;
  originalAmount: number;
  remaining: number;
  dueDate: string | Date | null;
}

export interface PartyHeader {
  name: string;
  address?: string | null;
  mobile?: string | null;
  gst?: string | null;
}

const fmtDate = (v: string | Date | null) =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 86400000);

/**
 * "Pending Bills - Adjustment Wise" statement — the classic bill-by-bill
 * outstanding report a shopkeeper's accountant would recognize (Bill Date /
 * Bill No / Due Days / Bill Amount / Adj. Amount / Pending Amount / running
 * Balance, totalled at the end). Modeled directly on a real printed example
 * the user provided. Deliberately its own layout rather than a call to the
 * generic ExportButton/useExport table — the shop-letterhead-then-party-
 * divider-then-running-balance structure doesn't fit that flat table+summary
 * shape. Only lists bills with something still owed; a fully settled bill
 * has nothing to adjust and, same as the paper original, doesn't appear.
 */
export async function generatePendingBillsPDF({
  shop,
  party,
  bills,
  reportTitle,
  filename,
}: {
  shop: ShopHeader;
  party: PartyHeader;
  bills: DueBillRow[];
  reportTitle: string;
  filename: string;
}) {
  const [{ default: jsPDF }, { default: autoTable }, { saveOrShareBlob }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/lib/nativeSave'),
  ]);

  const doc = new jsPDF({ orientation: 'portrait' }) as any;
  const today = new Date();
  const asOnLabel = fmtDate(today);

  let y = renderProfessionalHeader(doc, shop, reportTitle, asOnLabel, {
    periodLabel: 'As On Date',
  });

  // Party divider — whose bills these are. Boxed and visually distinct from
  // the shop's own letterhead above it, so it never reads as the same party.
  const L = PDF_LAYOUT.marginX;
  const R = doc.internal.pageSize.getWidth() - PDF_LAYOUT.marginX;
  doc.setFillColor(...PDF_LAYOUT.accentSoft);
  doc.rect(L, y, R - L, 14, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...PDF_LAYOUT.ink);
  doc.text(party.name || 'Party', L + 3, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...PDF_LAYOUT.muted);
  const contactLine = [
    party.address || null,
    party.mobile ? `Mob: ${party.mobile}` : null,
    party.gst ? `GSTIN: ${party.gst}` : null,
  ].filter(Boolean).join('   |   ');
  if (contactLine) doc.text(contactLine, L + 3, y + 11);
  y += 18;

  const rows: any[] = [];
  let cumulative = 0;
  let totalBill = 0;
  let totalAdj = 0;
  let totalPending = 0;

  for (const b of bills) {
    const originalAmount = Number(b.originalAmount) || 0;
    const remaining = Number(b.remaining) || 0;
    const adj = Math.max(0, originalAmount - remaining);
    cumulative += remaining;
    totalBill += originalAmount;
    totalAdj += adj;
    totalPending += remaining;

    // Overdue-ness is measured from the due date (purchase date + supplier's
    // credit days) when known, falling back to the bill date itself when the
    // supplier has no credit terms set — can be negative (not yet due).
    const dueBasis = b.dueDate ? new Date(b.dueDate) : (b.date ? new Date(b.date) : null);
    const dueDays = dueBasis ? daysBetween(dueBasis, today) : null;

    rows.push([
      fmtDate(b.date),
      b.billNumber || '-',
      'Purchase',
      dueDays === null ? '-' : String(dueDays),
      { content: fmtInr(originalAmount), styles: { halign: 'right' } },
      { content: adj > 0 ? fmtInr(adj) : '-', styles: { halign: 'right' } },
      { content: fmtInr(remaining), styles: { halign: 'right' } },
      { content: fmtInr(cumulative), styles: { halign: 'right' } },
    ]);
  }

  const totalRowStyle = { fontStyle: 'bold' as const, fillColor: PDF_LAYOUT.accentSoft as any };
  if (bills.length > 0) {
    rows.push([
      { content: 'Total', colSpan: 4, styles: totalRowStyle },
      { content: fmtInr(totalBill), styles: { ...totalRowStyle, halign: 'right' } },
      { content: fmtInr(totalAdj), styles: { ...totalRowStyle, halign: 'right' } },
      { content: fmtInr(totalPending), styles: { ...totalRowStyle, halign: 'right' } },
      { content: fmtInr(cumulative), styles: { ...totalRowStyle, halign: 'right' } },
    ]);
  }

  if (bills.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text('No pending bills.', L, y + 8);
  } else {
    autoTable(doc, {
      startY: y,
      head: [['Bill Date', 'Bill No', 'Type', 'Due Days', 'Bill Amount', 'Adj./Adv. Amount', 'Pending Amount', 'Balance Amt. (Cumulative)']],
      body: rows,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, textColor: PDF_LAYOUT.ink as any, lineColor: PDF_LAYOUT.divider as any, lineWidth: 0.15 },
      headStyles: { fillColor: PDF_LAYOUT.accent as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 8 },
      margin: { left: PDF_LAYOUT.marginX, right: PDF_LAYOUT.marginX },
      rowPageBreak: 'avoid',
    });
  }

  renderProfessionalFooter(doc, `Pending bills statement as on ${asOnLabel}`);

  const name = `${filename}_${today.toISOString().split('T')[0]}.pdf`;
  const blob: Blob = doc.output('blob');
  if (await saveOrShareBlob(blob, name)) return;
  doc.save(name);
}
