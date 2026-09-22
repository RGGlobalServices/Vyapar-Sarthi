import { saveOrShareBlob } from '@/lib/nativeSave';
import { embedDevanagariFont, smartFont } from './professionalTemplate';

// Fetches a remote signature image (from Profile's saved signatureUrl,
// typically a Supabase-hosted PNG from the signature-pad component) and
// returns it as a data URL jsPDF's addImage can embed directly. Any format
// other than PNG/JPEG is rasterised through a canvas first, so a stray
// WEBP/SVG upload still ends up embeddable rather than silently failing.
async function loadSignatureAsDataUrl(url: string): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const isJpeg = blob.type === 'image/jpeg' || blob.type === 'image/jpg';
    if (blob.type === 'image/png' || isJpeg) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('failed to read signature blob'));
        reader.readAsDataURL(blob);
      });
      return { dataUrl, format: isJpeg ? 'JPEG' : 'PNG' };
    }
    const objectUrl = URL.createObjectURL(blob);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || 200;
          canvas.height = img.naturalHeight || 80;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('canvas 2d unavailable')); return; }
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('signature image failed to load'));
        img.src = objectUrl;
      });
      return { dataUrl, format: 'PNG' };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null; // best-effort only — the slip still works without it
  }
}

export async function exportSalarySlipPDF({
  shopInfo,
  staffInfo,
  salaryRecords,
  dateRangeString
}: {
  shopInfo: { name: string; address?: string; contact?: string; signatureUrl?: string };
  staffInfo: { name: string; role: string; joiningDate: string; salaryType: string };
  salaryRecords: any[];
  dateRangeString: string;
}): Promise<File> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF() as any;
  await embedDevanagariFont(doc);

  // Header
  doc.setFont(smartFont(shopInfo.name), 'bold');
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

  // Signatures — employer side shows who's signing (the shop/business
  // itself) and, when the owner has saved a signature in Profile, that
  // actual signature image sitting above the line like a real signed slip
  // instead of an always-blank line.
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(`For ${shopInfo.name || 'Store'}`, 14, finalY + 26);

  if (shopInfo.signatureUrl) {
    const sig = await loadSignatureAsDataUrl(shopInfo.signatureUrl);
    if (sig) {
      // Keep it inside the 46mm-wide line (x 14→60) with a small margin,
      // and leave enough headroom above the line (finalY+40) so it never
      // overlaps the "For {shop}" caption above it.
      doc.addImage(sig.dataUrl, sig.format, 16, finalY + 28, 32, 10);
    }
  }

  doc.setFontSize(10);
  doc.setTextColor(40);
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
