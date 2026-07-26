export interface DailyStockRegisterRow {
  name: string | null;
  category: string | null;
  unit: string | null;
  rate: number | null;
  opening: number;
  received: number;
  total: number;
  closing: number | null;
  sold: number | null;
}

export async function exportDailyStockRegisterPDF(
  rows: DailyStockRegisterRow[],
  shopName: string,
  dateLabel: string
) {
  // Dynamically import to avoid Webpack 5 client-bundle chunking issues.
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF() as any;

  doc.setFontSize(16);
  doc.setTextColor(16, 185, 129);
  doc.text('Daily Stock Register', 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Shop: ${shopName || 'Vyapar Sarthi'}`, 14, 28);
  doc.text(`Date: ${dateLabel}`, 14, 34);
  doc.text(`Generated On: ${new Date().toLocaleString('en-IN')}`, 14, 40);

  const body = rows.map(r => [
    r.name || '',
    r.category || '',
    r.rate != null ? r.rate.toFixed(2) : '-',
    String(r.opening),
    String(r.received),
    String(r.total),
    r.closing != null ? String(r.closing) : '-',
    r.sold != null ? String(r.sold) : '-',
  ]);

  autoTable(doc, {
    startY: 46,
    head: [['Product', 'Category', 'Rate (Rs)', 'Opening', 'Receive', 'Total', 'Close', 'Sale']],
    body,
    theme: 'grid',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [16, 185, 129] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.width - 25, doc.internal.pageSize.height - 10);
  }

  const blob: Blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Daily_Stock_Register_${dateLabel}.pdf`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
