import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

async function assertOwned(req: Request, id: string) {
  const { shop } = await requireShop(req);
  const machine = await (prisma as any).machine.findFirst({ where: { id, shopId: shop.id } });
  if (!machine) throw new ApiError(404, 'Machine not found');
  return { shop, machine };
}

export const GET = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const machine = await (prisma as any).machine.findFirst({
    where: { id, shopId: shop.id },
    include: {
      maintenanceEntries: { orderBy: { serviceDate: 'desc' } },
      spareParts: { orderBy: { name: 'asc' } },
    },
  });
  if (!machine) throw new ApiError(404, 'Machine not found');
  return json(machine);
});

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  await assertOwned(req, id);
  const body = await readBody<any>(req);

  const patch: any = {};
  if (body.name !== undefined) patch.name = String(body.name).trim();
  if (body.machineType !== undefined) patch.machineType = body.machineType == null ? null : String(body.machineType).trim() || null;
  if (body.purchaseDate !== undefined) patch.purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : null;
  if (body.cost !== undefined) patch.cost = body.cost === null || body.cost === '' ? null : Number(body.cost);
  if (body.status !== undefined && ['working', 'under_maintenance', 'retired'].includes(body.status)) patch.status = body.status;
  if (body.notes !== undefined) patch.notes = body.notes == null ? null : String(body.notes).trim() || null;

  const updated = await (prisma as any).machine.update({ where: { id }, data: patch });
  return json(updated);
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  await assertOwned(req, id);
  await (prisma as any).machine.delete({ where: { id } });
  return json({ success: true });
});
