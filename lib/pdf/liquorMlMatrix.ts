import type { LiquorMatrix } from '../liquorMatrix';

export async function exportLiquorMlMatrixPDF(matrix: LiquorMatrix, shopName: string) {
  // Dynamically import to avoid Webpack 5 client-bundle chunking issues —
  // same convention as dailyStockRegister.ts's PDF export.
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const { embedDevanagariFont, smartFont } = await import('./professionalTemplate');

  const dateLabel = new Date().toLocaleDateString('en-IN');
  const doc = new jsPDF({ orientation: matrix.columns.length > 6 ? 'landscape' : 'portrait' }) as any;
  await embedDevanagariFont(doc);

  doc.setFont(smartFont(shopName), 'bold');
  doc.setFontSize(16);
  doc.setTextColor(16, 185, 129);
  doc.text('Brand x ML Matrix', 14, 20);

  doc.setFont(smartFont(shopName), 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Shop: ${shopName || 'Vyapar Sarthi'}`, 14, 28);
  doc.text(`Date: ${dateLabel}`, 14, 34);

  const body = matrix.rows.map(row => {
    const cells = matrix.columns.map(col => {
      const c = row.cells[col];
      if (!c) return '-';
      return c.price != null ? `${c.stock}\nRs${c.price.toFixed(0)}` : String(c.stock);
    });
    return [row.brand, ...cells, String(row.total)];
  });

  autoTable(doc, {
    startY: 40,
    head: [['Brand', ...matrix.columns, 'Total']],
    body,
    theme: 'grid',
    styles: { fontSize: 8, font: 'NotoDevanagari', halign: 'center', valign: 'middle' },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
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
  link.setAttribute('download', `ML_Matrix_${dateLabel.replace(/\//g, '-')}.pdf`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
