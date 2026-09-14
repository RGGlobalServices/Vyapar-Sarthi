export interface DailyStockRegisterHistoryEntry {
  type: 'receive' | 'close';
  quantity: number;
  note: string | null;
  at: string;
}

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
  history?: DailyStockRegisterHistoryEntry[];
}

// Pulls a pack-size like "650ml" or "1L" out of a product name, normalised to
// "650 ML" / "1000 ML". Liquor shops track each pack size as its own Product
// (e.g. "Kingfisher Strong 650ml" and "... 500ml" are two separate rows), so
// this is the only way to reconstruct the paper register's per-size sections
// (see the physical "A to Z Beer & Wine Shopee" register this mirrors, which
// groups every brand under a "BEER 650 ML" band, then again under "BEER 500 ML").
function extractVolumeLabel(name: string | null): string | null {
  if (!name) return null;
  const ml = name.match(/(\d+(?:\.\d+)?)\s*ml\b/i);
  if (ml) return `${ml[1]} ML`;
  const l = name.match(/(\d+(?:\.\d+)?)\s*l\b/i);
  if (l) return `${(parseFloat(l[1]) * 1000).toString()} ML`;
  return null;
}

/**
 * Groups rows into printable sections. Liquor shops split by Category + pack
 * size (matching the physical register's "BEER 650 ML" / "BEER 500 ML" bands);
 * every other business type just groups by Category, since they don't carry
 * a per-item volume dimension.
 */
export function groupDailyStockRegisterRows(rows: DailyStockRegisterRow[], isLiquor: boolean): { label: string; rows: DailyStockRegisterRow[] }[] {
  // Two-level grouping so same-category sections stay adjacent even when the
  // input rows arrive interleaved (e.g. alphabetical by product name mixes
  // Beer/Whisky/etc. together): cluster by category in first-seen order,
  // then split each cluster into volume bands ordered largest-first (650
  // before 500), matching the reference register.
  const categoryOrder: string[] = [];
  const byCategory = new Map<string, Map<string, DailyStockRegisterRow[]>>();
  for (const r of rows) {
    const category = (r.category || 'Other').trim() || 'Other';
    const volume = isLiquor ? extractVolumeLabel(r.name) : null;
    if (!byCategory.has(category)) { byCategory.set(category, new Map()); categoryOrder.push(category); }
    const volumeMap = byCategory.get(category)!;
    const volumeKey = volume || '';
    if (!volumeMap.has(volumeKey)) volumeMap.set(volumeKey, []);
    volumeMap.get(volumeKey)!.push(r);
  }

  const result: { label: string; rows: DailyStockRegisterRow[] }[] = [];
  for (const category of categoryOrder) {
    const volumeMap = byCategory.get(category)!;
    const volumeKeys = [...volumeMap.keys()].sort((a, b) => {
      if (!a && !b) return 0;
      if (!a) return 1;  // no-volume rows last within the category
      if (!b) return -1;
      return parseFloat(b) - parseFloat(a);
    });
    for (const volumeKey of volumeKeys) {
      const label = volumeKey ? `${category.toUpperCase()} ${volumeKey}` : category.toUpperCase();
      result.push({ label, rows: volumeMap.get(volumeKey)! });
    }
  }
  return result;
}

export async function exportDailyStockRegisterPDF(
  rows: DailyStockRegisterRow[],
  shopName: string,
  dateLabel: string,
  businessType?: string
) {
  // Dynamically import to avoid Webpack 5 client-bundle chunking issues.
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const { embedDevanagariFont, smartFont } = await import('./professionalTemplate');
  const { getBusinessConfig } = await import('../businessConfig');

  const isLiquor = !!getBusinessConfig(businessType as any)?.hasLiquorSpecs;
  const itemLabel = isLiquor ? 'Brand' : 'Product';

  const doc = new jsPDF() as any;
  await embedDevanagariFont(doc);

  doc.setFont(smartFont(shopName), 'bold');
  doc.setFontSize(16);
  doc.setTextColor(16, 185, 129);
  doc.text('Daily Stock Register', 14, 20);

  doc.setFont(smartFont(shopName), 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Shop: ${shopName || 'Vyapar Sarthi'}`, 14, 28);
  doc.text(`Date: ${dateLabel}`, 14, 34);
  doc.text(`Generated On: ${new Date().toLocaleString('en-IN')}`, 14, 40);

  // Rate | Brand/Product | Opening | Receive | Total | Close | Sale | Cash —
  // same physical order as the paper register, with Cash (Sale x Rate) added
  // for end-of-day cash reconciliation, which the on-screen editable table
  // (product-first, no Cash column — that one's for data entry, not print)
  // doesn't need.
  const body: any[] = [];
  for (const group of groupDailyStockRegisterRows(rows, isLiquor)) {
    body.push([{ content: group.label, colSpan: 8, styles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'left' } }]);
    for (const r of group.rows) {
      const cash = (r.sold != null && r.rate != null) ? r.sold * r.rate : null;
      body.push([
        r.rate != null ? r.rate.toFixed(2) : '-',
        r.name || '',
        String(r.opening),
        String(r.received),
        String(r.total),
        r.closing != null ? String(r.closing) : '-',
        r.sold != null ? String(r.sold) : '-',
        cash != null ? cash.toFixed(2) : '-',
      ]);
    }
  }

  autoTable(doc, {
    startY: 46,
    head: [['Rate (Rs)', itemLabel, 'Opening', 'Receive', 'Total', 'Close', 'Sale', 'Cash (Rs)']],
    body,
    theme: 'grid',
    styles: { fontSize: 8, font: 'NotoDevanagari' },
    headStyles: { fillColor: [16, 185, 129] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' },
    },
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
