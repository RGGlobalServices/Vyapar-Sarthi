import {
  PDF_LAYOUT, renderProfessionalHeader, renderProfessionalFooter,
  renderSectionTitle, renderSignatureBlock,
  embedDevanagariFont, setSmartFont, hasDevanagari, fmtInr,
  getProfessionalTableStyles, type ShopHeader,
} from './professionalTemplate';
import { saveOrShareBlob } from '@/lib/nativeSave';

const fmt = (d: string | Date | null | undefined) => {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtTime = (d: string | Date | null | undefined) => {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

async function makeDoc(needDevanagari: boolean) {
  const [{ default: jsPDF }] = await Promise.all([import('jspdf')]);
  const doc = new jsPDF({ orientation: 'portrait' }) as any;
  if (needDevanagari) await embedDevanagariFont(doc);
  return doc;
}

async function savePdf(doc: any, filename: string) {
  const blob: Blob = doc.output('blob');
  if (await saveOrShareBlob(blob, filename)) return;
  doc.save(filename);
}

function drawInfoGrid(doc: any, y: number, rows: { label: string; value: string }[][], gap = 48): number {
  const L = PDF_LAYOUT.marginX;
  const W = doc.internal.pageSize.getWidth() - PDF_LAYOUT.marginX * 2;
  let curY = y;
  for (const rowPair of rows) {
    const colW = W / rowPair.length;
    rowPair.forEach((cell, ci) => {
      const x = L + ci * colW;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...PDF_LAYOUT.muted);
      doc.text(cell.label.toUpperCase(), x, curY);
      setSmartFont(doc, cell.value, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...PDF_LAYOUT.ink);
      doc.text(cell.value || '—', x, curY + 5);
    });
    curY += 13;
  }
  return curY + 4;
}

/* ─── 1. Purchase Slip ──────────────────────────────────────────────────── */
export interface PurchaseSlipInput {
  transaction: {
    billNumber: string;
    date: string | null;
    amount: number;
    note: string;
    type: string;
  };
  supplier: { name: string; mobile?: string | null; address?: string | null; gst?: string | null };
  shopInfo: ShopHeader;
}

export async function downloadPurchaseSlip({ transaction: txn, supplier, shopInfo }: PurchaseSlipInput) {
  const allText = [shopInfo.name, supplier.name, txn.note];
  const doc = await makeDoc(allText.some(hasDevanagari));

  let y = renderProfessionalHeader(doc, shopInfo, 'Purchase Slip', fmt(txn.date), { periodLabel: 'Date' });

  // Slip number + supplier box
  doc.setFillColor(248, 250, 252);
  doc.rect(PDF_LAYOUT.marginX, y, doc.internal.pageSize.getWidth() - PDF_LAYOUT.marginX * 2, 22, 'F');
  doc.setDrawColor(...PDF_LAYOUT.divider);
  doc.setLineWidth(0.3);
  doc.rect(PDF_LAYOUT.marginX, y, doc.internal.pageSize.getWidth() - PDF_LAYOUT.marginX * 2, 22);

  y = drawInfoGrid(doc, y + 4, [
    [{ label: 'Slip / Bill No.', value: txn.billNumber || '—' }, { label: 'Date', value: fmt(txn.date) }],
    [{ label: 'Supplier', value: supplier.name }, { label: 'Mobile', value: supplier.mobile || '—' }],
  ]);
  if (supplier.address) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...PDF_LAYOUT.muted);
    doc.text(`Address: ${supplier.address}`, PDF_LAYOUT.marginX, y);
    y += 8;
  }

  y = renderSectionTitle(doc, y + 2, 'Amount Details');

  const W = doc.internal.pageSize.getWidth() - PDF_LAYOUT.marginX * 2;
  // Amount block
  doc.setFillColor(...PDF_LAYOUT.accentSoft);
  doc.rect(PDF_LAYOUT.marginX, y, W, 18, 'F');
  doc.setDrawColor(...PDF_LAYOUT.accent);
  doc.setLineWidth(0.3);
  doc.rect(PDF_LAYOUT.marginX, y, W, 18);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...PDF_LAYOUT.ink);
  doc.text('Total Purchase Amount:', PDF_LAYOUT.marginX + 4, y + 11);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...PDF_LAYOUT.accent);
  doc.text(fmtInr(txn.amount), doc.internal.pageSize.getWidth() - PDF_LAYOUT.marginX - 4, y + 11, { align: 'right' });
  y += 22;

  if (txn.note) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...PDF_LAYOUT.muted);
    doc.text(`Note: ${txn.note}`, PDF_LAYOUT.marginX, y);
    y += 10;
  }

  y += 8;
  renderSignatureBlock(doc, y, ['Prepared By', 'Supplier Signature', 'Authorized Signatory']);
  renderProfessionalFooter(doc, 'This is a system-generated purchase slip.');

  const filename = `purchase-slip-${(txn.billNumber || txn.date || Date.now()).toString().replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
  await savePdf(doc, filename);
}

/* ─── 2. Weighbridge Slip (Kanta Chitthi) ──────────────────────────────── */
export interface WeighbridgeSlipInput {
  gateEntry: {
    entryNumber: string;
    vehicleNumber?: string | null;
    driverName?: string | null;
    materialDescription?: string | null;
    enteredAt: string;
    exitedAt?: string | null;
    direction?: string | null;
    weighbridgeEntries?: { slipNumber?: string | null; netWeightKg?: number | null; grossWeightKg?: number | null; tareWeightKg?: number | null }[];
  };
  supplier?: { name: string } | null;
  shopInfo: ShopHeader;
}

export async function downloadWeighbridgeSlip({ gateEntry: ge, supplier, shopInfo }: WeighbridgeSlipInput) {
  const allText = [shopInfo.name, supplier?.name, ge.materialDescription, ge.driverName];
  const doc = await makeDoc(allText.some(hasDevanagari));

  const wb = ge.weighbridgeEntries?.[0];
  const slipNum = wb?.slipNumber || ge.entryNumber;

  let y = renderProfessionalHeader(doc, shopInfo, 'Weighbridge Slip', fmt(ge.enteredAt), { periodLabel: 'Date' });

  // Marathi label
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...PDF_LAYOUT.accent);
  doc.text('कांटा चिठ्ठी (Kanta Chitthi)', PDF_LAYOUT.marginX, y);
  y += 10;

  doc.setFillColor(248, 250, 252);
  const W = doc.internal.pageSize.getWidth() - PDF_LAYOUT.marginX * 2;
  doc.rect(PDF_LAYOUT.marginX, y, W, 36, 'F');
  doc.setDrawColor(...PDF_LAYOUT.divider); doc.setLineWidth(0.3);
  doc.rect(PDF_LAYOUT.marginX, y, W, 36);

  y = drawInfoGrid(doc, y + 4, [
    [{ label: 'Slip No.', value: slipNum }, { label: 'Date', value: fmt(ge.enteredAt) }],
    [{ label: 'Vehicle No.', value: ge.vehicleNumber || '—' }, { label: 'Direction', value: (ge.direction || '').toUpperCase() || '—' }],
    [{ label: 'Driver', value: ge.driverName || '—' }, { label: 'Supplier / Party', value: supplier?.name || '—' }],
  ]);

  y = renderSectionTitle(doc, y + 2, 'Weight Details');

  const grossKg = wb?.grossWeightKg ?? null;
  const tareKg = wb?.tareWeightKg ?? null;
  const netKg = wb?.netWeightKg ?? null;

  const weightRows = [
    ['Gross Weight (भरलेले वजन)', grossKg != null ? `${grossKg.toLocaleString('en-IN')} kg` : '—'],
    ['Tare Weight (रिकाम्या वाहनाचे वजन)', tareKg != null ? `${tareKg.toLocaleString('en-IN')} kg` : '—'],
    ['Net Weight (निव्वळ वजन)', netKg != null ? `${netKg.toLocaleString('en-IN')} kg` : (wb ? '—' : 'Not weighed')],
  ];

  // Weight table
  const [{ default: autoTable }] = await Promise.all([import('jspdf-autotable')]);
  autoTable(doc, {
    startY: y,
    head: [['Description', 'Value']],
    body: weightRows,
    ...getProfessionalTableStyles(false),
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 8;

  if (ge.materialDescription) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...PDF_LAYOUT.muted);
    doc.text(`Material: ${ge.materialDescription}`, PDF_LAYOUT.marginX, y);
    y += 8;
  }

  if (ge.enteredAt || ge.exitedAt) {
    doc.text(
      `Entry: ${fmtTime(ge.enteredAt)}${ge.exitedAt ? `   |   Exit: ${fmtTime(ge.exitedAt)}` : ''}`,
      PDF_LAYOUT.marginX, y,
    );
    y += 8;
  }

  y += 4;
  renderSignatureBlock(doc, y, ['Operator', 'Driver Signature', 'Authorized Signatory']);
  renderProfessionalFooter(doc, 'This is a system-generated weighbridge slip.');

  const filename = `weighbridge-slip-${slipNum.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
  await savePdf(doc, filename);
}

/* ─── 3. Entry / Exit Slip ─────────────────────────────────────────────── */
export interface EntryExitSlipInput {
  gateEntry: {
    entryNumber: string;
    vehicleNumber?: string | null;
    driverName?: string | null;
    materialDescription?: string | null;
    enteredAt: string;
    exitedAt?: string | null;
    direction?: string | null;
    purposeNote?: string | null;
  };
  supplier?: { name: string } | null;
  shopInfo: ShopHeader;
}

export async function downloadEntryExitSlip({ gateEntry: ge, supplier, shopInfo }: EntryExitSlipInput) {
  const allText = [shopInfo.name, supplier?.name, ge.materialDescription, ge.driverName];
  const doc = await makeDoc(allText.some(hasDevanagari));

  let y = renderProfessionalHeader(doc, shopInfo, 'Entry / Exit Slip', fmt(ge.enteredAt), { periodLabel: 'Date' });

  y = drawInfoGrid(doc, y + 4, [
    [{ label: 'Gate Entry No.', value: ge.entryNumber }, { label: 'Date', value: fmt(ge.enteredAt) }],
    [{ label: 'Vehicle No.', value: ge.vehicleNumber || '—' }, { label: 'Direction', value: (ge.direction || '').toUpperCase() || '—' }],
    [{ label: 'Driver', value: ge.driverName || '—' }, { label: 'Party / Supplier', value: supplier?.name || '—' }],
    [{ label: 'Entry Time', value: fmtTime(ge.enteredAt) }, { label: 'Exit Time', value: ge.exitedAt ? fmtTime(ge.exitedAt) : 'Not Exited' }],
  ]);

  if (ge.materialDescription || ge.purposeNote) {
    y = renderSectionTitle(doc, y + 2, 'Purpose / Material');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...PDF_LAYOUT.ink);
    if (ge.materialDescription) { doc.text(`Material: ${ge.materialDescription}`, PDF_LAYOUT.marginX, y); y += 7; }
    if (ge.purposeNote) { doc.text(`Purpose: ${ge.purposeNote}`, PDF_LAYOUT.marginX, y); y += 7; }
  }

  y += 8;
  renderSignatureBlock(doc, y, ['Gate Operator', 'Driver', 'Security']);
  renderProfessionalFooter(doc, 'This is a system-generated entry/exit slip.');

  const filename = `entry-exit-${ge.entryNumber.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
  await savePdf(doc, filename);
}

/* ─── 4. Dispatch Challan ───────────────────────────────────────────────── */
export interface DispatchChallanInput {
  sale: {
    billNumber: string;
    date: string | null;
    items?: { name: string; quantity: number; price: number; unit?: string | null; variant?: string | null }[];
    total: number;
    note?: string | null;
  };
  customer: { name: string; mobile?: string | null; address?: string | null };
  shopInfo: ShopHeader;
}

export async function downloadDispatchChallan({ sale, customer, shopInfo }: DispatchChallanInput) {
  const allText = [shopInfo.name, customer.name, customer.address, ...(sale.items || []).map(i => i.name)];
  const doc = await makeDoc(allText.some(hasDevanagari));
  const [{ default: autoTable }] = await Promise.all([import('jspdf-autotable')]);

  let y = renderProfessionalHeader(doc, shopInfo, 'Dispatch Challan', fmt(sale.date), { periodLabel: 'Date' });

  doc.setFillColor(248, 250, 252);
  const W = doc.internal.pageSize.getWidth() - PDF_LAYOUT.marginX * 2;
  doc.rect(PDF_LAYOUT.marginX, y, W, 22, 'F');
  doc.setDrawColor(...PDF_LAYOUT.divider); doc.setLineWidth(0.3);
  doc.rect(PDF_LAYOUT.marginX, y, W, 22);

  y = drawInfoGrid(doc, y + 4, [
    [{ label: 'Challan No.', value: sale.billNumber || '—' }, { label: 'Date', value: fmt(sale.date) }],
    [{ label: 'Deliver To', value: customer.name }, { label: 'Mobile', value: customer.mobile || '—' }],
  ]);
  if (customer.address) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...PDF_LAYOUT.muted);
    doc.text(`Address: ${customer.address}`, PDF_LAYOUT.marginX, y);
    y += 8;
  }

  y = renderSectionTitle(doc, y + 2, 'Items Dispatched');

  if (sale.items && sale.items.length > 0) {
    const body = sale.items.map((item, i) => [
      String(i + 1),
      item.variant ? `${item.name} (${item.variant})` : item.name,
      item.unit || 'Unit',
      item.quantity.toLocaleString('en-IN'),
      { content: fmtInr(item.price), styles: { halign: 'right' as const } },
      { content: fmtInr(item.quantity * item.price), styles: { halign: 'right' as const } },
    ]);
    autoTable(doc, {
      startY: y,
      head: [['#', 'Item', 'Unit', 'Qty', 'Rate', 'Amount']],
      body,
      ...getProfessionalTableStyles(false),
      columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' } },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 4;
  } else {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...PDF_LAYOUT.muted);
    doc.text('No item details available.', PDF_LAYOUT.marginX, y);
    y += 10;
  }

  // Total
  doc.setFillColor(...PDF_LAYOUT.accentSoft);
  doc.rect(PDF_LAYOUT.marginX, y, W, 12, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...PDF_LAYOUT.ink);
  doc.text('Total:', PDF_LAYOUT.marginX + 4, y + 8);
  doc.setTextColor(...PDF_LAYOUT.accent);
  doc.text(fmtInr(sale.total), doc.internal.pageSize.getWidth() - PDF_LAYOUT.marginX - 4, y + 8, { align: 'right' });
  y += 16;

  if (sale.note) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...PDF_LAYOUT.muted);
    doc.text(`Note: ${sale.note}`, PDF_LAYOUT.marginX, y);
    y += 8;
  }

  y += 4;
  renderSignatureBlock(doc, y, ['Prepared By', 'Receiver Signature', 'Authorized Signatory']);
  renderProfessionalFooter(doc, 'This is a system-generated dispatch challan.');

  const filename = `dispatch-challan-${(sale.billNumber || Date.now()).toString().replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
  await savePdf(doc, filename);
}

/* ─── 5. Transport Slip ─────────────────────────────────────────────────── */
export interface TransportSlipInput {
  entry: {
    id: string;
    date: string;
    amount: number;
    type: 'charge' | 'payment';
    direction?: string | null;
    vehicleNumber?: string | null;
    paymentMethod?: string | null;
    note?: string | null;
    freightFor?: string | null;
  };
  transporter: { name: string };
  shopInfo: ShopHeader;
}

export async function downloadTransportSlip({ entry, transporter, shopInfo }: TransportSlipInput) {
  const allText = [shopInfo.name, transporter.name, entry.note, entry.freightFor];
  const doc = await makeDoc(allText.some(hasDevanagari));

  const isCharge = entry.type === 'charge';
  const slipTitle = isCharge ? 'Transport Charge Slip' : 'Freight Payment Receipt';

  let y = renderProfessionalHeader(doc, shopInfo, slipTitle, fmt(entry.date), { periodLabel: 'Date' });

  doc.setFillColor(248, 250, 252);
  const W = doc.internal.pageSize.getWidth() - PDF_LAYOUT.marginX * 2;
  doc.rect(PDF_LAYOUT.marginX, y, W, 34, 'F');
  doc.setDrawColor(...PDF_LAYOUT.divider); doc.setLineWidth(0.3);
  doc.rect(PDF_LAYOUT.marginX, y, W, 34);

  y = drawInfoGrid(doc, y + 4, [
    [{ label: 'Transporter', value: transporter.name }, { label: 'Date', value: fmt(entry.date) }],
    [{ label: 'Vehicle No.', value: entry.vehicleNumber || '—' }, { label: 'Type', value: isCharge ? 'Freight Charge' : 'Payment' }],
    [{ label: 'Direction', value: entry.direction ? (entry.direction === 'purchase' ? 'Purchase (Inward)' : 'Sale (Outward)') : '—' },
     { label: 'Mode', value: entry.paymentMethod || (isCharge ? 'N/A' : '—') }],
  ]);

  if (entry.freightFor) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...PDF_LAYOUT.muted);
    doc.text(`For: ${entry.freightFor}`, PDF_LAYOUT.marginX, y);
    y += 8;
  }

  y = renderSectionTitle(doc, y + 2, isCharge ? 'Freight Charge' : 'Payment Details');

  doc.setFillColor(...PDF_LAYOUT.accentSoft);
  doc.rect(PDF_LAYOUT.marginX, y, W, 16, 'F');
  doc.setDrawColor(...PDF_LAYOUT.accent); doc.setLineWidth(0.3);
  doc.rect(PDF_LAYOUT.marginX, y, W, 16);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...PDF_LAYOUT.ink);
  doc.text(isCharge ? 'Freight Amount:' : 'Amount Paid:', PDF_LAYOUT.marginX + 4, y + 10);
  doc.setTextColor(...PDF_LAYOUT.accent); doc.setFontSize(13);
  doc.text(fmtInr(entry.amount), doc.internal.pageSize.getWidth() - PDF_LAYOUT.marginX - 4, y + 10, { align: 'right' });
  y += 20;

  if (entry.note) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...PDF_LAYOUT.muted);
    const cleaned = String(entry.note).replace(/^\[[A-Z]{2,4}\s+[0-9a-f-]{36}\]\s*/i, '');
    doc.text(`Note: ${cleaned}`, PDF_LAYOUT.marginX, y);
    y += 8;
  }

  y += 6;
  renderSignatureBlock(doc, y, ['Prepared By', 'Transporter', 'Authorized Signatory']);
  renderProfessionalFooter(doc, 'This is a system-generated transport slip.');

  const filename = `transport-slip-${entry.id.slice(0, 8)}.pdf`;
  await savePdf(doc, filename);
}

/* ─── 6. Payment Receipt (Pavti) Slip ──────────────────────────────────── */
export interface ReceiptSlipInput {
  receipt: {
    id: string;
    billNumber?: string | null;
    date: string;
    amount: number;
    note?: string | null;
    paymentMode?: string | null;
  };
  party: { name: string; mobile?: string | null };
  shopInfo: ShopHeader;
}

export async function downloadReceiptSlip({ receipt, party, shopInfo }: ReceiptSlipInput) {
  const allText = [shopInfo.name, party.name, receipt.note];
  const doc = await makeDoc(allText.some(hasDevanagari));

  let y = renderProfessionalHeader(doc, shopInfo, 'Payment Receipt', fmt(receipt.date), { periodLabel: 'Date' });

  const W = doc.internal.pageSize.getWidth() - PDF_LAYOUT.marginX * 2;

  doc.setFillColor(248, 250, 252);
  doc.rect(PDF_LAYOUT.marginX, y, W, 28, 'F');
  doc.setDrawColor(...PDF_LAYOUT.divider); doc.setLineWidth(0.3);
  doc.rect(PDF_LAYOUT.marginX, y, W, 28);

  y = drawInfoGrid(doc, y + 4, [
    [{ label: 'Received From', value: party.name }, { label: 'Mobile', value: party.mobile || '—' }],
    [{ label: 'Date', value: fmt(receipt.date) }, { label: 'Payment Mode', value: receipt.paymentMode || 'Cash' }],
  ]);

  y = renderSectionTitle(doc, y + 4, 'Amount Received');

  doc.setFillColor(...PDF_LAYOUT.accentSoft);
  doc.rect(PDF_LAYOUT.marginX, y, W, 18, 'F');
  doc.setDrawColor(...PDF_LAYOUT.accent); doc.setLineWidth(0.4);
  doc.rect(PDF_LAYOUT.marginX, y, W, 18);

  setSmartFont(doc, 'Amount Paid:', 'bold');
  doc.setFontSize(11); doc.setTextColor(...PDF_LAYOUT.ink);
  doc.text('Amount Paid:', PDF_LAYOUT.marginX + 4, y + 11);
  doc.setTextColor(...PDF_LAYOUT.accent); doc.setFontSize(14);
  doc.text(fmtInr(receipt.amount), doc.internal.pageSize.getWidth() - PDF_LAYOUT.marginX - 4, y + 11, { align: 'right' });
  y += 24;

  if (receipt.billNumber) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...PDF_LAYOUT.muted);
    doc.text(`Bill No: ${receipt.billNumber}`, PDF_LAYOUT.marginX, y);
    y += 8;
  }

  if (receipt.note) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...PDF_LAYOUT.muted);
    doc.text(`Note: ${receipt.note}`, PDF_LAYOUT.marginX, y);
    y += 8;
  }

  y += 6;
  renderSignatureBlock(doc, y, ['Prepared By', 'Receiver', 'Authorized Signatory']);
  renderProfessionalFooter(doc, 'This is a system-generated payment receipt.');

  const filename = `receipt-${receipt.billNumber || receipt.id.slice(0, 8)}.pdf`;
  await savePdf(doc, filename);
}

/** Download multiple receipts as separate PDFs in sequence. */
export async function downloadAllReceiptSlips(receipts: ReceiptSlipInput[]) {
  for (const r of receipts) {
    await downloadReceiptSlip(r);
  }
}
