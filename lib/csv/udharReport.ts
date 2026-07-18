export function exportUdharCSV(
  customers: any[],
  shopName: string,
  dateRangeLabel: string
) {
  const rows = [
    ['Udhar Khata Report'],
    [`Shop Name:`, shopName],
    [`Date Range:`, dateRangeLabel],
    [`Generated On:`, new Date().toLocaleString()],
    [],
    ['Customer Name', 'Mobile', 'Date', 'Type', 'Amount (Rs)', 'Note']
  ];

  let totalGiven = 0;
  let totalReceived = 0;

  customers.forEach(customer => {
    const txs = customer.transactions || [];
    
    // Sort transactions oldest first
    const sortedTxs = [...txs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    sortedTxs.forEach((tx: any) => {
      if (tx.type === 'udhar') totalGiven += tx.amount;
      if (tx.type === 'payment') totalReceived += tx.amount;
      
      rows.push([
        customer.name,
        customer.mobile || '',
        new Date(tx.date).toLocaleDateString('en-IN'),
        tx.type === 'udhar' ? 'Credit Given' : 'Payment Received',
        tx.amount.toString(),
        tx.note || ''
      ]);
    });
  });

  rows.push([]);
  rows.push(['SUMMARY']);
  rows.push(['Total Credit Given', totalGiven.toString()]);
  rows.push(['Total Payment Received', totalReceived.toString()]);
  rows.push(['Net Outstanding', (totalGiven - totalReceived).toString()]);

  const csvContent = rows.map(e => e.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(",")).join("\n");
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Udhar_Report_${new Date().getTime()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
