import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query, ApiError } from '@/lib/server/http';
import { isMillBillingPackage } from '@/lib/config/packageConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OUTPUT_LABEL: Record<string, string> = { finished_good: 'Finished good', by_product: 'By-product', rejection: 'Rejection' };
const round2 = (n: number) => Math.round((n || 0) * 100) / 100;

/**
 * GET /api/v1/reports/mill-production — Bada Udyog only. One row per production batch in the date range (by startedAt):
 * raw material consumed, every output (bran/husk/broken/finished/rejections — whatever the batch actually recorded), every
 * operator who worked a stage, and how long the batch took start to finish. Feeds the Reports "Milling" tab's PDF/Excel export
 * — this endpoint only returns rows; ExportButton does the file generation client-side.
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  if (!isMillBillingPackage(shop.packageType)) throw new ApiError(400, 'Milling report is a Bada Udyog feature.', 'NOT_MILL_SHOP');
  const q = query(req);
  const from = q.start_date || q.from ? new Date(q.start_date || q.from) : null;
  const to = q.end_date || q.to ? new Date(`${q.end_date || q.to}T23:59:59.999`) : null;

  const batches = await (prisma as any).productionBatch.findMany({
    where: { shopId: shop.id, ...(from || to ? { startedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
    include: {
      rawLot: { select: { id: true, lotNumber: true, product: { select: { name: true, baseUnit: true } } } },
      outputProduct: { select: { name: true } },
      stages: { orderBy: { sequence: 'asc' }, select: { stageName: true, operatorName: true, startedAt: true, completedAt: true, inputKg: true, outputKg: true, wastageKg: true } },
      outputs: { select: { name: true, outputType: true, quantity: true, unit: true, quantityKg: true, outputLotNumber: true } },
    },
    orderBy: { startedAt: 'desc' },
    take: 500,
  });

  const fmtDT = (d: any) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

  const rows = batches.map((b: any) => {
    const inputKg = Number(b.inputKg) || 0;
    const finishedKg = Number(b.outputKg) || 0;
    const branKg = Number(b.branKg) || 0;
    const huskKg = Number(b.huskKg) || 0;
    const brokenKg = Number(b.brokenKg) || 0;
    const wastageKg = Number(b.wastageKg) || 0;
    const operators = [...new Set((b.stages || []).map((s: any) => s.operatorName).filter(Boolean))];
    const started = b.startedAt ? new Date(b.startedAt) : null;
    const closed = b.closedAt ? new Date(b.closedAt) : null;
    const processingHours = started && closed ? round2((closed.getTime() - started.getTime()) / 3600000) : null;
    const outputsText = (b.outputs || [])
      .map((o: any) => `${o.name || OUTPUT_LABEL[o.outputType] || o.outputType}: ${o.quantity} ${o.unit}${o.outputLotNumber ? ` (Lot ${o.outputLotNumber})` : ''}`)
      .join('; ') || '—';
    const stagesText = (b.stages || [])
      .map((s: any) => `${s.stageName}${s.operatorName ? ` by ${s.operatorName}` : ''}${s.completedAt ? ` (done)` : ' (open)'}`)
      .join('; ') || '—';
    return {
      batchNumber: b.batchNumber,
      status: b.status,
      rawMaterial: b.rawLot?.product?.name || '—',
      rawLotNumber: b.rawLot?.lotNumber || '—',
      inputKg,
      outputProduct: b.outputProduct?.name || '—',
      finishedKg,
      branKg,
      huskKg,
      brokenKg,
      wastageKg,
      recoveryPct: b.recoveryPct != null ? round2(b.recoveryPct) : (inputKg > 0 ? round2((finishedKg / inputKg) * 100) : null),
      operators: operators.join(', ') || '—',
      stages: stagesText,
      outputs: outputsText,
      startedAt: fmtDT(b.startedAt),
      closedAt: fmtDT(b.closedAt),
      processingHours: processingHours != null ? processingHours : '—',
      processingDays: processingHours != null ? round2(processingHours / 24) : '—',
    };
  });

  const summary = {
    batches: rows.length,
    totalInputKg: round2(rows.reduce((s: number, r: any) => s + r.inputKg, 0)),
    totalFinishedKg: round2(rows.reduce((s: number, r: any) => s + r.finishedKg, 0)),
    totalBranKg: round2(rows.reduce((s: number, r: any) => s + r.branKg, 0)),
    totalHuskKg: round2(rows.reduce((s: number, r: any) => s + r.huskKg, 0)),
    totalBrokenKg: round2(rows.reduce((s: number, r: any) => s + r.brokenKg, 0)),
    totalWastageKg: round2(rows.reduce((s: number, r: any) => s + r.wastageKg, 0)),
  };

  return json({ rows, summary });
});
