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
      // The one currently-open downtime window (if any) — lets the card show
      // "DOWN since X" without a second request per machine.
      downtimes: { where: { endedAt: null }, orderBy: { startedAt: 'desc' }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
  });
  return json(rows);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);

  // Support bulk creation
  const items: any[] = Array.isArray(body)
    ? body
    : Array.isArray(body?.machines)
    ? body.machines
    : [body];

  if (items.length === 0) {
    throw new ApiError(400, 'No machine data provided');
  }

  const validStatus = (s?: string) => (['working', 'under_maintenance', 'retired'].includes(s || '') ? s! : 'working');

  if (items.length === 1) {
    const item = items[0];
    const name = (item.name || '').toString().trim();
    if (!name) throw new ApiError(400, 'Machine name is required');

    const machine = await (prisma as any).machine.create({
      data: {
        shopId: shop.id,
        name,
        machineType: (item.machineType || '').trim() || null,
        purchaseDate: item.purchaseDate ? new Date(item.purchaseDate) : null,
        cost: item.cost != null && item.cost !== '' ? Number(item.cost) : null,
        status: validStatus(item.status),
        notes: (item.notes || '').trim() || null,
      },
    });
    return json(machine, 201);
  }

  // Bulk create
  const created: any[] = [];
  for (const item of items) {
    const name = (item.name || '').toString().trim();
    if (!name) continue;

    const m = await (prisma as any).machine.create({
      data: {
        shopId: shop.id,
        name,
        machineType: (item.machineType || '').trim() || null,
        purchaseDate: item.purchaseDate ? new Date(item.purchaseDate) : null,
        cost: item.cost != null && item.cost !== '' ? Number(item.cost) : null,
        status: validStatus(item.status),
        notes: (item.notes || '').trim() || null,
      },
    });
    created.push(m);
  }

  return json({ count: created.length, machines: created }, 201);
});
