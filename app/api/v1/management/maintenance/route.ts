import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, query, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Maintenance log — service history across every machine (or one, via
 * ?machineId=). Setting a machine's status to 'under_maintenance' or back to
 * 'working' is done from here since a maintenance visit is exactly the event
 * that changes it.
 *
 * GET  /api/v1/management/maintenance — list, newest first, joined with machine name
 * POST /api/v1/management/maintenance — create; optionally flips the
 *      machine's status when body.setStatus is given
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);
  const where: any = { shopId: shop.id };
  if (q.machineId) where.machineId = q.machineId;

  const rows = await (prisma as any).maintenanceEntry.findMany({
    where,
    include: { machine: { select: { id: true, name: true } } },
    orderBy: { serviceDate: 'desc' },
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

  const description = (body.description || '').toString().trim();
  if (!description) throw new ApiError(400, 'description is required');

  const ops: any[] = [
    (prisma as any).maintenanceEntry.create({
      data: {
        shopId: shop.id,
        machineId,
        description,
        cost: body.cost != null && body.cost !== '' ? Number(body.cost) : null,
        performedBy: (body.performedBy || '').trim() || null,
        serviceDate: body.serviceDate ? new Date(body.serviceDate) : new Date(),
        nextDueDate: body.nextDueDate ? new Date(body.nextDueDate) : null,
        notes: (body.notes || '').trim() || null,
      },
      include: { machine: { select: { id: true, name: true } } },
    }),
  ];

  if (body.setStatus && ['working', 'under_maintenance', 'retired'].includes(body.setStatus)) {
    ops.push((prisma as any).machine.update({ where: { id: machineId }, data: { status: body.setStatus } }));
  }

  // A paid-cash maintenance visit is a real cash outflow — same convention
  // as every other outgoing-payment path in this app.
  if (body.cost && Number(body.cost) > 0 && (body.paymentMethod || 'Cash') === 'Cash') {
    ops.push(
      prisma.cashBook.create({
        data: { shopId: shop.id, type: 'expense', amount: Number(body.cost), description: `Maintenance: ${machine.name} — ${description}` },
      }),
    );
  }

  const [created] = await prisma.$transaction(ops);
  return json(created, 201);
});
