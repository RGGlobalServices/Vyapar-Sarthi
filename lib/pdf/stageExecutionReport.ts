import {
  PDF_LAYOUT,
  renderProfessionalHeader,
  renderSectionTitle,
  embedDevanagariFont,
  type ShopHeader,
} from './professionalTemplate';
import type { StageReportData } from '@/lib/server/stageReportService';

const fmtISO = (iso: string | null | undefined): string => {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
};

const toTitleCase = (s: string): string =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '-';

export async function exportStageExecutionReportPDF(
  reportData: StageReportData
): Promise<Uint8Array> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ orientation: 'portrait' }) as any;
  await embedDevanagariFont(doc);

  const shopHeader: ShopHeader = {
    name: reportData.shop.name,
    mobile: reportData.shop.phone,
    address: reportData.shop.address,
    gst: reportData.shop.gstin,
  };

  const _now = new Date();
  const currentDate = `${String(_now.getDate()).padStart(2,'0')}-${String(_now.getMonth()+1).padStart(2,'0')}-${_now.getFullYear()}`;

  let y = renderProfessionalHeader(doc, shopHeader, 'Stage Execution Report', currentDate, {
    periodLabel: 'Date',
  });

  const L = PDF_LAYOUT.marginX;
  const R = doc.internal.pageSize.getWidth() - PDF_LAYOUT.marginX;
  const colWidth = (R - L) / 2;

  // Use helvetica throughout — Devanagari font corrupts ASCII with char spacing
  const field = (label: string, value: string, x: number, fy: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_LAYOUT.muted);
    doc.text(label.toUpperCase(), x, fy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...PDF_LAYOUT.ink);
    doc.text(value || '-', x, fy + 5);
  };

  // 1. Batch & Stage Overview Box — 5 rows (row height ~10 each)
  const rowH = 11;
  const boxH = rowH * 5 + 4;
  doc.setDrawColor(...PDF_LAYOUT.divider);
  doc.setLineWidth(0.3);
  doc.rect(L, y, R - L, boxH);
  doc.line(L + colWidth, y, L + colWidth, y + boxH);

  const r = (n: number) => y + 7 + n * rowH;

  field('Batch Number', reportData.batch.batchNumber, L + 4, r(0));
  field('Product', reportData.batch.productName || 'N/A', L + colWidth + 4, r(0));

  field(
    'Workflow / Version',
    reportData.batch.workflowName
      ? `${reportData.batch.workflowName} (v${reportData.batch.workflowVersionNumber || 1})`
      : 'Standard',
    L + 4,
    r(1)
  );
  field('Stage Name (Seq)', `${reportData.stage.stageName} (Seq ${reportData.stage.sequence})`, L + colWidth + 4, r(1));

  field('Status', toTitleCase(reportData.stage.status), L + 4, r(2));
  field('Operator', reportData.stage.operatorName || 'N/A', L + colWidth + 4, r(2));

  field('Start Time', fmtISO(reportData.stage.startedAt), L + 4, r(3));
  field('End Time', fmtISO(reportData.stage.completedAt), L + colWidth + 4, r(3));

  field(
    'Duration',
    reportData.stage.durationMinutes ? `${reportData.stage.durationMinutes} mins` : 'In Progress',
    L + 4,
    r(4)
  );
  field(
    'Machine',
    reportData.stage.machineName || 'N/A',
    L + colWidth + 4,
    r(4)
  );

  y += boxH + 10;

  // 2. Dynamic Execution Details
  if (reportData.executionFields.length > 0) {
    y = renderSectionTitle(doc, y, 'Execution Details (Snapshot)');

    const fmtExecValue = (f: { fieldType: string; actualValue: any; unit?: string | null }): string => {
      const v = f.actualValue;
      if (v === null || v === undefined) return '-';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      // Format ISO timestamps that weren't already resolved
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtISO(v);
      return s + (f.unit ? ` ${f.unit}` : '');
    };

    const execBody = reportData.executionFields.map((f, i) => [
      String(i + 1),
      f.section || 'General',
      f.fieldName,
      fmtExecValue(f),
    ]);

    autoTable(doc, {
      startY: y,
      head: [['#', 'Section', 'Field Name', 'Value']],
      body: execBody,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 9,
        cellPadding: 3,
        textColor: PDF_LAYOUT.ink as any,
        lineColor: PDF_LAYOUT.divider as any,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [79, 70, 229] as any,
        textColor: [255, 255, 255] as any,
        fontStyle: 'bold',
        fontSize: 9,
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 38 },
        2: { cellWidth: 60 },
        3: { halign: 'left' },
      },
      margin: { left: L, right: PDF_LAYOUT.marginX },
      rowPageBreak: 'avoid',
    });

    y = ((doc as any).lastAutoTable?.finalY ?? y + 20) + 8;
  }

  // 3. Material Inputs
  if (reportData.inputs.length > 0) {
    y = renderSectionTitle(doc, y, 'Material Inputs');

    autoTable(doc, {
      startY: y,
      head: [['#', 'Input Product', 'Type', 'Source Lot', 'Quantity', 'Unit']],
      body: reportData.inputs.map((i, idx) => [
        String(idx + 1),
        i.productName,
        i.inputType,
        i.sourceLotNumber || '-',
        String(i.quantity),
        i.unit,
      ]),
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 9,
        cellPadding: 2.5,
        textColor: PDF_LAYOUT.ink as any,
        lineColor: PDF_LAYOUT.divider as any,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: PDF_LAYOUT.accent as any,
        textColor: [255, 255, 255] as any,
        fontStyle: 'bold',
        fontSize: 9,
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        4: { halign: 'right', cellWidth: 25 },
        5: { cellWidth: 20 },
      },
      margin: { left: L, right: PDF_LAYOUT.marginX },
      rowPageBreak: 'avoid',
    });

    y = ((doc as any).lastAutoTable?.finalY ?? y + 20) + 8;
  }

  // 4. Material Outputs
  if (reportData.outputs.length > 0) {
    y = renderSectionTitle(doc, y, 'Material Outputs');

    autoTable(doc, {
      startY: y,
      head: [['#', 'Output Product', 'Output Type', 'WIP Lot Number', 'Quantity', 'Unit']],
      body: reportData.outputs.map((o, idx) => [
        String(idx + 1),
        o.productName,
        o.outputType,
        o.wipLotNumber || '-',
        String(o.quantity),
        o.unit,
      ]),
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 9,
        cellPadding: 2.5,
        textColor: PDF_LAYOUT.ink as any,
        lineColor: PDF_LAYOUT.divider as any,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [16, 185, 129] as any,
        textColor: [255, 255, 255] as any,
        fontStyle: 'bold',
        fontSize: 9,
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        3: { halign: 'right', cellWidth: 30 },
        4: { cellWidth: 25 },
      },
      margin: { left: L, right: PDF_LAYOUT.marginX },
      rowPageBreak: 'avoid',
    });

    y = ((doc as any).lastAutoTable?.finalY ?? y + 20) + 8;
  }

  // 5. Quality Parameters
  y = renderSectionTitle(doc, y, 'Quality Parameters');
  if (reportData.quality.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['#', 'Parameter', 'Target', 'Min', 'Max', 'Actual', 'Result']],
      body: reportData.quality.map((q, idx) => [
        String(idx + 1),
        q.parameterName + (q.isCritical ? ' (Critical)' : ''),
        q.targetValue || '-',
        q.minValue !== null ? String(q.minValue) : '*',
        q.maxValue !== null ? String(q.maxValue) : '*',
        q.actualValue || '-',
        q.result,
      ]),
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 9,
        cellPadding: 2.5,
        textColor: PDF_LAYOUT.ink as any,
        lineColor: PDF_LAYOUT.divider as any,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [217, 119, 6] as any,
        textColor: [255, 255, 255] as any,
        fontStyle: 'bold',
        fontSize: 9,
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        6: { halign: 'center', fontStyle: 'bold' },
      },
      margin: { left: L, right: PDF_LAYOUT.marginX },
      rowPageBreak: 'avoid',
    });

    y = ((doc as any).lastAutoTable?.finalY ?? y + 20) + 8;
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...PDF_LAYOUT.muted);
    doc.text('No quality parameters recorded for this stage.', L, y + 4);
    y += 10;
  }

  // 6. Mass Balance & Yield Analytics Summary Box
  y = renderSectionTitle(doc, y, 'Mass Balance & Yield Analytics');

  const analyticsH = 26;
  doc.setDrawColor(...PDF_LAYOUT.divider);
  doc.setLineWidth(0.3);
  doc.rect(L, y, R - L, analyticsH);
  doc.line(L + colWidth, y, L + colWidth, y + analyticsH);

  field('Total Input', `${reportData.balance.totalInputKg} Kg`, L + 4, y + 6);
  field('Total Output', `${reportData.balance.totalOutputKg} Kg`, L + colWidth + 4, y + 6);

  field('Wastage / Loss', `${reportData.balance.wastageKg} Kg`, L + 4, y + 15);
  field(
    'Mass Balance Status',
    `${reportData.balance.balanceStatus} (Diff: ${reportData.balance.differenceKg.toFixed(2)} Kg)`,
    L + colWidth + 4,
    y + 15
  );

  field(
    'Yield %',
    reportData.analytics.yieldPercent !== null ? `${reportData.analytics.yieldPercent}%` : 'N/A',
    L + 4,
    y + 24
  );
  field(
    'Recovery %',
    reportData.analytics.recoveryPercent !== null ? `${reportData.analytics.recoveryPercent}%` : 'N/A',
    L + colWidth + 4,
    y + 24
  );

  y += analyticsH + 10;

  // Notes
  if (reportData.stage.notes) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...PDF_LAYOUT.muted);
    doc.text('Notes:', L, y);
    doc.setTextColor(...PDF_LAYOUT.ink);
    const wrapped = doc.splitTextToSize(reportData.stage.notes, R - L - 20);
    doc.text(wrapped, L + 15, y);
  }

  const arrayBuffer = doc.output('arraybuffer');
  return new Uint8Array(arrayBuffer);
}
