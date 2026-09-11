import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/management/machine-downtime/[id] — resolve (set endedAt),
 * optionally linking the MaintenanceEntry that fixed it. Flips the machine
 * back to 'working' unless another open downtime exists for it (shouldn't
 * happen given the one-open-at-a-time guard in POST, but checked anyway).
 * DELETE — remove a wrongly-logged entry.
 */
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const existing = await (prisma as any).machineDowntime.findFirst({ where: { id, shopId: shop.id } });
  if (!existing) throw new ApiError(404, 'Downtime entry not found');

  const body = await readBody<any>(req);
  const ops: any[] = [];

  if (body.resolve) {
    if (existing.endedAt) throw new ApiError(400, 'Already resolved');
    ops.push((prisma as any).machineDowntime.update({
      where: { id },
      data: {
        endedAt: body.endedAt ? new Date(body.endedAt) : new Date(),
        maintenanceEntryId: body.maintenanceEntryId || undefined,
        notes: body.notes !== undefined ? ((body.notes || '').toString().trim() || null) : undefined,
      },
      include: { machine: { select: { id: true, name: true } } },
    }));
    const stillOpen = await (prisma as any).machineDowntime.count({ where: { machineId: existing.machineId, endedAt: null, id: { not: id } } });
    if (stillOpen === 0) {
      ops.push((prisma as any).machine.update({ where: { id: existing.machineId }, data: { status: 'working' } }));
    }
  } else {
    if (body.notes !== undefined) {
      ops.push((prisma as any).machineDowntime.update({ where: { id }, data: { notes: (body.notes || '').toString().trim() || null } }));
    }
  }

  const [updated] = await prisma.$transaction(ops);
  return json(updated || existing);
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const existing = await (prisma as any).machineDowntime.findFirst({ where: { id, shopId: shop.id } });
  if (!existing) throw new ApiError(404, 'Downtime entry not found');
  await (prisma as any).machineDowntime.delete({ where: { id } });
  return json({ success: true });
});
