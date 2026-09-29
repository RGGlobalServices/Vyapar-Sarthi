import {
  PDF_LAYOUT,
  renderProfessionalHeader,
  renderSectionTitle,
  embedDevanagariFont,
  type ShopHeader,
} from './professionalTemplate';

export async function exportBatchFullReportPDF(reportData: { shop: any; batch: any }): Promise<Uint8Array> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const { shop, batch } = reportData;
  const doc = new jsPDF({ orientation: 'portrait' }) as any;
  await embedDevanagariFont(doc);

  const shopHeader: ShopHeader = {
    name: shop?.name || 'Mill',
    mobile: shop?.mobile || null,
    address: shop?.address || null,
    gst: shop?.gst || null,
  };

  const _now = new Date();
  const currentDate = `${String(_now.getDate()).padStart(2,'0')}-${String(_now.getMonth()+1).padStart(2,'0')}-${_now.getFullYear()}`;
  const L = PDF_LAYOUT.marginX;
  const pageW = doc.internal.pageSize.getWidth();
  const R = pageW - PDF_LAYOUT.marginX;

  let y = renderProfessionalHeader(doc, shopHeader, 'Full Process Report', currentDate, { periodLabel: 'Date' });

  // ── Batch overview box ──────────────────────────────────────────────────────
  const col = (R - L) / 3;
  const boxH = 28;
  doc.setDrawColor(...PDF_LAYOUT.divider);
  doc.setLineWidth(0.3);
  doc.rect(L, y, R - L, boxH);
  doc.line(L + col, y, L + col, y + boxH);
  doc.line(L + col * 2, y, L + col * 2, y + boxH);

  const bf = (label: string, value: string, x: number, fy: number) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...PDF_LAYOUT.muted);
    doc.text(label.toUpperCase(), x, fy);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...PDF_LAYOUT.ink);
    doc.text(value || '—', x, fy + 4.5);
  };

  bf('Batch Number', batch.batchNumber, L + 3, y + 6);
  bf('Product', batch.outputProduct?.name || batch.rawLot?.product?.name || '—', L + col + 3, y + 6);
  const batchStatus = (batch.status || '');
  bf('Status', batchStatus.charAt(0).toUpperCase() + batchStatus.slice(1).toLowerCase(), L + col * 2 + 3, y + 6);

  const _fmtD = (v: string | null | undefined) => { if (!v) return '—'; const d = new Date(v); return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`; };
  const startedStr = _fmtD(batch.startedAt);
  const closedStr = batch.closedAt ? _fmtD(batch.closedAt) : 'In Progress';
  bf('Started', startedStr, L + 3, y + 18);
  bf('Closed / Finalized', closedStr, L + col + 3, y + 18);
  bf('Input (kg)', String(batch.inputKg ?? '—'), L + col * 2 + 3, y + 18);

  y += boxH + 8;

  // ── Raw material / lot info ─────────────────────────────────────────────────
  if (batch.rawLot || (batch.inputLots && batch.inputLots.length > 0)) {
    y = renderSectionTitle(doc, y, 'Raw Material Input');
    const lotRows: any[][] = [];
    if (batch.rawLot) {
      lotRows.push([
        batch.rawLot.lotNumber || '—',
        batch.rawLot.product?.name || '—',
        batch.rawLot.supplier?.name || '—',
        `${batch.inputKg ?? '—'} kg`,
      ]);
    }
    (batch.inputLots || []).forEach((il: any) => {
      if (il.rawMaterialLot) {
        lotRows.push([
          il.rawMaterialLot.lotNumber || '—',
          il.rawMaterialLot.product?.name || '—',
          '—',
          `${il.quantity ?? '—'} kg`,
        ]);
      }
    });

    autoTable(doc, {
      startY: y,
      head: [['Lot Number', 'Product', 'Supplier', 'Input Quantity']],
      body: lotRows,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5, textColor: PDF_LAYOUT.ink as any, lineColor: PDF_LAYOUT.divider as any, lineWidth: 0.2 },
      headStyles: { fillColor: [79, 70, 229] as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 9 },
      margin: { left: L, right: PDF_LAYOUT.marginX },
    });
    y = ((doc as any).lastAutoTable?.finalY ?? y + 20) + 8;
  }

  // ── Stages ──────────────────────────────────────────────────────────────────
  const stages: any[] = batch.stages || [];
  if (stages.length > 0) {
    y = renderSectionTitle(doc, y, 'Processing Stages');

    const stageRows = stages.map((st: any, i: number) => [
      String(i + 1),
      (st.stageName || '').replace(/^\w/, (c: string) => c.toUpperCase()),
      st.completedAt ? 'Completed' : (st.startedAt ? 'In Progress' : 'Pending'),
      st.operatorName || '—',
      `${st.inputKg ?? '—'} kg`,
      `${st.outputKg ?? '—'} kg`,
      `${st.wastageKg ?? '—'} kg`,
      st.completedAt ? _fmtD(st.completedAt) : '—',
    ]);

    autoTable(doc, {
      startY: y,
      head: [['#', 'Stage', 'Status', 'Operator', 'Input (kg)', 'Output (kg)', 'Waste (kg)', 'Completed']],
      body: stageRows,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, textColor: PDF_LAYOUT.ink as any, lineColor: PDF_LAYOUT.divider as any, lineWidth: 0.2 },
      headStyles: { fillColor: [79, 70, 229] as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 8.5 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        2: { cellWidth: 24 },
        4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' },
        7: { cellWidth: 22 },
      },
      margin: { left: L, right: PDF_LAYOUT.marginX },
    });
    y = ((doc as any).lastAutoTable?.finalY ?? y + 20) + 8;

    // ── Per-stage execution details ────────────────────────────────────────────
    for (const st of stages) {
      const exFields: any[] = st.executionFields || [];
      const filled = exFields.filter((f: any) => f.actualValue !== null && f.actualValue !== undefined && f.actualValue !== '');
      if (!filled.length) continue;

      // Check if we need a new page
      if (y > 240) { doc.addPage(); y = 20; }
      y = renderSectionTitle(doc, y, `Stage: ${(st.stageName || '').replace(/^\w/, (c: string) => c.toUpperCase())} — Execution Details`);

      const fmtVal = (f: any): string => {
        const v = f.actualValue;
        if (v === null || v === undefined) return '—';
        const s = String(v);
        // format any ISO timestamp that wasn't resolved at route level
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
          try {
            const d = new Date(v);
            const p = (n: number) => String(n).padStart(2, '0');
            return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}  ${p(d.getHours())}:${p(d.getMinutes())}`;
          } catch { return s; }
        }
        return s + (f.unit ? ` ${f.unit}` : '');
      };

      const execRows = filled.map((f: any) => [
        f.section || 'General',
        f.fieldName,
        fmtVal(f),
      ]);

      autoTable(doc, {
        startY: y,
        head: [['Section', 'Field', 'Value']],
        body: execRows,
        theme: 'striped',
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, textColor: PDF_LAYOUT.ink as any, lineColor: PDF_LAYOUT.divider as any, lineWidth: 0.15 },
        headStyles: { fillColor: [99, 102, 241] as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 8.5 },
        columnStyles: { 0: { cellWidth: 32 }, 1: { cellWidth: 70 } },
        margin: { left: L, right: PDF_LAYOUT.marginX },
        rowPageBreak: 'avoid',
      });
      y = ((doc as any).lastAutoTable?.finalY ?? y + 20) + 6;
    }
  }

  // ── Finished goods lots ─────────────────────────────────────────────────────
  const fgLots: any[] = batch.finishedGoodsLots || [];
  if (fgLots.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    y = renderSectionTitle(doc, y, 'Finished Goods Lots');

    const fgRows = fgLots.map((lot: any) => [
      lot.lotNumber || '—',
      `${lot.quantityKg ?? '—'} kg`,
      lot.godown?.name || '—',
      lot.createdAt ? _fmtD(lot.createdAt) : '—',
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Lot Number', 'Quantity', 'Godown / Location', 'Date']],
      body: fgRows,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5, textColor: PDF_LAYOUT.ink as any, lineColor: PDF_LAYOUT.divider as any, lineWidth: 0.2 },
      headStyles: { fillColor: [16, 185, 129] as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 9 },
      columnStyles: { 1: { halign: 'right' } },
      margin: { left: L, right: PDF_LAYOUT.marginX },
    });
    y = ((doc as any).lastAutoTable?.finalY ?? y + 20) + 8;
  }

  // ── By-products ─────────────────────────────────────────────────────────────
  const byProds: any[] = batch.byProducts || [];
  if (byProds.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    y = renderSectionTitle(doc, y, 'By-Products');

    const bpRows = byProds.map((bp: any) => [
      bp.name || '—',
      `${bp.quantityKg ?? '—'} kg`,
      `${bp.soldKg ?? 0} kg`,
    ]);

    autoTable(doc, {
      startY: y,
      head: [['By-Product', 'Total Quantity', 'Sold']],
      body: bpRows,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5, textColor: PDF_LAYOUT.ink as any, lineColor: PDF_LAYOUT.divider as any, lineWidth: 0.2 },
      headStyles: { fillColor: [245, 158, 11] as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 9 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      margin: { left: L, right: PDF_LAYOUT.marginX },
    });
    y = ((doc as any).lastAutoTable?.finalY ?? y + 20) + 8;
  }

  // ── Quality Test Results ─────────────────────────────────────────────────────
  const qualityTests: any[] = batch.qualityTests || [];
  if (qualityTests.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    y = renderSectionTitle(doc, y, 'Quality Test Results');

    const FLAG_LABEL: Record<string, string> = { green: 'Green ✓', amber: 'Amber ⚠', red: 'Red ✗' };
    const DECISION_LABEL: Record<string, string> = { accepted: 'Accepted', rejected: 'Rejected', pending: 'Pending' };
    const fmtPct = (v: any) => (v != null ? `${Number(v).toFixed(2)}%` : '—');

    const qtRows = qualityTests.map((qt: any) => [
      qt.testDate ? _fmtD(qt.testDate) : '—',
      qt.testedBy || '—',
      fmtPct(qt.moisturePct),
      fmtPct(qt.foreignMatterPct),
      fmtPct(qt.brokenPct),
      fmtPct(qt.damagedPct),
      qt.flag ? (FLAG_LABEL[qt.flag] ?? qt.flag) : '—',
      qt.decision ? (DECISION_LABEL[qt.decision] ?? qt.decision) : '—',
      qt.notes || '—',
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Date', 'Tested By', 'Moisture %', 'Foreign Matter %', 'Broken %', 'Damaged %', 'Flag', 'Decision', 'Notes']],
      body: qtRows,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, textColor: PDF_LAYOUT.ink as any, lineColor: PDF_LAYOUT.divider as any, lineWidth: 0.2 },
      headStyles: { fillColor: [139, 92, 246] as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      margin: { left: L, right: PDF_LAYOUT.marginX },
    });
    y = ((doc as any).lastAutoTable?.finalY ?? y + 20) + 8;
  }

  // ── Mass balance summary ─────────────────────────────────────────────────────
  if (y > 230) { doc.addPage(); y = 20; }
  y = renderSectionTitle(doc, y, 'Mass Balance Summary');

  const inputKg = Number(batch.inputKg || 0);
  const outputKg = Number(batch.outputKg || 0);
  const totalFgKg = fgLots.reduce((s: number, l: any) => s + Number(l.quantityKg || 0), 0);
  const totalBpKg = byProds.reduce((s: number, b: any) => s + Number(b.quantityKg || 0), 0);
  const lossKg = Math.max(0, inputKg - outputKg);
  const yieldPct = inputKg > 0 ? ((outputKg / inputKg) * 100).toFixed(2) : '—';

  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['Total Input (Raw Material)', `${inputKg.toLocaleString('en-IN')} kg`],
      ['Total Output (Finished Goods)', `${(outputKg || totalFgKg).toLocaleString('en-IN')} kg`],
      ['Finished Goods Lots', `${totalFgKg.toLocaleString('en-IN')} kg`],
      ['By-Products', `${totalBpKg.toLocaleString('en-IN')} kg`],
      ['Loss / Wastage', `${lossKg.toLocaleString('en-IN')} kg`],
      ['Yield %', `${yieldPct}%`],
    ],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, textColor: PDF_LAYOUT.ink as any, lineColor: PDF_LAYOUT.divider as any, lineWidth: 0.2 },
    headStyles: { fillColor: [15, 23, 42] as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
    margin: { left: L, right: PDF_LAYOUT.marginX },
  });

  // ── Footer signature line ────────────────────────────────────────────────────
  const pgH = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...PDF_LAYOUT.muted);
  doc.text(`Generated on ${currentDate} · ${shop?.name || 'Mill'} · Batch ${batch.batchNumber}`, L, pgH - 10);
  doc.text('Authorised Signature: ___________________', R - 60, pgH - 10);

  return doc.output('arraybuffer') as Uint8Array;
}
