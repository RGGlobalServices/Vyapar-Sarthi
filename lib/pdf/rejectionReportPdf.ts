import {
  PDF_LAYOUT,
  renderProfessionalHeader,
  renderProfessionalFooter,
  embedDevanagariFont,
  smartFont,
  type ShopHeader,
} from './professionalTemplate';

export interface RejectionLotExportItem {
  lotNumber: string;
  productName: string;
  batchNumber?: string | null;
  batchType?: string | null;
  partyName?: string | null;
  quantity: number;
  availableQuantity: number;
  disposedQuantity?: number;
  unit: string;
  rejectionReason?: string | null;
  godownName?: string | null;
  status: string;
  createdAt: string;
}

export interface RejectionReturnExportItem {
  gatePassNo: string;
  returnedAt: string;
  returnType: string;
  partyName: string;
  partyPhone?: string | null;
  productName: string;
  lotNumber: string;
  returnQuantity: number;
  unit: string;
  transporterName?: string | null;
  vehicleNumber?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  reason?: string | null;
  remarks?: string | null;
}

export interface RejectionReportDocData {
  shop: ShopHeader;
  lots: RejectionLotExportItem[];
  returns: RejectionReturnExportItem[];
  generatedAt?: string | Date;
}

const fmtDate = (v: string | Date | null | undefined) =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

export async function generateRejectionReportPdf({
  shop,
  lots,
  returns,
  generatedAt = new Date(),
}: RejectionReportDocData): Promise<{ blob: Blob; filename: string }> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }) as any;
  await embedDevanagariFont(doc);

  const dateStr = fmtDate(generatedAt);
  let y = renderProfessionalHeader(doc, shop, 'Rejection & Return Engine Summary Report', dateStr, {
    periodLabel: 'Report Generated',
  });

  const totalLots = lots.length;
  const availableKg = lots.reduce((sum, l) => sum + (Number(l.availableQuantity) || 0), 0);
  const disposedKg = lots.reduce((sum, l) => sum + (Number(l.disposedQuantity) || 0), 0);
  const returnedChallans = returns.length;
  const returnedKg = returns.reduce((sum, r) => sum + (Number(r.returnQuantity) || 0), 0);

  // Summary Metrics Section
  autoTable(doc, {
    startY: y + 2,
    head: [['Total Reject Lots', 'Available Reject Stock', 'Returned (Gate Passes)', 'Disposed / Scrapped']],
    body: [[
      `${totalLots} Lots`,
      `${availableKg.toLocaleString('en-IN')} kg`,
      `${returnedChallans} Challans (${returnedKg.toLocaleString('en-IN')} kg)`,
      `${disposedKg.toLocaleString('en-IN')} kg`,
    ]],
    theme: 'grid',
    styles: {
      font: smartFont(shop?.name || ''),
      fontSize: 9,
      cellPadding: 3,
      halign: 'center',
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [51, 65, 85],
      fontStyle: 'bold',
    },
    bodyStyles: {
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    margin: { left: PDF_LAYOUT.marginX, right: PDF_LAYOUT.marginX },
  });

  y = doc.lastAutoTable.finalY + 6;

  // Section 1: Active Rejection Lots
  doc.setFont(smartFont('Rejection Lots'), 'bold');
  doc.setFontSize(11);
  doc.setTextColor(220, 38, 38);
  doc.text(`1. Active Rejection Lots & Inventory (${lots.length} Records)`, PDF_LAYOUT.marginX, y);

  const lotsRows = lots.map((l, idx) => [
    idx + 1,
    l.lotNumber || '-',
    l.productName || '-',
    l.batchNumber ? `${l.batchNumber}${l.partyName ? ` (${l.partyName})` : ''}` : '-',
    `${l.quantity} ${l.unit}`,
    `${l.availableQuantity} ${l.unit}`,
    `${l.disposedQuantity || 0} ${l.unit}`,
    l.rejectionReason || 'Quality Failure',
    l.godownName || 'Holding',
    l.status.replace('_', ' '),
  ]);

  autoTable(doc, {
    startY: y + 2,
    head: [['#', 'Lot No', 'Product / Item', 'Batch / Source', 'Initial', 'Available', 'Disposed', 'Rejection Reason', 'Godown', 'Status']],
    body: lotsRows.length > 0 ? lotsRows : [['-', 'No active rejection lots found', '-', '-', '-', '-', '-', '-', '-', '-']],
    theme: 'striped',
    styles: {
      font: smartFont(shop?.name || ''),
      fontSize: 8,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [239, 68, 68],
      textColor: 255,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 26, fontStyle: 'bold' },
      2: { cellWidth: 40 },
      3: { cellWidth: 35 },
      4: { cellWidth: 20, halign: 'right' },
      5: { cellWidth: 22, halign: 'right', fontStyle: 'bold', textColor: [16, 185, 129] },
      6: { cellWidth: 20, halign: 'right' },
      7: { cellWidth: 45 },
      8: { cellWidth: 28 },
      9: { cellWidth: 26, halign: 'center' },
    },
    margin: { left: PDF_LAYOUT.marginX, right: PDF_LAYOUT.marginX },
  });

  y = doc.lastAutoTable.finalY + 8;

  // If page is almost full, add new page
  if (y > 150) {
    doc.addPage();
    y = 15;
  }

  // Section 2: Return Gate Passes (Dispatched Returns)
  doc.setFont(smartFont('Dispatched Returns'), 'bold');
  doc.setFontSize(11);
  doc.setTextColor(37, 99, 235);
  doc.text(`2. Dispatched Material Return History & Gate Passes (${returns.length} Records)`, PDF_LAYOUT.marginX, y);

  const returnRows = returns.map((r, idx) => [
    idx + 1,
    r.gatePassNo || '-',
    fmtDate(r.returnedAt),
    r.returnType === 'JOB_WORK_RETURN' ? 'Job Work' : 'Supplier',
    `${r.partyName}${r.partyPhone ? ` (${r.partyPhone})` : ''}`,
    `${r.productName} (Lot: ${r.lotNumber})`,
    `${r.returnQuantity} ${r.unit}`,
    `${r.transporterName || 'Direct'} / ${r.vehicleNumber || '-'}`,
    r.reason || r.remarks || '-',
  ]);

  autoTable(doc, {
    startY: y + 2,
    head: [['#', 'Gate Pass No', 'Date', 'Type', 'Party Name & Contact', 'Product / Lot', 'Return Qty', 'Transport & Vehicle', 'Reason / Remarks']],
    body: returnRows.length > 0 ? returnRows : [['-', 'No return records dispatched yet', '-', '-', '-', '-', '-', '-', '-']],
    theme: 'striped',
    styles: {
      font: smartFont(shop?.name || ''),
      fontSize: 8,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: 255,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 28, fontStyle: 'bold', textColor: [37, 99, 235] },
      2: { cellWidth: 22 },
      3: { cellWidth: 22, halign: 'center' },
      4: { cellWidth: 50 },
      5: { cellWidth: 45 },
      6: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
      7: { cellWidth: 38 },
      8: { cellWidth: 35 },
    },
    margin: { left: PDF_LAYOUT.marginX, right: PDF_LAYOUT.marginX },
  });

  renderProfessionalFooter(doc);

  const filename = `Rejection_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
  return { blob: doc.output('blob'), filename };
}
