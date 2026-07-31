import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveOrShareBlob } from '@/lib/nativeSave';
import {
  renderProfessionalHeader,
  renderProfessionalFooter,
  renderSectionTitle,
  renderSummaryBox,
  renderSignatureBlock,
  ensureRoom,
  fmtInr,
  PROFESSIONAL_TABLE_STYLES,
  type ShopHeader,
  type SummaryItem,
} from './professionalTemplate';

/**
 * Udhar Khata Statement — CA-grade PDF.
 *
 * Renders one grand ledger of every udhar/payment transaction across every
 * customer, plus a running balance column so the accountant can reconcile
 * without reaching for a calculator. Summary KPIs sit above the table; the
 * signature block goes on the last page for stamping.
 *
 * Backward compatible: old callsites passing just `shopName` still work.
 */
export async function exportUdharPDF(
  customers: any[],
  shopOrName: string | ShopHeader,
  dateRangeLabel: string,
) {
  const doc = new jsPDF() as any;
  const shop: ShopHeader = typeof shopOrName === 'string'
    ? { name: shopOrName }
    : shopOrName;

  // 1. Header (letterhead)
  let y = renderProfessionalHeader(doc, shop, 'Udhar Khata Statement', dateRangeLabel);

  // Flatten every customer's transactions into one time-ordered ledger so
  // the running balance across the whole shop is meaningful. Per-customer
  // sorting is preserved by starting each customer as its own contiguous
  // block after global chronological grouping — a straight time sort would
  // scatter transactions between customers and make the running balance
  // useless. Grouping by customer with oldest-first inside each group is
  // what accountants reach for.
  let totalGiven = 0;
  let totalReceived = 0;
  const rows: any[] = [];

  const sortedCustomers = [...customers].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  for (const customer of sortedCustomers) {
    const txs = [...(customer.transactions || [])].sort(
      (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    if (txs.length === 0) continue;

    let running = 0;
    for (const tx of txs) {
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'udhar') { totalGiven += amt; running += amt; }
      else if (tx.type === 'payment') { totalReceived += amt; running -= amt; }

      // Customer cell shows name on line 1 and phone on line 2 so the
      // accountant can dial without cross-referencing the customer list.
      const customerCell = customer.mobile
        ? `${customer.name || '—'}\n${customer.mobile}`
        : (customer.name || '—');

      rows.push([
        new Date(tx.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        customerCell,
        tx.type === 'udhar' ? 'Credit' : 'Payment',
        {
          content: tx.type === 'udhar' ? fmtInr(amt) : '',
          styles: { halign: 'right', textColor: [220, 38, 38] },
        },
        {
          content: tx.type === 'payment' ? fmtInr(amt) : '',
          styles: { halign: 'right', textColor: [22, 163, 74] },
        },
        {
          content: fmtInr(running),
          styles: { halign: 'right', fontStyle: running > 0 ? 'bold' : 'normal' },
        },
        tx.note || '',
      ]);
    }
    // Per-customer subtotal row — light grey band showing the closing
    // balance for this customer, so the accountant can spot who owes what
    // without scanning the whole ledger.
    const closingLabel = customer.mobile
      ? `Closing balance — ${customer.name || '—'} (${customer.mobile})`
      : `Closing balance — ${customer.name || '—'}`;
    rows.push([{
      content: closingLabel,
      colSpan: 5,
      styles: { fontStyle: 'bold', halign: 'right', fillColor: [241, 245, 249] },
    }, {
      content: fmtInr(running),
      styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249] },
    }, {
      content: '',
      styles: { fillColor: [241, 245, 249] },
    }]);
  }

  // 2. Summary
  const outstanding = totalGiven - totalReceived;
  const summaryItems: SummaryItem[] = [
    { label: 'Total Credit Given', value: fmtInr(totalGiven), tone: 'negative' },
    { label: 'Payments Received', value: fmtInr(totalReceived), tone: 'positive' },
    { label: 'Net Outstanding', value: fmtInr(outstanding), tone: outstanding > 0 ? 'negative' : 'positive' },
    { label: 'Customers', value: String(sortedCustomers.filter(c => (c.transactions || []).length > 0).length) },
  ];
  y = renderSummaryBox(doc, y, summaryItems);

  // 3. Ledger table
  y = renderSectionTitle(doc, y, 'Transaction Ledger');
  if (rows.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text('No transactions in the selected period.', 20, y + 8);
    y += 20;
  } else {
    autoTable(doc, {
      startY: y,
      head: [['Date', 'Customer', 'Type', 'Credit (Dr)', 'Payment (Cr)', 'Balance', 'Note']],
      body: rows,
      ...PROFESSIONAL_TABLE_STYLES,
      styles: { ...PROFESSIONAL_TABLE_STYLES.styles, fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 22 },
        3: { cellWidth: 22, halign: 'right' },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 22, halign: 'right' },
      },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 12;
  }

  // 4. Signature block + footer
  y = ensureRoom(doc, y, 28);
  renderSignatureBlock(doc, y);
  renderProfessionalFooter(doc, 'This statement is generated from Vyapar Sarthi and is for record-keeping purposes.');

  const filename = `Udhar_Khata_${new Date().toISOString().split('T')[0]}.pdf`;
  const blob: Blob = doc.output('blob');
  if (await saveOrShareBlob(blob, filename)) return;
  doc.save(filename);
}
