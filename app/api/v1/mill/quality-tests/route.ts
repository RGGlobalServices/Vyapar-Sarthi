import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { computeQualityFlag } from '@/lib/businessConfig';
import { getThresholds } from '@/lib/server/qualityConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Quality / Lab readings — moisture / foreign matter / broken / damaged %
 * captured against a raw-material lot (accept/reject a farmer's delivery)
 * or a production batch (certify the output). `flag` is computed server-side
 * from computeQualityFlag() at save time so it's a permanent snapshot, not
 * re-derived from live (possibly later-changed) thresholds.
 *
 * GET  /api/v1/mill/quality-tests — list, optional ?rawLotId= / ?batchId=
 * POST /api/v1/mill/quality-tests — create
 */

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const url = new URL(req.url);
  const rawLotId = url.searchParams.get('rawLotId');
  const batchId = url.searchParams.get('batchId');

  const where: any = { shopId: shop.id };
  if (rawLotId) where.rawLotId = rawLotId;
  if (batchId) where.batchId = batchId;

  const rows = await (prisma as any).qualityTest.findMany({
    where,
    include: {
      rawLot: { select: { id: true, lotNumber: true, farmerName: true, product: { select: { name: true } } } },
      batch: { select: { id: true, batchNumber: true } },
    },
    orderBy: { testDate: 'desc' },
    take: 200,
  });

  return json(rows);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);

  const rawLotId: string | null = body.rawLotId || null;
  const batchId: string | null = body.batchId || null;
  if (rawLotId && batchId) throw new ApiError(400, 'A test is against either a raw lot or a batch, not both');
  if (!rawLotId && !batchId) throw new ApiError(400, 'Pick a raw material lot or a production batch to test');

  if (rawLotId) {
    const lot = await (prisma as any).rawMaterialLot.findFirst({ where: { id: rawLotId, shopId: shop.id } });
    if (!lot) throw new ApiError(400, 'Raw material lot not found for this shop');
  }
  if (batchId) {
    const batch = await (prisma as any).productionBatch.findFirst({ where: { id: batchId, shopId: shop.id } });
    if (!batch) throw new ApiError(400, 'Production batch not found for this shop');
  }

  const num = (v: any) => (v === undefined || v === null || v === '' ? null : Number(v));
  const reading = {
    moisturePct: num(body.moisturePct),
    foreignMatterPct: num(body.foreignMatterPct),
    brokenPct: num(body.brokenPct),
    damagedPct: num(body.damagedPct),
  };
  // readings are percentages: a non-number / negative / above-100 value used to reach the DB as NaN (500) or be saved as nonsense
  const docPct = num(body.docPct);
  for (const [label, v] of [['Moisture', reading.moisturePct], ['Foreign matter', reading.foreignMatterPct], ['Broken', reading.brokenPct], ['Damaged', reading.damagedPct], ['Protein / oil', docPct]] as const) {
    if (v !== null && (!Number.isFinite(v) || v < 0 || v > 100)) throw new ApiError(400, `${label} % must be a number between 0 and 100`);
  }
  if (reading.moisturePct === null && reading.foreignMatterPct === null && reading.brokenPct === null && reading.damagedPct === null) {
    throw new ApiError(400, 'Enter at least one reading (moisture, foreign matter, broken or damaged %)');
  }
  const testDate = body.testDate ? new Date(body.testDate) : new Date();
  if (isNaN(testDate.getTime())) throw new ApiError(400, 'Invalid test date');
  const flag = computeQualityFlag(reading, (await getThresholds(shop.id)).thresholds);

  const created = await (prisma as any).qualityTest.create({
    data: {
      shopId: shop.id,
      rawLotId, batchId,
      testDate,
      testedBy: (body.testedBy || '').trim() || null,
      ...reading,
      docPct,
      flag,
      decision: body.decision === 'accepted' || body.decision === 'rejected' ? body.decision : 'pending',
      notes: (body.notes || '').trim() || null,
    },
    include: {
      rawLot: { select: { id: true, lotNumber: true, farmerName: true } },
      batch: { select: { id: true, batchNumber: true } },
    },
  });

  return json(created, 201);
});
