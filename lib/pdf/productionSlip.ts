import {
  PDF_LAYOUT, renderProfessionalHeader, renderProfessionalFooter, renderSectionTitle,
  renderSignatureBlock, embedDevanagariFont, setSmartFont, hasDevanagari, type ShopHeader,
} from './professionalTemplate';

/**
 * Production Slip — a professional, printable record of one production run: what raw material went in, what came out (finished
 * product, bran/konda, husk/bhusa, broken, wastage — whatever the shopkeeper fills), who ran it and how long it took. Every field
 * is exactly what the shopkeeper filled in the on-screen form — this is a print of THAT form, not a re-derivation from the batch's
 * own stored numbers, so it still works for a batch nobody logged stage-by-stage in the system.
 */
export type ProductionSlipOutputRow = { label: string; quantity: string; unit: string };

export async function exportProductionSlipPDF({
  shopInfo,
  batchNumber,
  date,
  rawMaterial,
  inputQty,
  inputUnit,
  operatorName,
  startedAt,
  closedAt,
  outputs,
  notes,
}: {
  shopInfo: ShopHeader;
  batchNumber: string;
  date: string;
  rawMaterial: string;
  inputQty: string;
  inputUnit: string;
  operatorName: string;
  startedAt: string;
  closedAt: string;
  outputs: ProductionSlipOutputRow[];
  notes: string;
}): Promise<File> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);

  const doc = new jsPDF({ orientation: 'portrait' }) as any;
  // The Devanagari font is ~0.6 MB of data to parse and embed: only worth it when a name on this slip is actually in Devanagari.
  const texts = [shopInfo.name, shopInfo.address, batchNumber, rawMaterial, operatorName, notes, ...outputs.map((o) => o.label)];
  if (texts.some((t) => hasDevanagari(t))) await embedDevanagariFont(doc);

  let y = renderProfessionalHeader(doc, shopInfo, 'Production Slip', date, { periodLabel: 'Date' });
  const L = PDF_LAYOUT.marginX;
  const R = doc.internal.pageSize.getWidth() - PDF_LAYOUT.marginX;

  // Batch / run details box — bordered, two columns.
  const boxH = 28;
  doc.setDrawColor(...PDF_LAYOUT.divider);
  doc.setLineWidth(0.3);
  doc.rect(L, y, R - L, boxH);
  doc.line((L + R) / 2, y, (L + R) / 2, y + boxH);

  const field = (label: string, value: string, x: number, fy: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_LAYOUT.muted);
    doc.text(label.toUpperCase(), x, fy);
    setSmartFont(doc, value, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...PDF_LAYOUT.ink);
    doc.text(value || '-', x, fy + 5);
  };
  const colL = L + 4, colR = (L + R) / 2 + 4;
  field('Batch / Lot Number', batchNumber, colL, y + 7);
  field('Raw Material', rawMaterial, colR, y + 7);
  field('Input Quantity', `${inputQty || '0'} ${inputUnit || 'Kg'}`, colL, y + 17);
  field('Operator Name', operatorName, colR, y + 17);
  y += boxH + 6;

  const boxH2 = 16;
  doc.rect(L, y, R - L, boxH2);
  doc.line((L + R) / 2, y, (L + R) / 2, y + boxH2);
  field('Processing Started', startedAt, colL, y + 10);
  field('Processing Closed', closedAt, colR, y + 10);
  y += boxH2 + 8;

  y = renderSectionTitle(doc, y, 'Material Output');
  autoTable(doc, {
    startY: y,
    head: [['#', 'Output', 'Quantity', 'Unit']],
    body: outputs.map((o, i) => [String(i + 1), o.label || '-', o.quantity || '0', o.unit || 'Kg']),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 3, textColor: PDF_LAYOUT.ink as any, lineColor: PDF_LAYOUT.divider as any, lineWidth: 0.25 },
    headStyles: { fillColor: PDF_LAYOUT.accent as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 10 },
    columnStyles: { 0: { cellWidth: 12, halign: 'center' }, 2: { halign: 'right', cellWidth: 35 }, 3: { cellWidth: 25 } },
    margin: { left: L, right: PDF_LAYOUT.marginX },
    rowPageBreak: 'avoid',
  });

  let after = ((doc as any).lastAutoTable?.finalY ?? y + 20) + 10;
  if (notes) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...PDF_LAYOUT.muted);
    doc.text('Notes:', L, after);
    doc.setTextColor(...PDF_LAYOUT.ink);
    const wrapped = doc.splitTextToSize(notes, R - L - 20);
    doc.text(wrapped, L + 15, after);
    after += wrapped.length * 4.5 + 6;
  }

  renderSignatureBlock(doc, after + 6, ['Operator', 'Supervisor', 'Authorized Signatory']);
  const _fd = new Date();
  renderProfessionalFooter(doc, `Production Slip — generated ${String(_fd.getDate()).padStart(2,'0')}-${String(_fd.getMonth()+1).padStart(2,'0')}-${_fd.getFullYear()}`);

  const blob: Blob = doc.output('blob');
  return new File([blob], `Production_Slip_${(batchNumber || 'batch').replace(/\s+/g, '_')}.pdf`, { type: 'application/pdf' });
}
