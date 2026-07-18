import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function exportUdharPDF(
  customers: any[],
  shopName: string,
  dateRangeLabel: string
) {
  const doc = new jsPDF();

  // Title
  doc.setFontSize(16);
  doc.text('Udhar Khata Report', 14, 20);

  // Metadata
  doc.setFontSize(10);
  doc.text(`Shop Name: ${shopName}`, 14, 28);
  doc.text(`Date Range: ${dateRangeLabel}`, 14, 34);
  doc.text(`Generated On: ${new Date().toLocaleString()}`, 14, 40);

  let totalGiven = 0;
  let totalReceived = 0;

  const tableData: any[][] = [];

  customers.forEach(customer => {
    const txs = customer.transactions || [];
    
    // Sort transactions oldest first
    const sortedTxs = [...txs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    sortedTxs.forEach((tx: any) => {
      if (tx.type === 'udhar') totalGiven += tx.amount;
      if (tx.type === 'payment') totalReceived += tx.amount;
      
      tableData.push([
        new Date(tx.date).toLocaleDateString('en-IN'),
        customer.name,
        tx.type === 'udhar' ? 'Credit' : 'Payment',
        `Rs ${tx.amount.toLocaleString('en-IN')}`,
        tx.note || ''
      ]);
    });
  });

  // Render Table
  autoTable(doc, {
    startY: 45,
    head: [['Date', 'Customer', 'Type', 'Amount', 'Note']],
    body: tableData,
    theme: 'grid',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [249, 115, 22] }, // Tailwind orange-500
  });

  // Summary
  const finalY = (doc as any).lastAutoTable.finalY || 45;
  doc.setFontSize(12);
  doc.text('SUMMARY', 14, finalY + 15);
  doc.setFontSize(10);
  doc.text(`Total Credit Given: Rs ${totalGiven.toLocaleString('en-IN')}`, 14, finalY + 23);
  doc.text(`Total Payment Received: Rs ${totalReceived.toLocaleString('en-IN')}`, 14, finalY + 29);
  doc.text(`Net Outstanding: Rs ${(totalGiven - totalReceived).toLocaleString('en-IN')}`, 14, finalY + 35);

  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Udhar_Report_${new Date().getTime()}.pdf`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
