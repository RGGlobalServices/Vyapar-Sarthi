import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { assertOwned as assertRefsOwned } from '@/lib/server/ownership';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET   /api/v1/mill/gate-entries/[id] — full detail
 * PATCH /api/v1/mill/gate-entries/[id] — edit fields, mark exited
 * DELETE /api/v1/mill/gate-entries/[id] — remove (blocked if a weighbridge
 *         entry already references it — the FK is SetNull so this only
 *         matters if you want to keep gate/weighbridge history in sync).
 */

async function assertOwned(req: Request, id: string) {
  const { shop } = await requireShop(req);
  const entry = await (prisma as any).gateEntry.findFirst({ where: { id, shopId: shop.id } });
  if (!entry) throw new ApiError(404, 'Gate entry not found');
  return { shop, entry };
}

export const GET = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const entry = await (prisma as any).gateEntry.findFirst({
    where: { id, shopId: shop.id },
    include: {
      supplier: { select: { id: true, name: true, mobile: true } },
      party: { select: { id: true, name: true, mobile: true } },
      weighbridgeEntries: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!entry) throw new ApiError(404, 'Gate entry not found');
  return json(entry);
});

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await assertOwned(req, id);
  const body = await readBody<any>(req);
  // Linked ids are client-supplied — they must belong to this shop, or another
  // shop's names/mobiles come back through the response join.
  await assertRefsOwned(shop.id, { supplierId: body.supplierId, customerId: body.partyId });

  const patch: any = {};
  if (body.driverName !== undefined) patch.driverName = body.driverName == null ? null : String(body.driverName).trim() || null;
  if (body.driverMobile !== undefined) patch.driverMobile = body.driverMobile == null ? null : String(body.driverMobile).trim() || null;
  if (body.supplierId !== undefined) patch.supplierId = body.supplierId || null;
  if (body.partyId !== undefined) patch.partyId = body.partyId || null;
  if (body.materialDescription !== undefined) patch.materialDescription = body.materialDescription == null ? null : String(body.materialDescription).trim() || null;
  if (body.notes !== undefined) patch.notes = body.notes == null ? null : String(body.notes).trim() || null;
  if (body.status !== undefined) patch.status = String(body.status);
  if (body.markExited === true) {
    patch.status = 'exited';
    patch.exitedAt = new Date();
  }

  const updated = await (prisma as any).gateEntry.update({
    where: { id },
    data: patch,
    include: { supplier: { select: { id: true, name: true, mobile: true } } },
  });
  return json(updated);
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop, entry } = await assertOwned(req, id);
  // A truck that was already weighed is part of the weighbridge record — delete that slip first.
  const slips = await (prisma as any).weighbridgeEntry.count({ where: { shopId: shop.id, gateEntryId: id } });
  if (slips > 0) throw new ApiError(409, 'This truck has a weighbridge slip. Delete the slip first, then the gate entry.', 'HAS_WEIGHBRIDGE_SLIP');
  await prisma.$transaction(async (tx: any) => {
    // The hamali the gate entry booked as an expense goes with it. Freight entries stay (money owed to the transporter) — they are just unlinked.
    if (Number(entry.hamaliAmount) > 0) {
      await tx.expense.deleteMany({ where: { shopId: shop.id, category: 'Hamali / Labour', description: { startsWith: `Hamali - ${entry.entryNumber} (` } } });
    }
    await tx.gateEntry.delete({ where: { id } });
  }, { timeout: 30000, maxWait: 10000 });
  return json({ success: true });
});
