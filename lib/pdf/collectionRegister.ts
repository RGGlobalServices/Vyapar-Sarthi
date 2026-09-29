import {
  PDF_LAYOUT,
  renderProfessionalHeader,
  renderProfessionalFooter,
  fmtInr,
  embedDevanagariFont,
  type ShopHeader,
} from './professionalTemplate';

export interface CollectionRegisterParty {
  name: string;
  shopName?: string | null;
  address?: string | null;
  totalDue: number;
}

/** Same "area/route" a shopkeeper writes on the field-collection notebook —
 *  the physical version this PDF is modeled on groups parties by the town/
 *  route name, usually the last word(s) in parentheses after the shop name
 *  ("NAMDEV FOOTWEAR (KALWAN)") since that's how the Udyog party list is
 *  actually named in practice. `address` wins when set (an explicit field
 *  beats guessing from the name); falls back to parsing "(...)" off the
 *  business/owner name; "Other" catches anything with neither. */
function extractArea(p: CollectionRegisterParty): string {
  if (p.address && p.address.trim()) return p.address.trim().toUpperCase();
  const source = p.shopName || p.name || '';
  const m = source.match(/\(([^()]+)\)\s*$/);
  if (m) return m[1].trim().toUpperCase();
  return 'OTHER';
}

/**
 * Collection Register — the printable route sheet a Udyog wholesaler's
 * collection agent carries door-to-door, modeled directly on a real
 * handwritten notebook page (Party / Amt / Cash / Chq / Dis columns,
 * grouped by route/area, totalled at the bottom). Only OUTSTANDING parties
 * are listed — a settled party has nothing to collect, so it's filtered
 * out here (defensively, even though callers are expected to pre-filter)
 * rather than printed as a dead row the agent has to skip over. AMT is
 * pre-filled with each party's current outstanding due — what the agent is
 * there to collect; Cash/Chq/Dis are left blank for the agent to fill in by
 * hand while on the round, then get punched into the app's Record Payment
 * flow afterward. Deliberately a flat generate-and-download, not a
 * persisted "collection sheet" record — same as the pending-bills
 * statement, there's nothing to save because the shopkeeper's own paper
 * copy IS the working record until the payments get entered.
 */
export async function generateCollectionRegisterPDF({
  shop,
  parties,
  filename = 'collection-register',
}: {
  shop: ShopHeader;
  parties: CollectionRegisterParty[];
  filename?: string;
}) {
  const [{ default: jsPDF }, { default: autoTable }, { saveOrShareBlob }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/lib/nativeSave'),
  ]);

  const outstanding = parties.filter(p => (Number(p.totalDue) || 0) > 0);

  const doc = new jsPDF({ orientation: 'portrait' }) as any;
  await embedDevanagariFont(doc);
  const today = new Date();
  const dateLabel = `${String(today.getDate()).padStart(2,'0')}-${String(today.getMonth()+1).padStart(2,'0')}-${today.getFullYear()}`;
  const dayLabel = today.toLocaleDateString('en-IN', { weekday: 'long' }).toUpperCase();

  let y = renderProfessionalHeader(doc, shop, 'Collection Register (Outstanding)', `${dateLabel} · ${dayLabel}`, {
    periodLabel: 'Round Date',
  });

  // Group by area, areas sorted alphabetically, parties within an area
  // sorted by name — matches the tidy top-to-bottom order a real route
  // sheet is written in, rather than raw database order.
  const byArea = new Map<string, CollectionRegisterParty[]>();
  for (const p of outstanding) {
    const area = extractArea(p);
    if (!byArea.has(area)) byArea.set(area, []);
    byArea.get(area)!.push(p);
  }
  const areas = Array.from(byArea.keys()).sort((a, b) => a.localeCompare(b));

  const rows: any[] = [];
  let grandTotal = 0;

  for (const area of areas) {
    const group = [...byArea.get(area)!].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    rows.push([
      { content: area, colSpan: 5, styles: { fontStyle: 'bold', fillColor: PDF_LAYOUT.accentSoft as any, textColor: PDF_LAYOUT.accent as any } },
    ]);
    for (const p of group) {
      const due = Number(p.totalDue) || 0;
      grandTotal += due;
      rows.push([
        p.shopName ? `${p.shopName}\n${p.name}` : p.name,
        { content: fmtInr(due), styles: { halign: 'right' } },
        '', // Cash — blank, filled by hand on the round
        '', // Cheque — blank, filled by hand on the round
        '', // Discount — blank, filled by hand on the round
      ]);
    }
  }

  if (outstanding.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text('No outstanding parties to collect from.', PDF_LAYOUT.marginX, y + 8);
  } else {
    rows.push([
      { content: 'TOTAL', styles: { fontStyle: 'bold', fillColor: PDF_LAYOUT.accentSoft as any } },
      { content: fmtInr(grandTotal), styles: { fontStyle: 'bold', halign: 'right', fillColor: PDF_LAYOUT.accentSoft as any } },
      { content: '', styles: { fillColor: PDF_LAYOUT.accentSoft as any } },
      { content: '', styles: { fillColor: PDF_LAYOUT.accentSoft as any } },
      { content: '', styles: { fillColor: PDF_LAYOUT.accentSoft as any } },
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Party', 'Amt (Due)', 'Cash', 'Chq', 'Dis']],
      body: rows,
      theme: 'grid',
      styles: { font: 'NotoDevanagari', fontSize: 9, cellPadding: 2.5, textColor: PDF_LAYOUT.ink as any, lineColor: PDF_LAYOUT.divider as any, lineWidth: 0.15 },
      headStyles: { fillColor: PDF_LAYOUT.accent as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 66 },
        1: { cellWidth: 28 },
        2: { cellWidth: 28 },
        3: { cellWidth: 28 },
        4: { cellWidth: 28 },
      },
      margin: { left: PDF_LAYOUT.marginX, right: PDF_LAYOUT.marginX },
      rowPageBreak: 'avoid',
    });
  }

  renderProfessionalFooter(doc, `Collection round sheet for ${dateLabel}`);

  const name = `${filename}_${today.toISOString().split('T')[0]}.pdf`;
  const blob: Blob = doc.output('blob');
  if (await saveOrShareBlob(blob, name)) return;
  doc.save(name);
}
