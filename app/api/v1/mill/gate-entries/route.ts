import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { assertOwned as assertRefsOwned } from '@/lib/server/ownership';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Gate Entry — the first step of the mill floor: log a truck as it arrives
 * (or leaves), before it ever reaches the weighbridge. Feeds vehicle/driver/
 * supplier straight into the Weighbridge entry so nothing gets re-typed.
 *
 * GET  /api/v1/mill/gate-entries — list, newest first, optional ?status=
 * POST /api/v1/mill/gate-entries — create; auto-numbers GE-YYYYMMDD-NNN
 */

async function nextEntryNumber(shopId: string): Promise<string> {
  const d = new Date();
  const prefix = `GE-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const same = await (prisma as any).gateEntry.count({
    where: { shopId, entryNumber: { startsWith: prefix } },
  });
  return `${prefix}-${String(same + 1).padStart(3, '0')}`;
}

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const url = new URL(req.url);
  const status = url.searchParams.get('status'); // 'at_gate' | 'weighed' | 'exited'
  const direction = url.searchParams.get('direction'); // 'inward' | 'outward'
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const search = url.searchParams.get('search')?.trim();

  const where: any = { shopId: shop.id };
  if (status) where.status = status;
  if (direction) where.direction = direction;
  if (from || to) {
    where.enteredAt = {};
    if (from) where.enteredAt.gte = new Date(from);
    if (to) { const end = new Date(to); end.setHours(23, 59, 59, 999); where.enteredAt.lte = end; }
  }
  if (search) {
    where.OR = [
      { vehicleNumber: { contains: search, mode: 'insensitive' } },
      { driverName: { contains: search, mode: 'insensitive' } },
      { materialDescription: { contains: search, mode: 'insensitive' } },
      { entryNumber: { contains: search, mode: 'insensitive' } },
      { supplier: { name: { contains: search, mode: 'insensitive' } } },
      { party: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  // The register/export view needs every entry in the selected range, not
  // just the most recent — a plain 200-row cap silently truncated a busy
  // mill's monthly export. Only cap when no date range was given (the
  // default dashboard load), so that stays cheap.
  const rows = await (prisma as any).gateEntry.findMany({
    where,
    include: {
      supplier: { select: { id: true, name: true, mobile: true } },
      party: { select: { id: true, name: true, mobile: true } },
      weighbridgeEntries: { select: { id: true, slipNumber: true, status: true, netWeightKg: true } },
    },
    orderBy: { enteredAt: 'desc' },
    take: (from || to) ? 5000 : 200,
  });

  return json(rows);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);
  // Linked ids are client-supplied — they must belong to this shop, or another
  // shop's names/mobiles come back through the response join.
  await assertRefsOwned(shop.id, { supplierId: body.supplierId, customerId: body.partyId });

  const vehicleNumber = (body.vehicleNumber || '').toString().trim();
  if (!vehicleNumber) throw new ApiError(400, 'Vehicle number is required');

  const direction = body.direction === 'outward' ? 'outward' : 'inward';
  const entryNumber = (body.entryNumber || '').toString().trim() || await nextEntryNumber(shop.id);

  const entry = await (prisma as any).gateEntry.create({
    data: {
      shopId: shop.id,
      entryNumber,
      direction,
      vehicleNumber,
      driverName: (body.driverName || '').trim() || null,
      driverMobile: (body.driverMobile || '').trim() || null,
      supplierId: body.supplierId || null,
      partyId: body.partyId || null,
      materialDescription: (body.materialDescription || '').trim() || null,
      status: 'at_gate',
      notes: (body.notes || '').trim() || null,
    },
    include: { supplier: { select: { id: true, name: true, mobile: true } }, party: { select: { id: true, name: true, mobile: true } } },
  });

  return json(entry, 201);
});
