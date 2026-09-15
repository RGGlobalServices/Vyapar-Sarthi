import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, query, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Job Work / Custom Milling — a farmer/customer brings their own raw
 * material and pays only a processing charge to get it back milled; the
 * mill never owns the grain, so this stays entirely separate from
 * Purchases/RawMaterialLot/ProductionBatch (which all assume the mill
 * bought the raw material) — no Product.currentStock or RawMaterialLot
 * write happens anywhere in this flow.
 *
 * GET  /api/v1/mill/job-work — list, newest first
 * POST /api/v1/mill/job-work — create; auto-numbers JW-YYYYMMDD-NNN
 */

async function nextOrderNumber(shopId: string): Promise<string> {
  const d = new Date();
  const prefix = `JW-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const same = await (prisma as any).jobWorkOrder.count({ where: { shopId, orderNumber: { startsWith: prefix } } });
  return `${prefix}-${String(same + 1).padStart(3, '0')}`;
}

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);
  const where: any = { shopId: shop.id };
  if (q.customerId) where.customerId = q.customerId;
  if (q.status) where.status = q.status;

  const rows = await (prisma as any).jobWorkOrder.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true, mobile: true } },
      gateEntry: { select: { id: true, entryNumber: true } },
    },
    orderBy: { receivedAt: 'desc' },
    take: 200,
  });
  return json(rows);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);

  const customerId: string = body.customerId;
  if (!customerId) throw new ApiError(400, 'customerId is required');
  const customer = await prisma.customer.findFirst({ where: { id: customerId, shopId: shop.id } });
  if (!customer) throw new ApiError(400, 'Customer not found for this shop');

  const materialDescription = (body.materialDescription || '').toString().trim();
  if (!materialDescription) throw new ApiError(400, 'materialDescription is required');

  const inputWeightKg = Number(body.inputWeightKg);
  if (!isFinite(inputWeightKg) || inputWeightKg <= 0) throw new ApiError(400, 'inputWeightKg must be a positive number');

  const ratePerKg = Number(body.ratePerKg);
  if (!isFinite(ratePerKg) || ratePerKg <= 0) throw new ApiError(400, 'ratePerKg must be a positive number');

  const feeBasis = body.feeBasis === 'output' ? 'output' : 'input';

  const gateEntryId: string | null = body.gateEntryId || null;
  if (gateEntryId) {
    const gate = await (prisma as any).gateEntry.findFirst({ where: { id: gateEntryId, shopId: shop.id } });
    if (!gate) throw new ApiError(400, 'Gate entry not found for this shop');
  }

  const orderNumber = (body.orderNumber || '').toString().trim() || await nextOrderNumber(shop.id);

  const order = await (prisma as any).jobWorkOrder.create({
    data: {
      shopId: shop.id,
      orderNumber,
      customerId,
      gateEntryId,
      materialDescription,
      inputWeightKg,
      outputDescription: (body.outputDescription || '').toString().trim() || null,
      ratePerKg,
      feeBasis,
      byproductRetainedByMill: body.byproductRetainedByMill !== false,
      notes: (body.notes || '').toString().trim() || null,
      receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(),
    },
    include: {
      customer: { select: { id: true, name: true, mobile: true } },
      gateEntry: { select: { id: true, entryNumber: true } },
    },
  });

  return json(order, 201);
});
