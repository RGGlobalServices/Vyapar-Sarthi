import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Raw material lots — the mill's incoming grain (Paddy / Wheat / Turad / …)
 * arriving from farmers in batches with a lot number, weight, moisture %,
 * and rate. Each lot is consumed by one or more ProductionBatch rows.
 *
 * GET  /api/v1/mill/raw-lots — list, newest first
 * POST /api/v1/mill/raw-lots — create a lot; sets remainingKg = weightKg on create
 */

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const url = new URL(req.url);
  const productId = url.searchParams.get('productId');
  const supplierId = url.searchParams.get('supplierId');
  const status = url.searchParams.get('status'); // 'available' | 'consumed' | undefined

  const where: any = { shopId: shop.id };
  if (productId) where.productId = productId;
  if (supplierId) where.supplierId = supplierId;
  // "available" = still has weight left. Uses raw > 0 so 0 and null are both
  // treated as consumed — a lot with no remainingKg recorded shouldn't show
  // up as available material to pull into a new batch.
  if (status === 'available') where.remainingKg = { gt: 0 };
  if (status === 'consumed') where.remainingKg = { in: [0, null] };

  const lots = await (prisma as any).rawMaterialLot.findMany({
    where,
    include: {
      product: { select: { id: true, name: true, baseUnit: true } },
      supplier: { select: { id: true, name: true, mobile: true } },
      batches: { select: { id: true, batchNumber: true, inputKg: true, status: true } },
    },
    orderBy: { purchaseDate: 'desc' },
    take: 200,
  });

  return json(lots);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);

  const weightKg = Number(body.weightKg);
  const ratePerKg = Number(body.ratePerKg) || 0;
  if (!isFinite(weightKg) || weightKg <= 0) {
    throw new ApiError(400, 'weightKg must be a positive number');
  }

  const moisturePct = body.moisturePct != null && body.moisturePct !== ''
    ? Math.max(0, Math.min(100, Number(body.moisturePct) || 0))
    : null;

  const totalAmount = body.totalAmount != null && body.totalAmount !== ''
    ? Number(body.totalAmount)
    : (ratePerKg > 0 ? Math.round(ratePerKg * weightKg * 100) / 100 : null);

  const purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : new Date();

  const lot = await (prisma as any).rawMaterialLot.create({
    data: {
      shopId: shop.id,
      productId: body.productId || null,
      supplierId: body.supplierId || null,
      lotNumber: (body.lotNumber || '').trim() || null,
      farmerName: (body.farmerName || '').trim() || null,
      purchaseDate,
      weightKg,
      moisturePct,
      ratePerKg: ratePerKg || null,
      totalAmount,
      // A fresh lot starts fully available. Batch consumption decrements this
      // via the /mill/batches endpoint so we can quickly filter "what's still
      // in the godown" without recomputing across every batch every time.
      remainingKg: weightKg,
      notes: (body.notes || '').trim() || null,
    },
  });

  return json(lot, 201);
});
