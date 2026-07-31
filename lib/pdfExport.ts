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
  PDF_LAYOUT,
  type ShopHeader,
  type SummaryItem,
} from '@/lib/pdf/professionalTemplate';

/**
 * Business Performance Report — CA-grade PDF.
 *
 * Rewritten on top of lib/pdf/professionalTemplate.ts so the output is
 * visually consistent with the other financial statements a shopkeeper hands
 * to their accountant (udhar khata, ledger, GST register…). Sections render
 * in a fixed order so year-on-year comparisons look the same:
 *   1. Header  (letterhead: shop, address, GSTIN, PAN, mobile, email)
 *   2. Summary (Revenue / Profit / Margin / Bills — the tax-relevant KPIs)
 *   3. Sales & Profit Trend table
 *   4. Top Selling Products table
 *   5. Category Performance table
 *   6. Signature block (Prepared / Verified / Authorized Signatory)
 *   7. Footer   (page N of M + generation timestamp on every page)
 */
export async function exportReportPDF({
  shop,
  shopName,
  dateRange,
  summary,
  trendData,
  topProducts,
  categories,
}: {
  /** Full shop details for the letterhead. Prefer this over shopName. */
  shop?: ShopHeader;
  /** Fallback if `shop` isn't supplied — keeps old callsites working. */
  shopName?: string;
  dateRange: string;
  summary?: { revenue?: number; profit?: number; margin?: number; count?: number; outstanding?: number };
  trendData: any[];
  topProducts: any[];
  categories: any[];
}) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF() as any;
  const shopHeader: ShopHeader = shop || { name: shopName || 'Vyapar Sarthi' };

  // 1. Header
  let y = renderProfessionalHeader(doc, shopHeader, 'Business Performance Report', dateRange);

  // 2. Summary KPI box — only when the caller has the numbers. Total Sales
  // and Gross Profit are the two figures a CA reaches for first.
  if (summary) {
    const items: SummaryItem[] = [
      { label: 'Total Sales', value: fmtInr(summary.revenue), tone: 'positive' },
      { label: 'Gross Profit', value: fmtInr(summary.profit), tone: 'positive' },
      { label: 'Profit Margin', value: `${(summary.margin ?? 0).toFixed(1)}%` },
      { label: 'Bills', value: String(summary.count ?? 0) },
    ];
    if ((summary.outstanding ?? 0) > 0) {
      items.push({ label: 'Outstanding', value: fmtInr(summary.outstanding), tone: 'negative' });
    }
    y = renderSummaryBox(doc, y, items);
  }

  // 3. Sales & Profit Trend
  if (trendData?.length) {
    y = ensureRoom(doc, y, 40);
    y = renderSectionTitle(doc, y, 'Sales & Profit Trend');
    autoTable(doc, {
      startY: y,
      head: [['Date', 'Sales', 'Profit']],
      body: trendData.map((d: any) => [
        d.fullDate || d.date || '',
        { content: fmtInr(d.sales ?? d.revenue), styles: { halign: 'right' } },
        { content: fmtInr(d.profit), styles: { halign: 'right' } },
      ]),
      ...PROFESSIONAL_TABLE_STYLES,
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 8;
  }

  // 4. Top Selling Products
  if (topProducts?.length) {
    y = ensureRoom(doc, y, 40);
    y = renderSectionTitle(doc, y, 'Top Selling Products');
    autoTable(doc, {
      startY: y,
      head: [['#', 'Product', 'Category', 'Revenue', 'Qty']],
      body: topProducts.map((p: any, i: number) => [
        String(i + 1),
        p.name || '',
        p.category || '',
        { content: fmtInr(p.value ?? p.revenue), styles: { halign: 'right' } },
        { content: String(p.qty ?? 0), styles: { halign: 'right' } },
      ]),
      ...PROFESSIONAL_TABLE_STYLES,
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 8;
  }

  // 5. Category Performance
  if (categories?.length) {
    y = ensureRoom(doc, y, 40);
    y = renderSectionTitle(doc, y, 'Category Performance');
    autoTable(doc, {
      startY: y,
      head: [['Category', 'Revenue', 'Qty', 'Share %']],
      body: categories.map((c: any) => [
        c.name || c.category || '',
        { content: fmtInr(c.value ?? c.revenue), styles: { halign: 'right' } },
        { content: String(c.qty ?? 0), styles: { halign: 'right' } },
        { content: `${c.percentage ?? 0}%`, styles: { halign: 'right' } },
      ]),
      ...PROFESSIONAL_TABLE_STYLES,
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 12;
  }

  // 6. Signature block — always sits at least 28 mm above the footer, moves
  // to a fresh page if there's no room. This is what the CA actually stamps.
  y = ensureRoom(doc, y, 28);
  renderSignatureBlock(doc, y);

  // 7. Footer — walks every page.
  renderProfessionalFooter(doc, 'This statement is generated from Vyapar Sarthi and is for record-keeping purposes.');

  const filename = `Business_Report_${new Date().toISOString().split('T')[0]}.pdf`;
  const blob: Blob = doc.output('blob');
  if (await saveOrShareBlob(blob, filename)) return;
  doc.save(filename);
}
