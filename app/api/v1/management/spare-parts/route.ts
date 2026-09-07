import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Spare parts inventory — kept separate from the sales-facing Product
 * catalogue since these aren't sellable goods, just stock the mill keeps for
 * its own machines. Stock changes go through /spare-parts/[id]/movements so
 * every adjustment is logged (SparePartMovement), same audit-trail idea as
 * StockMovement for Products.
 *
 * GET  /api/v1/management/spare-parts — list, newest first
 * POST /api/v1/management/spare-parts — create; quantity here is the opening stock
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const rows = await (prisma as any).sparePart.findMany({
    where: { shopId: shop.id },
    include: { machine: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  });
  return json(rows);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);

  const name = (body.name || '').toString().trim();
  if (!name) throw new ApiError(400, 'Spare part name is required');

  if (body.machineId) {
    const machine = await (prisma as any).machine.findFirst({ where: { id: body.machineId, shopId: shop.id } });
    if (!machine) throw new ApiError(400, 'Machine not found for this shop');
  }

  const part = await (prisma as any).sparePart.create({
    data: {
      shopId: shop.id,
      name,
      machineId: body.machineId || null,
      quantity: body.quantity != null && body.quantity !== '' ? Number(body.quantity) : 0,
      minStock: body.minStock != null && body.minStock !== '' ? Number(body.minStock) : null,
      unitCost: body.unitCost != null && body.unitCost !== '' ? Number(body.unitCost) : null,
      notes: (body.notes || '').trim() || null,
    },
    include: { machine: { select: { id: true, name: true } } },
  });
  return json(part, 201);
});
