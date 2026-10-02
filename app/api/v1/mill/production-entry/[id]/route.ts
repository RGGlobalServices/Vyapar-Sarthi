import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { isMillBillingPackage } from '@/lib/config/packageConfig';
import { createQuickEntry } from '@/lib/server/quickProduction';
import { reverseProductionTx } from '@/lib/server/productionReverse';
import { recordAuditEvents } from '@/lib/server/productionWrites';
import { jobWorkLinkColumn } from '@/lib/server/jobWorkLink';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

async function millShop(req: Request) {
  const { shop } = await requireShop(req);
  if (!isMillBillingPackage((shop as any).packageType)) throw new ApiError(403, 'Editing production runs is a Bada Udyog feature.', 'NOT_MILL_SHOP');
  return shop;
}

/**
 * GET    /api/v1/mill/production-entry/[id] — a finished run as the Quick Production form fills it (to edit it)
 * PATCH  /api/v1/mill/production-entry/[id] — fix the details that change no stock: date, operator, machine, notes
 * POST   /api/v1/mill/production-entry/[id] — Edit with changes: same body as the Quick entry; the old run is undone and the corrected one
 *                                             booked in ONE transaction (nothing changes if any rule fails). Keeps the batch number.
 * DELETE /api/v1/mill/production-entry/[id] — undo the run: material back to its lot, outputs removed. Refused if the output was already used.
 */
export const GET = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const shop = await millShop(req);
  const b = await (prisma as any).productionBatch.findFirst({
    where: { id, shopId: shop.id },
    include: {
      outputs: { orderBy: { createdAt: 'asc' } },
      stages: { orderBy: { sequence: 'asc' } },
      inputLots: { orderBy: { sequence: 'asc' }, include: { rawMaterialLot: { select: { id: true, lotNumber: true, remainingQuantity: true, productId: true, product: { select: { name: true } } } } } },
    },
  });
  if (!b) throw new ApiError(404, 'Production run not found', 'BATCH_NOT_FOUND');
  if (b.status !== 'closed') throw new ApiError(409, 'Only a finished run can be edited here.', 'BATCH_NOT_CLOSED');

  const direct = b.stages.length === 1 && b.stages[0].stageName === 'Production';
  const stage = b.stages[0] || null;
  const notes = String(b.notes || '');
  let source: any = null;
  if (b.batchType === 'JOB_WORK') {
    let orderId: string | null = null;
    if (await jobWorkLinkColumn()) {
      const r: any[] = await prisma.$queryRawUnsafe(`SELECT job_work_order_id::text AS id FROM production_batches WHERE id = $1::uuid`, id);
      orderId = r[0]?.id ?? null;
    }
    if (!orderId) {
      const m = notes.match(/^Job Work: (\S+)/);
      if (m) orderId = (await (prisma as any).jobWorkOrder.findFirst({ where: { shopId: shop.id, orderNumber: m[1] }, select: { id: true } }))?.id ?? null;
    }
    source = { type: 'job_work', id: orderId };
  } else if (b.batchType === 'REPROCESSING') {
    source = { type: 'rejection', id: b.rejectionLotId };
  } else if (/^WIP lot /i.test(notes)) {
    const lotNo = notes.slice('WIP lot '.length).split(' · ')[0].trim();
    const w = await (prisma as any).wipLot.findFirst({ where: { shopId: shop.id, lotNumber: lotNo }, select: { id: true } });
    source = { type: 'wip', id: w?.id ?? null };
  } else {
    const lots = (b.inputLots || []).filter((l: any) => l.rawMaterialLotId).map((l: any) => ({
      id: l.rawMaterialLotId, kg: Number(l.quantity) || 0, lotNumber: l.rawMaterialLot?.lotNumber || null, productId: l.rawMaterialLot?.productId || null,
      productName: l.rawMaterialLot?.product?.name || '', remainingNow: Number(l.rawMaterialLot?.remainingQuantity) || 0,
    }));
    if (!lots.length && b.rawLotId) {
      const l = await (prisma as any).rawMaterialLot.findFirst({ where: { id: b.rawLotId, shopId: shop.id }, select: { id: true, lotNumber: true, remainingQuantity: true, productId: true, product: { select: { name: true } } } });
      if (l) lots.push({ id: l.id, kg: Number(b.inputKg) || 0, lotNumber: l.lotNumber, productId: l.productId, productName: l.product?.name || '', remainingNow: Number(l.remainingQuantity) || 0 });
    }
    source = { type: 'raw_lot', lots };
  }

  return json({
    id: b.id, batchNumber: b.batchNumber, direct, source, inputKg: Number(b.inputKg) || 0, lossKg: Number(stage?.wastageKg ?? b.wastageKg) || 0,
    operatorName: stage?.operatorName || '', machineId: stage?.machineId || '', notes: stage?.notes || '', startedAt: b.startedAt,
    outputs: (b.outputs || []).map((o: any) => ({
      outputType: o.outputType, productId: o.productId || '', name: o.name || '', quantity: Number(o.quantity) || 0, unit: o.unit || 'kg',
      outputLotNumber: o.outputLotNumber || '', notes: o.notes || '',
    })),
  });
});

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const shop = await millShop(req);
  const body = await readBody<any>(req);
  const b: any[] = await prisma.$queryRawUnsafe(`SELECT status, notes FROM production_batches WHERE id = $1::uuid AND shop_id = $2::uuid`, id, shop.id);
  if (!b[0]) throw new ApiError(404, 'Production run not found', 'BATCH_NOT_FOUND');
  if (b[0].status !== 'closed') throw new ApiError(409, 'Only a finished run can be edited here.', 'BATCH_NOT_CLOSED');
  const st: any[] = await prisma.$queryRawUnsafe(`SELECT id::text AS id, notes FROM batch_stages WHERE batch_id = $1::uuid ORDER BY sequence ASC LIMIT 1`, id);

  const startedAt = body.startedAt ? new Date(body.startedAt) : null;
  if (startedAt && isNaN(startedAt.getTime())) throw new ApiError(400, 'Invalid date.', 'INVALID_DATE');
  const operator = body.operatorName !== undefined ? (String(body.operatorName ?? '').trim().slice(0, 80) || null) : undefined;
  const newUserNotes = body.notes !== undefined ? (String(body.notes ?? '').trim().slice(0, 200) || null) : undefined;
  let machineId: string | null | undefined;
  if (body.machineId !== undefined) {
    machineId = body.machineId ? String(body.machineId) : null;
    if (machineId) {
      const m = await (prisma as any).machine.findFirst({ where: { id: machineId, shopId: shop.id }, select: { id: true } });
      if (!m) throw new ApiError(404, 'Machine not found for this shop', 'MACHINE_NOT_FOUND');
    }
  }

  // batch notes = "<where the material came from> · <the user's own notes>": only the user's part is replaced
  let batchNotes: string | undefined;
  if (newUserNotes !== undefined) {
    const oldUser = String(st[0]?.notes || '');
    let head = String(b[0].notes || '');
    if (oldUser && head.endsWith(oldUser)) head = head.slice(0, head.length - oldUser.length).replace(/ · $/, '');
    batchNotes = [head, newUserNotes].filter(Boolean).join(' · ').slice(0, 250);
  }

  await prisma.$transaction(async (tx: any) => {
    if (startedAt || batchNotes !== undefined) {
      await tx.$executeRawUnsafe(
        `UPDATE production_batches SET started_at = COALESCE($1::timestamptz, started_at), notes = CASE WHEN $2::boolean THEN $3 ELSE notes END WHERE id = $4::uuid AND shop_id = $5::uuid`,
        startedAt ? startedAt.toISOString() : null, batchNotes !== undefined, batchNotes ?? null, id, shop.id);
    }
    if (st[0] && (operator !== undefined || newUserNotes !== undefined || machineId !== undefined || startedAt)) {
      await tx.$executeRawUnsafe(
        `UPDATE batch_stages SET operator_name = CASE WHEN $1::boolean THEN $2 ELSE operator_name END, notes = CASE WHEN $3::boolean THEN $4 ELSE notes END,
                machine_id = CASE WHEN $5::boolean THEN $6::uuid ELSE machine_id END, started_at = COALESCE($7::timestamptz, started_at) WHERE id = $8::uuid`,
        operator !== undefined, operator ?? null, newUserNotes !== undefined, newUserNotes ?? null, machineId !== undefined, machineId ?? null, startedAt ? startedAt.toISOString() : null, st[0].id);
    }
  });
  return json({ success: true });
});

export const POST = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const shop = await millShop(req);
  const body = await readBody<any>(req);
  const key = req.headers.get('x-idempotency-key') || body.idempotency_key || null;
  const { result, isDuplicate } = await createQuickEntry(shop, body, key, { replaceBatchId: id });
  return json({ ...result, duplicate: isDuplicate }, isDuplicate ? 200 : 201);
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const shop = await millShop(req);
  const out = await prisma.$transaction(
    (tx: any) => reverseProductionTx(tx, { shopId: shop.id, batchId: id, allowNegativeStock: Boolean((shop as any).allowNegativeStock) }),
    { timeout: 60000, maxWait: 15000 },
  );
  recordAuditEvents(shop.id, out.events).catch(() => {});
  return json({ success: true, batchNumber: out.batchNumber });
});
