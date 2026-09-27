import { PDF_LAYOUT, renderProfessionalHeader, renderProfessionalFooter, fmtInr, embedDevanagariFont, setSmartFont, type ShopHeader } from './professionalTemplate';

export interface RejectionReturnDocData {
  shop: ShopHeader;
  gatePassNo: string;
  returnType: 'SUPPLIER_RETURN' | 'JOB_WORK_RETURN' | 'DEBIT_NOTE_RETURN';
  partyName: string;
  partyPhone?: string | null;
  date: string | Date | null;
  lotNumber: string;
  productName: string;
  returnQuantity: number;
  unit: string;
  reason?: string | null;
  transporterName?: string | null;
  vehicleNumber?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  remarks?: string | null;
  batchNumber?: string | null;
}

const fmtDate = (v: string | Date | null | undefined) =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

/**
 * Generates an official Return Gate Pass / Rejection Return Slip PDF.
 * Used when rejected raw material or job-work material is dispatched back to the supplier or customer.
 */
export async function generateRejectionReturnGatePassPdf({
  shop,
  gatePassNo,
  returnType,
  partyName,
  partyPhone,
  date,
  lotNumber,
  productName,
  returnQuantity,
  unit,
  reason,
  transporterName,
  vehicleNumber,
  driverName,
  driverPhone,
  remarks,
  batchNumber,
}: RejectionReturnDocData): Promise<{ blob: Blob; filename: string }> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ orientation: 'portrait' }) as any;
  await embedDevanagariFont(doc);

  const isJobWork = returnType === 'JOB_WORK_RETURN';
  const docTitle = isJobWork ? 'Job Work Return Gate Pass (मालाचा परतावा)' : 'Supplier Return Gate Pass / Debit Note Slip';

  let y = renderProfessionalHeader(doc, shop, docTitle, fmtDate(date), { periodLabel: 'Dispatch Date' });

  const L = PDF_LAYOUT.marginX;
  const R = doc.internal.pageSize.getWidth() - PDF_LAYOUT.marginX;

  // Party & Pass Details Box
  doc.setFillColor(...PDF_LAYOUT.accentSoft);
  doc.rect(L, y, R - L, 32, 'F');

  const pName = `${isJobWork ? 'Customer / Farmer (ग्राहक/शेतकरी)' : 'Supplier / Vendor (पुरवठादार)'}: ${partyName || '-'}`;
  setSmartFont(doc, pName, 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...PDF_LAYOUT.ink);
  doc.text(pName, L + 3, y + 6);

  setSmartFont(doc, null, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_LAYOUT.muted);

  const line1 = [
    `Gate Pass No: ${gatePassNo}`,
    partyPhone ? `Mobile: ${partyPhone}` : null,
    batchNumber ? `Batch No: ${batchNumber}` : null,
  ].filter(Boolean).join('   |   ');
  doc.text(line1, L + 3, y + 13);

  const line2 = [
    `Lot Number: ${lotNumber}`,
    `Return Type: ${isJobWork ? 'Job Work Rejection Return' : 'Supplier Quality Rejection Return'}`,
  ].join('   |   ');
  doc.text(line2, L + 3, y + 19);

  // Transport Details highlight line
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_LAYOUT.accent);
  const transLine = [
    transporterName ? `Transporter: ${transporterName}` : 'Transporter: Direct / Own Vehicle',
    vehicleNumber ? `Vehicle: ${vehicleNumber}` : null,
    driverName ? `Driver: ${driverName} (${driverPhone || '-'})` : null,
  ].filter(Boolean).join('   |   ');
  doc.text(transLine, L + 3, y + 26);

  y += 38;

  // Material Table
  const rows: any[] = [
    [
      productName || 'Raw Material / Grain Lot',
      lotNumber || '-',
      `${returnQuantity.toLocaleString('en-IN')} ${unit || 'Kg'}`,
      reason || 'Quality Rejection / Moong-Chana-Tur Grading Defect',
      remarks || 'Returned to source party',
    ],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Item Description', 'Lot / Ref No', 'Returned Qty', 'Reason for Rejection', 'Notes']],
    body: rows,
    theme: 'grid',
    styles: {
      font: 'NotoDevanagari',
      fontSize: 9,
      cellPadding: 3,
      textColor: PDF_LAYOUT.ink as any,
      lineColor: PDF_LAYOUT.divider as any,
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: PDF_LAYOUT.accent as any,
      textColor: [255, 255, 255] as any,
      fontStyle: 'bold',
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 30 },
      2: { cellWidth: 25, halign: 'right' },
      3: { cellWidth: 45 },
      4: { cellWidth: 'auto' },
    },
    margin: { left: PDF_LAYOUT.marginX, right: PDF_LAYOUT.marginX },
    rowPageBreak: 'avoid',
  });

  const finalY = (doc as any).lastAutoTable?.finalY || y + 40;

  // Signatures section
  const sigY = Math.min(finalY + 25, doc.internal.pageSize.getHeight() - 35);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_LAYOUT.muted);

  doc.text('_____________________________', L, sigY);
  doc.text('Receiver Signature (Party / Driver)', L, sigY + 5);

  doc.text('_____________________________', R - 50, sigY);
  doc.text('Authorized Signatory (Mill In-charge)', R - 50, sigY + 5);

  renderProfessionalFooter(doc, `${docTitle} — Pass #${gatePassNo} — Generated ${fmtDate(new Date())}`);

  const filename = `GatePass_${gatePassNo}_${new Date().toISOString().split('T')[0]}.pdf`;
  const blob: Blob = doc.output('blob');
  return { blob, filename };
}
