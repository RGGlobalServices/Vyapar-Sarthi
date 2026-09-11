import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, query, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Machine downtime — one row per stretch a machine was actually stopped
 * (distinct from MaintenanceEntry, a service-log entry that may not involve
 * any downtime). Starting one flips the machine to 'under_maintenance';
 * resolving it (PATCH [id]) flips it back to 'working'. This is what powers
 * the Availability % shown on the Machines page — a scoped, practical stand-
 * in for full OEE, which would need ideal-cycle-time inputs no shopkeeper
 * actually has.
 *
 * GET  /api/v1/management/machine-downtime — list, optional ?machineId= / ?status=open|closed
 * POST /api/v1/management/machine-downtime — start a downtime window
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);
  const where: any = { shopId: shop.id };
  if (q.machineId) where.machineId = q.machineId;
  if (q.status === 'open') where.endedAt = null;
  if (q.status === 'closed') where.endedAt = { not: null };

  const rows = await (prisma as any).machineDowntime.findMany({
    where,
    include: { machine: { select: { id: true, name: true } } },
    orderBy: { startedAt: 'desc' },
    take: 200,
  });
  return json(rows);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);

  const machineId = body.machineId;
  if (!machineId) throw new ApiError(400, 'machineId is required');
  const machine = await (prisma as any).machine.findFirst({ where: { id: machineId, shopId: shop.id } });
  if (!machine) throw new ApiError(404, 'Machine not found for this shop');

  const existingOpen = await (prisma as any).machineDowntime.findFirst({ where: { machineId, endedAt: null } });
  if (existingOpen) throw new ApiError(409, 'This machine already has an open downtime — resolve it first');

  const [created] = await prisma.$transaction([
    (prisma as any).machineDowntime.create({
      data: {
        shopId: shop.id,
        machineId,
        reason: (body.reason || '').toString().trim() || null,
        startedAt: body.startedAt ? new Date(body.startedAt) : new Date(),
        notes: (body.notes || '').toString().trim() || null,
      },
      include: { machine: { select: { id: true, name: true } } },
    }),
    (prisma as any).machine.update({ where: { id: machineId }, data: { status: 'under_maintenance' } }),
  ]);

  return json(created, 201);
});
