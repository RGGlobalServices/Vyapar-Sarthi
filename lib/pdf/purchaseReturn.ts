import { PDF_LAYOUT, renderProfessionalHeader, renderProfessionalFooter, fmtInr, type ShopHeader } from './professionalTemplate';

export interface PurchaseReturnItemRow {
  name: string;
  variant?: string | null;
  quantity: number;
  rate: number;
  amount: number;
}

const fmtDate = (v: string | Date | null | undefined) =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

/**
 * A debit note for goods sent back to a supplier from one purchase — same
 * shop-letterhead template as generatePurchaseBillPDF (lib/pdf/purchaseBillDetail.ts)
 * so it reads as part of the same document family. Returns the generated
 * Blob + filename instead of saving directly, so the caller can offer both
 * Download and Share (native share / WhatsApp) from the one generated file.
 */
export async function generatePurchaseReturnPdfBlob({
  shop,
  supplierName,
  returnNumber,
  date,
  originalInvoiceNumber,
  items,
  totalAmount,
}: {
  shop: ShopHeader;
  supplierName: string;
  returnNumber: string;
  date: string | Date | null;
  originalInvoiceNumber: string;
  items: PurchaseReturnItemRow[];
  totalAmount: number;
}): Promise<{ blob: Blob; filename: string }> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ orientation: 'portrait' }) as any;
  const title = 'Purchase Return / Debit Note';

  let y = renderProfessionalHeader(doc, shop, title, fmtDate(date), { periodLabel: 'Return Date' });

  const L = PDF_LAYOUT.marginX;
  const R = doc.internal.pageSize.getWidth() - PDF_LAYOUT.marginX;

  doc.setFillColor(...PDF_LAYOUT.accentSoft);
  doc.rect(L, y, R - L, 26, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...PDF_LAYOUT.ink);
  doc.text(supplierName || 'Supplier', L + 3, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_LAYOUT.muted);
  const line1 = [
    `Return No: ${returnNumber}`,
    `Against Invoice: ${originalInvoiceNumber || '-'}`,
  ].join('   |   ');
  doc.text(line1, L + 3, y + 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_LAYOUT.accent);
  doc.text(`Return Amount: ${fmtInr(totalAmount)}`, L + 3, y + 23);

  y += 32;

  const rows: any[] = items.map((it) => [
    it.name + (it.variant ? ` (${it.variant})` : ''),
    String(it.quantity),
    { content: fmtInr(it.rate), styles: { halign: 'right' } },
    { content: fmtInr(it.amount), styles: { halign: 'right' } },
  ]);
  autoTable(doc, {
    startY: y,
    head: [['Product', 'Qty', 'Rate', 'Amount']],
    body: rows,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5, textColor: PDF_LAYOUT.ink as any, lineColor: PDF_LAYOUT.divider as any, lineWidth: 0.15 },
    headStyles: { fillColor: PDF_LAYOUT.accent as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 9 },
    margin: { left: PDF_LAYOUT.marginX, right: PDF_LAYOUT.marginX },
    rowPageBreak: 'avoid',
  });

  renderProfessionalFooter(doc, `${title} — generated ${fmtDate(new Date())}`);

  const filename = `${returnNumber}_${new Date().toISOString().split('T')[0]}.pdf`;
  const blob: Blob = doc.output('blob');
  return { blob, filename };
}
