import { PDF_LAYOUT, renderProfessionalHeader, renderProfessionalFooter, fmtInr, type ShopHeader } from './professionalTemplate';

export interface CustomerBillItem {
  name: string;
  quantity: number;
  sellingPrice: number;
  costPrice: number;
  profitPerUnit: number;
  profitPercent: number | null;
}

export interface CustomerBillDetail {
  type: string;
  amount: number;
  note: string;
  billNumber: string;
  date: string | Date | null;
  gstPercent: string | null;
  gstAmount: number | null;
}

const fmtDate = (v: string | Date | null | undefined) =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

/**
 * One party/customer ledger row, downloadable on its own — the Party/Customer
 * equivalent of lib/pdf/purchaseBillDetail.ts. Unlike the supplier side,
 * `items` here always comes pre-loaded on the Transaction object already
 * fetched by LedgerView (see api/v1/crm/ledger's per-row GST+profit
 * enrichment) — no separate detail fetch needed to build this.
 */
export async function generateCustomerBillPDF({
  shop,
  entityName,
  bill,
  items,
  filename,
}: {
  shop: ShopHeader;
  entityName: string;
  bill: CustomerBillDetail;
  items: CustomerBillItem[];
  filename: string;
}) {
  const [{ default: jsPDF }, { default: autoTable }, { saveOrShareBlob }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/lib/nativeSave'),
  ]);

  const doc = new jsPDF({ orientation: 'portrait' }) as any;
  const isPayment = bill.type === 'payment';
  const title = isPayment ? 'Payment Detail' : 'Bill Detail';

  let y = renderProfessionalHeader(doc, shop, title, fmtDate(bill.date), { periodLabel: 'Bill Date' });

  const L = PDF_LAYOUT.marginX;
  const R = doc.internal.pageSize.getWidth() - PDF_LAYOUT.marginX;

  doc.setFillColor(...PDF_LAYOUT.accentSoft);
  doc.rect(L, y, R - L, 26, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...PDF_LAYOUT.ink);
  doc.text(entityName || 'Account', L + 3, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_LAYOUT.muted);
  const line1 = [
    bill.billNumber ? `Bill No: ${bill.billNumber}` : null,
    `Type: ${isPayment ? 'Payment' : 'Credit Bill'}`,
    bill.gstPercent != null ? `GST: ${bill.gstPercent}% (${fmtInr(bill.gstAmount)})` : null,
  ].filter(Boolean).join('   |   ');
  if (line1) doc.text(line1, L + 3, y + 12);
  if (bill.note) doc.text(`Note: ${bill.note}`, L + 3, y + 17);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_LAYOUT.accent);
  doc.text(`${isPayment ? 'Amount Paid' : 'Bill Amount'}: ${fmtInr(bill.amount)}`, L + 3, y + 23);

  y += 32;

  if (items.length > 0) {
    const rows: any[] = items.map((it) => [
      it.name,
      it.quantity,
      { content: fmtInr(it.costPrice), styles: { halign: 'right' } },
      { content: fmtInr(it.sellingPrice), styles: { halign: 'right' } },
      { content: fmtInr(it.profitPerUnit * it.quantity), styles: { halign: 'right' } },
      it.profitPercent != null ? `${it.profitPercent}%` : '-',
    ]);
    autoTable(doc, {
      startY: y,
      head: [['Product', 'Qty', 'Cost', 'Selling', 'Profit', 'Profit %']],
      body: rows,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5, textColor: PDF_LAYOUT.ink as any, lineColor: PDF_LAYOUT.divider as any, lineWidth: 0.15 },
      headStyles: { fillColor: PDF_LAYOUT.accent as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 9 },
      margin: { left: PDF_LAYOUT.marginX, right: PDF_LAYOUT.marginX },
      rowPageBreak: 'avoid',
    });
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text('No itemised product breakdown is available for this entry.', L, y + 8);
  }

  renderProfessionalFooter(doc, `${title} — generated ${fmtDate(new Date())}`);

  const name = `${filename}_${new Date().toISOString().split('T')[0]}.pdf`;
  const blob: Blob = doc.output('blob');
  if (await saveOrShareBlob(blob, name)) return;
  doc.save(name);
}
