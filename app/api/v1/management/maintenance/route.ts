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

  // Parts used in this job: [{ sparePartId, quantity }] — taken out of the spare-parts stock in the same transaction
  const partsIn: Array<{ sparePartId: string; quantity: number }> = (Array.isArray(body.parts) ? body.parts : [])
    .map((p: any) => ({ sparePartId: String(p?.sparePartId ?? ''), quantity: parseFloat(String(p?.quantity ?? '')) }))
    .filter((p: any) => p.sparePartId && isFinite(p.quantity) && p.quantity > 0);
  const partRows = partsIn.length ? await (prisma as any).sparePart.findMany({ where: { shopId: shop.id, id: { in: partsIn.map((p) => p.sparePartId) } } }) : [];
  const partLines: string[] = [];
  const partOps: any[] = [];
  for (const u of partsIn) {
    const part = partRows.find((x: any) => x.id === u.sparePartId);
    if (!part) throw new ApiError(404, 'Spare part not found');
    if (u.quantity > Number(part.quantity)) throw new ApiError(400, `Only ${part.quantity} ${part.name} in stock — cannot use ${u.quantity}`);
    partLines.push(`${part.name} x ${u.quantity}`);
    partOps.push(
      (prisma as any).sparePart.update({ where: { id: part.id }, data: { quantity: { decrement: u.quantity } } }),
      (prisma as any).sparePartMovement.create({ data: { shopId: shop.id, sparePartId: part.id, type: 'out', quantity: u.quantity, note: `Used on ${machine.name}: ${description}`.slice(0, 200) } }),
    );
  }
  const baseNotes = (body.notes || '').trim();
  const notes = [partLines.length ? `Parts used: ${partLines.join(', ')}` : '', baseNotes].filter(Boolean).join('\n') || null;

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
        notes,
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

  // Also an Expense, so the cost shows up under Expenses (the cash-book row above is the cash side; same pairing as POST /expenses).
  if (body.cost && Number(body.cost) > 0) {
    const pm = ['Cash', 'UPI', 'Card', 'Bank'].includes(body.paymentMethod) ? body.paymentMethod : 'Cash';
    ops.push(
      prisma.expense.create({
        data: { shopId: shop.id, category: 'Machine Maintenance', amount: Number(body.cost), description: `${machine.name} - ${description}`, paymentMode: pm, date: body.serviceDate ? new Date(body.serviceDate) : new Date() },
      }),
    );
  }

  const [created] = await prisma.$transaction([...ops, ...partOps]);
  return json(created, 201);
});
