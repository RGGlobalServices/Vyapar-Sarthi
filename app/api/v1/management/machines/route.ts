import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Machines — the mill's physical equipment register. Each row can carry a
 * maintenance history (MaintenanceEntry) and spare parts kept on hand for it
 * (SparePart).
 *
 * GET  /api/v1/management/machines — list with counts, newest first
 * POST /api/v1/management/machines — create
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const rows = await (prisma as any).machine.findMany({
    where: { shopId: shop.id },
    include: {
      _count: { select: { maintenanceEntries: true, spareParts: true } },
      maintenanceEntries: { orderBy: { serviceDate: 'desc' }, take: 1, select: { serviceDate: true, nextDueDate: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return json(rows);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);

  const name = (body.name || '').toString().trim();
  if (!name) throw new ApiError(400, 'Machine name is required');

  const machine = await (prisma as any).machine.create({
    data: {
      shopId: shop.id,
      name,
      machineType: (body.machineType || '').trim() || null,
      purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : null,
      cost: body.cost != null && body.cost !== '' ? Number(body.cost) : null,
      status: ['working', 'under_maintenance', 'retired'].includes(body.status) ? body.status : 'working',
      notes: (body.notes || '').trim() || null,
    },
  });
  return json(machine, 201);
});
