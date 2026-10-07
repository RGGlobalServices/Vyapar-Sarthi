/**
 * generateA4BillPDF — vector jsPDF A4 GST Invoice
 *
 * Used by the billing page when invoiceFormat === 'a4'.
 * Produces a text-based (searchable, sharp at any zoom) PDF
 * instead of the html2canvas screenshot approach.
 */
import {
  PDF_LAYOUT, embedDevanagariFont, setSmartFont, hasDevanagari,
  renderProfessionalFooter, fmtInr, type ShopHeader,
} from './professionalTemplate';
import { saveOrShareBlob } from '@/lib/nativeSave';

export interface GSTBillItem {
  name: string;
  variantLabel?: string;
  quantity: number;
  unit?: string;
  price: number;
  total: number;
  gstPercent?: number;
  hsnCode?: string;
}

export interface GSTBreakdownEntry {
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst?: number;
}

export interface A4BillInput {
  shop: ShopHeader;
  billNumber: string;
  date: string;
  billType: 'gst' | 'non-gst';
  customerName?: string;
  customerMobile?: string;
  customerAddress?: string;
  customerGst?: string;
  items: GSTBillItem[];
  subtotal: number;
  discount?: number;
  total: number;
  amountPaid?: number;
  remainingAmount?: number;
  paymentMethod?: string;
  splitPayments?: { method: string; amount: number }[];
  gstBreakdown?: GSTBreakdownEntry[];
  invoiceFooter?: string;
  ownerSignature?: string;
  fssai?: string;
}

const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const DIV: [number, number, number] = [203, 213, 225];
const BLACK: [number, number, number] = [0, 0, 0];
const WHITE: [number, number, number] = [255, 255, 255];
const SOFT: [number, number, number] = [248, 250, 252];
const L = PDF_LAYOUT.marginX;

function fmtQty(qty: number): string {
  return qty % 1 === 0 ? String(qty) : qty.toFixed(2);
}

function line(doc: any, y: number, dashed = false) {
  const W = doc.internal.pageSize.getWidth() - PDF_LAYOUT.marginX;
  doc.setDrawColor(...DIV);
  doc.setLineWidth(0.3);
  if (dashed) {
    doc.setLineDash([2, 2], 0);
  } else {
    doc.setLineDash([], 0);
  }
  doc.line(L, y, W, y);
  doc.setLineDash([], 0);
}

function cell(doc: any, text: string, x: number, y: number, w: number, align: 'left' | 'right' | 'center' = 'left') {
  setSmartFont(doc, text, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(String(text || ''), align === 'right' ? x + w : align === 'center' ? x + w / 2 : x, y, { align });
}

function boldCell(doc: any, text: string, x: number, y: number, w: number, align: 'left' | 'right' | 'center' = 'left') {
  setSmartFont(doc, text, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(String(text || ''), align === 'right' ? x + w : align === 'center' ? x + w / 2 : x, y, { align });
}

export async function generateA4BillPDF(input: A4BillInput): Promise<{ pdf: any; blob: Blob }> {
  const { default: jsPDF } = await import('jspdf');
  const doc = new (jsPDF as any)({ orientation: 'portrait', unit: 'mm', format: 'a4' }) as any;

  const allText = [
    input.shop.name, input.customerName, input.customerAddress,
    ...input.items.map(i => i.name),
  ].join(' ');
  if (hasDevanagari(allText)) await embedDevanagariFont(doc);

  const PW = doc.internal.pageSize.getWidth();
  const R = PW - PDF_LAYOUT.marginX;
  const COL_W = R - L;

  let y = 10;

  /* ── 1. Shop Header ──────────────────────────────────────────────────── */
  setSmartFont(doc, input.shop.name, 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...INK);
  doc.text(input.shop.name || 'Business', PW / 2, y, { align: 'center' });
  y += 6;

  const meta: string[] = [];
  if (input.shop.address) meta.push(input.shop.address);
  const contactLine: string[] = [];
  if (input.shop.mobile) contactLine.push(`Mob: ${input.shop.mobile}`);
  if (input.shop.gst) contactLine.push(`GSTIN: ${input.shop.gst}`);
  if (input.shop.pan) contactLine.push(`PAN: ${input.shop.pan}`);
  if (input.fssai) contactLine.push(`FSSAI: ${input.fssai}`);
  if (contactLine.length) meta.push(contactLine.join('  ·  '));

  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  for (const line_ of meta) {
    setSmartFont(doc, line_, 'normal');
    doc.text(line_, PW / 2, y, { align: 'center' });
    y += 4;
  }

  /* ── 2. "GST INVOICE" black band ────────────────────────────────────── */
  y += 2;
  doc.setFillColor(...BLACK);
  doc.rect(L, y, COL_W, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...WHITE);
  doc.text(input.billType === 'gst' ? 'GST INVOICE' : 'INVOICE', PW / 2, y + 5.5, { align: 'center' });
  y += 10;

  /* ── 3. Bill # + Date row ───────────────────────────────────────────── */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  doc.text(`Bill: ${input.billNumber}`, L, y + 4);
  doc.text(input.date, R, y + 4, { align: 'right' });
  y += 8;

  line(doc, y, true);
  y += 4;

  /* ── 4. Customer box ────────────────────────────────────────────────── */
  if (input.customerName) {
    doc.setFillColor(...SOFT);
    const boxH = 10 + (input.customerAddress ? 4 : 0) + (input.customerGst ? 4 : 0);
    doc.rect(L, y, COL_W, boxH, 'F');
    doc.setDrawColor(...DIV);
    doc.setLineWidth(0.3);
    doc.rect(L, y, COL_W, boxH);
    setSmartFont(doc, 'Customer: ' + input.customerName, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text('Customer: ', L + 2, y + 5);
    const cx = L + 2 + doc.getTextWidth('Customer: ');
    setSmartFont(doc, input.customerName, 'bold');
    doc.setFont(hasDevanagari(input.customerName) ? 'NotoDevanagari' : 'helvetica', 'bold');
    doc.text(input.customerName, cx, y + 5);
    let subY = y + 9;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    const subParts: string[] = [];
    if (input.customerMobile) subParts.push(`Mob: ${input.customerMobile}`);
    if (input.customerGst) subParts.push(`GSTIN: ${input.customerGst}`);
    if (input.customerAddress) subParts.push(input.customerAddress);
    if (subParts.length) {
      doc.text(subParts.join('  ·  '), L + 2, subY);
      subY += 4;
    }
    y += boxH + 3;
  }

  /* ── 5. Items table header ──────────────────────────────────────────── */
  const C = {
    item: L,
    itemW: COL_W * 0.50,
    qtyRate: L + COL_W * 0.50,
    qtyRateW: COL_W * 0.32,
    amt: L + COL_W * 0.82,
    amtW: COL_W * 0.18,
  };

  doc.setFillColor(...SOFT);
  doc.rect(L, y, COL_W, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('ITEM', C.item + 1, y + 5);
  doc.text('QTY × RATE', C.qtyRate + C.qtyRateW / 2, y + 5, { align: 'center' });
  doc.text('AMT', C.amt + C.amtW, y + 5, { align: 'right' });
  y += 7;

  line(doc, y);

  /* ── 6. Items ───────────────────────────────────────────────────────── */
  for (const item of input.items) {
    y += 1;
    const rowStartY = y;

    // Item name
    setSmartFont(doc, item.name, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    const nameLines = doc.splitTextToSize(item.name, C.itemW - 2);
    doc.text(nameLines, C.item + 1, y + 4);
    let nameH = nameLines.length * 4.5;

    // Variant
    if (item.variantLabel) {
      setSmartFont(doc, item.variantLabel, 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(item.variantLabel, C.item + 1, y + 4 + nameH);
      nameH += 4;
    }

    // Qty × Rate
    const qtyRate = `${fmtQty(item.quantity)} ${item.unit || 'Piece'} × ₹${item.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    doc.text(qtyRate, C.qtyRate + C.qtyRateW / 2, y + 4, { align: 'center' });

    // GST%
    if (input.billType === 'gst' && item.gstPercent !== undefined) {
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(`GST: ${item.gstPercent}%`, C.qtyRate + C.qtyRateW / 2, y + 8.5, { align: 'center' });
    }

    // Amount
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(`₹${item.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, C.amt + C.amtW, y + 4, { align: 'right' });

    const rowH = Math.max(nameH + 5, 14);
    y = rowStartY + rowH;
    line(doc, y, true);
  }

  y += 3;

  /* ── 7. Subtotal ────────────────────────────────────────────────────── */
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text('Subtotal:', C.item + 1, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...INK);
  doc.text(`₹${input.subtotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, C.amt + C.amtW, y, { align: 'right' });
  y += 5;

  if (input.discount && input.discount > 0) {
    doc.setTextColor(...MUTED);
    doc.text('Discount:', C.item + 1, y);
    doc.setTextColor(220, 38, 38);
    doc.text(`-₹${input.discount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, C.amt + C.amtW, y, { align: 'right' });
    y += 5;
  }

  line(doc, y, true);
  y += 4;

  /* ── 8. GST Tax Summary ──────────────────────────────────────────────── */
  if (input.billType === 'gst' && input.gstBreakdown && input.gstBreakdown.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    doc.text('GST TAX SUMMARY', PW / 2, y, { align: 'center' });
    y += 5;

    // Table header
    const GW = COL_W / 4;
    doc.setFillColor(...SOFT);
    doc.rect(L, y, COL_W, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text('Rate', L + 1, y + 4);
    doc.text('Taxable', L + GW + GW / 2, y + 4, { align: 'center' });
    doc.text('CGST', L + GW * 2 + GW / 2, y + 4, { align: 'center' });
    doc.text('SGST', L + GW * 3 + GW, y + 4, { align: 'right' });
    y += 6;
    line(doc, y);

    let totalGst = 0;
    for (const g of input.gstBreakdown) {
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...INK);
      doc.text(`${g.rate}%`, L + 1, y);
      doc.text(`₹${g.taxable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, L + GW + GW / 2, y, { align: 'center' });
      doc.text(`₹${g.cgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, L + GW * 2 + GW / 2, y, { align: 'center' });
      doc.text(`₹${g.sgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, L + GW * 3 + GW, y, { align: 'right' });
      totalGst += g.cgst + g.sgst + (g.igst || 0);
      line(doc, y + 2, true);
    }
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    doc.text('Total GST', L + 1, y);
    doc.text(`₹${totalGst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, R, y, { align: 'right' });
    y += 4;
    line(doc, y, true);
    y += 4;
  }

  /* ── 9. Payment Mode ────────────────────────────────────────────────── */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...INK);
  doc.text('PAYMENT MODE:', L + 1, y);
  y += 5;

  if (input.splitPayments && input.splitPayments.length > 1) {
    for (const sp of input.splitPayments) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...INK);
      doc.text(sp.method, L + 2, y);
      doc.text(`₹${sp.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, R, y, { align: 'right' });
      y += 5;
    }
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    doc.text(input.paymentMethod || 'Cash', L + 2, y);
    doc.text(`₹${(input.amountPaid ?? input.total).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, R, y, { align: 'right' });
    y += 5;
  }

  line(doc, y, true);
  y += 3;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('Collected:', L + 2, y);
  doc.text(`₹${(input.amountPaid ?? input.total).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, R, y, { align: 'right' });
  y += 4;
  doc.text('Remaining Due:', L + 2, y);
  doc.text(`₹${(input.remainingAmount ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, R, y, { align: 'right' });
  y += 5;

  line(doc, y);
  y += 5;

  /* ── 10. TOTAL row ──────────────────────────────────────────────────── */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text('TOTAL', L + 1, y);
  doc.text(`₹${input.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, R, y, { align: 'right' });
  y += 6;

  line(doc, y);
  y += 4;

  /* ── 11. Payment Status badge ───────────────────────────────────────── */
  const remaining = input.remainingAmount ?? 0;
  const statusText = remaining > 0 ? 'Payment Status: PENDING' : 'Payment Status: PAID';
  doc.setFillColor(...SOFT);
  doc.rect(L, y, COL_W, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(remaining > 0 ? 220 : 22, remaining > 0 ? 38 : 163, remaining > 0 ? 38 : 74);
  doc.text(statusText, PW / 2, y + 4.5, { align: 'center' });
  y += 10;

  /* ── 12. Footer / Thank You ─────────────────────────────────────────── */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text('THANK YOU!', PW / 2, y, { align: 'center' });
  y += 5;

  const footerLines = [
    input.invoiceFooter || 'Payment due within 7 days of invoice date.',
    'Goods once sold will not be taken back.',
    'Powered by Vyapar Sarthi',
  ];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  for (const fl of footerLines) {
    doc.text(fl, PW / 2, y, { align: 'center' });
    y += 4;
  }

  const blob: Blob = doc.output('blob');
  return { pdf: doc, blob };
}

export async function downloadA4BillPDF(input: A4BillInput, filename: string) {
  const { pdf, blob } = await generateA4BillPDF(input);
  if (await saveOrShareBlob(blob, filename)) return;
  pdf.save(filename);
}
