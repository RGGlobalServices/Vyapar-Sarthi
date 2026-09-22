import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { assertOwned as assertRefsOwned } from '@/lib/server/ownership';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Weighbridge — the two-weigh workflow every mill runs on an incoming truck:
 * weigh it loaded (gross), unload, weigh it empty (tare), net weight is the
 * difference. A slip can start from a Gate Entry (auto-fills vehicle/
 * supplier) or stand alone.
 *
 * GET  /api/v1/mill/weighbridge — list, optional ?status=&gateEntryId=
 * POST /api/v1/mill/weighbridge — create = FIRST weighment (gross weight);
 *                                  auto-numbers WB-YYYYMMDD-NNN
 */

async function nextSlipNumber(shopId: string): Promise<string> {
  const d = new Date();
  const prefix = `WB-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const same = await (prisma as any).weighbridgeEntry.count({
    where: { shopId, slipNumber: { startsWith: prefix } },
  });
  return `${prefix}-${String(same + 1).padStart(3, '0')}`;
}

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const url = new URL(req.url);
  const status = url.searchParams.get('status'); // 'first_weighed' | 'completed' | 'converted'
  const gateEntryId = url.searchParams.get('gateEntryId');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const search = url.searchParams.get('search')?.trim();

  const where: any = { shopId: shop.id };
  if (status) where.status = status;
  if (gateEntryId) where.gateEntryId = gateEntryId;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) { const end = new Date(to); end.setHours(23, 59, 59, 999); where.createdAt.lte = end; }
  }
  if (search) {
    where.OR = [
      { vehicleNumber: { contains: search, mode: 'insensitive' } },
      { slipNumber: { contains: search, mode: 'insensitive' } },
      { materialDescription: { contains: search, mode: 'insensitive' } },
      { product: { name: { contains: search, mode: 'insensitive' } } },
      { supplier: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  // Same reasoning as gate-entries: a date-scoped register/export shouldn't
  // silently truncate a busy mill's monthly weighment history at 200 rows.
  const rows = await (prisma as any).weighbridgeEntry.findMany({
    where,
    include: {
      gateEntry: { select: { id: true, entryNumber: true, driverName: true, status: true } },
      product: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true, mobile: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: (from || to) ? 5000 : 200,
  });

  return json(rows);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);
  // Linked ids are client-supplied — they must belong to this shop, or another
  // shop's names/mobiles come back through the response join.
  await assertRefsOwned(shop.id, { productId: body.productId, supplierId: body.supplierId });

  const grossWeightKg = Number(body.grossWeightKg);
  if (!isFinite(grossWeightKg) || grossWeightKg <= 0) {
    throw new ApiError(400, 'Gross weight must be a positive number');
  }

  // If a gate entry is given, pull vehicle/supplier from it so nothing gets
  // re-typed at the weighbridge station — same truck, same trip.
  let vehicleNumber = (body.vehicleNumber || '').toString().trim();
  let supplierId = body.supplierId || null;
  const gateEntryId: string | null = body.gateEntryId || null;
  if (gateEntryId) {
    const gate = await (prisma as any).gateEntry.findFirst({ where: { id: gateEntryId, shopId: shop.id } });
    if (!gate) throw new ApiError(400, 'Gate entry not found for this shop');
    if (!vehicleNumber) vehicleNumber = gate.vehicleNumber;
    if (!supplierId) supplierId = gate.supplierId;
  }
  if (!vehicleNumber) throw new ApiError(400, 'Vehicle number is required');

  const slipNumber = (body.slipNumber || '').toString().trim() || await nextSlipNumber(shop.id);

  const entry = await prisma.$transaction(async (tx) => {
    const created = await (tx as any).weighbridgeEntry.create({
      data: {
        shopId: shop.id,
        slipNumber,
        gateEntryId,
        vehicleNumber,
        materialDescription: (body.materialDescription || '').trim() || null,
        productId: body.productId || null,
        supplierId,
        grossWeightKg,
        moisturePct: body.moisturePct != null && body.moisturePct !== ''
          ? Math.max(0, Math.min(100, Number(body.moisturePct) || 0)) : null,
        ratePerKg: body.ratePerKg != null && body.ratePerKg !== '' ? Number(body.ratePerKg) : null,
        firstWeighedAt: new Date(),
        status: 'first_weighed',
        notes: (body.notes || '').trim() || null,
      },
    });
    if (gateEntryId) {
      await (tx as any).gateEntry.update({ where: { id: gateEntryId }, data: { status: 'weighed' } });
    }
    return created;
  }, { timeout: 15000, maxWait: 10000 });

  return json(entry, 201);
});
