import { PDF_LAYOUT, renderProfessionalHeader, renderProfessionalFooter, fmtInr, embedDevanagariFont, setSmartFont, type ShopHeader } from './professionalTemplate';

export interface PurchaseBillItem {
  productName: string;
  unit?: string | null;
  variant?: string | null;
  quantity: number;
  cost: number;
  gst?: number | null;
  total: number;
  // Locked in at the time of this specific purchase line — null when this
  // line was entered in Manual cost mode, never recomputed from the
  // product's current mrp/discount% after the fact.
  mrp?: number | null;
  discountPercent?: number | null;
}

export interface PurchaseBillDetail {
  type: string;
  amount: number;
  note: string;
  billNumber: string;
  date: string | Date | null;
  dueDate?: string | Date | null;
}

const fmtDate = (v: string | Date | null | undefined) =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

/**
 * One purchase/payment row, downloadable on its own — opened from clicking a
 * row in the Supplier's Payment History. `items` is only ever non-empty for
 * a purchase entered through the full Purchases module (real item picker);
 * a quick "Add Purchase" entry or a bulk-imported row has no line items at
 * all, so this renders just the bill's flat fields in that case — see the
 * detail API route for why that split exists.
 */
export async function generatePurchaseBillPDF({
  shop,
  supplierName,
  bill,
  items,
  filename,
}: {
  shop: ShopHeader;
  supplierName: string;
  bill: PurchaseBillDetail;
  items: PurchaseBillItem[];
  filename: string;
}) {
  const [{ default: jsPDF }, { default: autoTable }, { saveOrShareBlob }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/lib/nativeSave'),
  ]);

  const doc = new jsPDF({ orientation: 'portrait' }) as any;
  await embedDevanagariFont(doc);
  const isPayment = bill.type === 'payment';
  const title = isPayment ? 'Payment Detail' : 'Purchase Bill Detail';

  let y = renderProfessionalHeader(doc, shop, title, fmtDate(bill.date), { periodLabel: 'Bill Date' });

  const L = PDF_LAYOUT.marginX;
  const R = doc.internal.pageSize.getWidth() - PDF_LAYOUT.marginX;

  doc.setFillColor(...PDF_LAYOUT.accentSoft);
  doc.rect(L, y, R - L, 26, 'F');
  const sName = supplierName || 'Supplier';
  setSmartFont(doc, sName, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...PDF_LAYOUT.ink);
  doc.text(sName, L + 3, y + 6);

  setSmartFont(doc, null, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_LAYOUT.muted);
  const line1 = [
    bill.billNumber ? `Bill No: ${bill.billNumber}` : null,
    `Type: ${isPayment ? 'Payment' : 'Purchase'}`,
    bill.dueDate ? `Due: ${fmtDate(bill.dueDate)}` : null,
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
      it.productName + (it.variant ? ` (${it.variant})` : ''),
      `${it.quantity}${it.unit ? ` ${it.unit}` : ''}`,
      { content: it.mrp != null ? fmtInr(it.mrp) : '-', styles: { halign: 'right' } },
      it.discountPercent != null ? `${it.discountPercent}%` : '-',
      { content: fmtInr(it.cost), styles: { halign: 'right' } },
      it.gst != null ? `${it.gst}%` : '-',
      { content: fmtInr(it.total), styles: { halign: 'right' } },
    ]);
    autoTable(doc, {
      startY: y,
      head: [['Product', 'Qty', 'MRP', 'Purchase %', 'Cost/Unit', 'GST %', 'Line Total']],
      body: rows,
      theme: 'grid',
      styles: { font: 'NotoDevanagari', fontSize: 9, cellPadding: 2.5, textColor: PDF_LAYOUT.ink as any, lineColor: PDF_LAYOUT.divider as any, lineWidth: 0.15 },
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
