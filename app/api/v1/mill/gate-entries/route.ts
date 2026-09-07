import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
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

  const where: any = { shopId: shop.id };
  if (status) where.status = status;

  const rows = await (prisma as any).gateEntry.findMany({
    where,
    include: {
      supplier: { select: { id: true, name: true, mobile: true } },
      party: { select: { id: true, name: true, mobile: true } },
      weighbridgeEntries: { select: { id: true, slipNumber: true, status: true, netWeightKg: true } },
    },
    orderBy: { enteredAt: 'desc' },
    take: 200,
  });

  return json(rows);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);

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
