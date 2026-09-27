import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';
import { exportBatchFullReportPDF } from '@/lib/pdf/batchFullReport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const url = new URL(req.url);
  const format = url.searchParams.get('format') || 'json';

  const batch = await (prisma as any).productionBatch.findFirst({
    where: { id, shopId: shop.id },
    include: {
      outputProduct: { select: { id: true, name: true } },
      rawLot: {
        include: {
          product: { select: { id: true, name: true } },
          supplier: { select: { name: true } },
        },
      },
      inputLots: {
        include: { rawMaterialLot: { include: { product: { select: { name: true } } } } },
        orderBy: { sequence: 'asc' },
      },
      stages: {
        orderBy: { sequence: 'asc' },
        include: { executionFields: { orderBy: { sequence: 'asc' } } },
      },
      byProducts: true,
      finishedGoodsLots: { include: { godown: { select: { name: true } } } },
    },
  });

  if (!batch) throw new ApiError(404, 'Batch not found');

  const shopData = await prisma.shop.findFirst({
    where: { id: shop.id },
    select: { name: true, mobile: true, address: true, gst: true },
  });

  // Resolve UUID actualValues in execution fields for every stage
  const isUUID = (v: any) =>
    typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

  const fmtIST = (iso: string): string => {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      const p = (n: number) => String(n).padStart(2, '0');
      return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}  ${p(d.getHours())}:${p(d.getMinutes())}`;
    } catch { return iso; }
  };

  const allFields: any[] = (batch.stages || []).flatMap((s: any) => s.executionFields || []);
  const machineIds = [...new Set(allFields.filter((f) => f.fieldType === 'MACHINE' && isUUID(f.actualValue)).map((f) => f.actualValue as string))];
  const productIds = [...new Set(allFields.filter((f) => f.fieldType === 'PRODUCT' && isUUID(f.actualValue)).map((f) => f.actualValue as string))];
  const lotIds     = [...new Set(allFields.filter((f) => f.fieldType === 'LOT'     && isUUID(f.actualValue)).map((f) => f.actualValue as string))];

  const [machines, products, rawLots] = await Promise.all([
    machineIds.length ? prisma.machine.findMany({ where: { id: { in: machineIds } }, select: { id: true, name: true } }) : [],
    productIds.length ? prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } }) : [],
    lotIds.length     ? prisma.rawMaterialLot.findMany({ where: { id: { in: lotIds } }, select: { id: true, lotNumber: true } }) : [],
  ]);

  const machineMap = new Map((machines as any[]).map((m) => [m.id, m.name]));
  const productMap = new Map((products as any[]).map((p) => [p.id, p.name]));
  const lotMap     = new Map((rawLots as any[]).map((l) => [l.id, l.lotNumber || l.id.substring(0, 8)]));

  const resolveValue = (f: any): any => {
    const v = f.actualValue;
    if (v === null || v === undefined || v === '') return v;
    if (f.fieldType === 'MACHINE' && isUUID(v)) return machineMap.get(v) || v;
    if (f.fieldType === 'PRODUCT' && isUUID(v)) return productMap.get(v) || v;
    if (f.fieldType === 'LOT'     && isUUID(v)) return lotMap.get(v) || v;
    if (f.fieldType === 'TIMESTAMP' && typeof v === 'string' && v.includes('T')) return fmtIST(v);
    return v;
  };

  const resolvedBatch = {
    ...batch,
    stages: (batch.stages || []).map((st: any) => ({
      ...st,
      executionFields: (st.executionFields || []).map((f: any) => ({ ...f, actualValue: resolveValue(f) })),
    })),
  };

  const reportData = { shop: shopData, batch: resolvedBatch };

  if (format === 'pdf') {
    const pdfBytes = await exportBatchFullReportPDF(reportData);
    const filename = `Batch_${batch.batchNumber}_Full_Report.pdf`.replace(/[^a-zA-Z0-9_\.-]/g, '_');
    return new Response(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return json(reportData);
});
