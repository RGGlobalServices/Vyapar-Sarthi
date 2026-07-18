import { saveOrShareBlob } from '@/lib/nativeSave';

export async function exportSalarySlipPDF({
  shopInfo,
  staffInfo,
  salaryRecords,
  dateRangeString
}: {
  shopInfo: { name: string; address?: string; contact?: string };
  staffInfo: { name: string; role: string; joiningDate: string; salaryType: string };
  salaryRecords: any[];
  dateRangeString: string;
}): Promise<File> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF() as any;

  // Header
  doc.setFontSize(22);
  doc.setTextColor(16, 185, 129); // emerald-500
  doc.text(shopInfo.name || 'Store Name', 14, 22);

  doc.setFontSize(10);
  doc.setTextColor(100);
  let currentY = 28;
  if (shopInfo.address) {
    doc.text(shopInfo.address, 14, currentY);
    currentY += 5;
  }
  if (shopInfo.contact) {
    doc.text(`Contact: ${shopInfo.contact}`, 14, currentY);
    currentY += 5;
  }

  // Document Title
  doc.setFontSize(16);
  doc.setTextColor(40);
  doc.text('SALARY SLIP', 14, currentY + 10);
  
  // Staff Details
  doc.setFontSize(11);
  doc.text(`Employee Name: ${staffInfo.name}`, 14, currentY + 20);
  doc.text(`Role: ${staffInfo.role}`, 14, currentY + 26);
  doc.text(`Salary Type: ${staffInfo.salaryType === 'daily' ? 'Daily Wage' : 'Monthly Fixed'}`, 120, currentY + 20);
  doc.text(`Date Range: ${dateRangeString}`, 120, currentY + 26);

  // Table
  const tableData = salaryRecords.map(r => {
    let bonusTotal = 0;
    try {
      if (r.bonus) {
        const b = JSON.parse(r.bonus);
        bonusTotal = Object.values(b).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0) as number;
      }
    } catch (e) {}

    return [
      r.monthYear,
      `Rs. ${Number(r.baseAmount).toLocaleString('en-IN')}`,
      `Rs. ${Number(r.deductions).toLocaleString('en-IN')}`,
      `Rs. ${bonusTotal.toLocaleString('en-IN')}`,
      r.paymentMode,
      `Rs. ${Number(r.netAmount).toLocaleString('en-IN')}`
    ];
  });

  autoTable(doc, {
    startY: currentY + 36,
    head: [['Month/Year', 'Base', 'Deductions', 'Bonus', 'Mode', 'Net Paid']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [16, 185, 129] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  // Totals
  const totalPaid = salaryRecords.reduce((sum, r) => sum + Number(r.netAmount), 0);
  const finalY = doc.lastAutoTable?.finalY || currentY + 50;

  doc.setFontSize(12);
  doc.setTextColor(40);
  doc.text(`Total Paid in this Period: Rs. ${totalPaid.toLocaleString('en-IN')}`, 14, finalY + 15);

  // Signatures
  doc.setFontSize(10);
  doc.text('Employer Signature', 14, finalY + 45);
  doc.text('Employee Signature', 150, finalY + 45);
  
  doc.setLineWidth(0.5);
  doc.line(14, finalY + 40, 60, finalY + 40);
  doc.line(150, finalY + 40, 196, finalY + 40);

  // Return as File for sharing
  const blob = doc.output('blob');
  return new File([blob], `Salary_Slip_${staffInfo.name.replace(/\\s+/g, '_')}_${dateRangeString.replace(/\\s+/g, '_')}.pdf`, {
    type: 'application/pdf',
  });
}
