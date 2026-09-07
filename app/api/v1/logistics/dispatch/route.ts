import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, query, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Dispatch — what actually left the mill (product + qty), as opposed to
 * GateEntry which only logs the truck's physical movement with a free-text
 * material description. Optionally linked to the GateEntry for that same
 * trip so the two logs stay traceable to each other.
 *
 * GET  /api/v1/logistics/dispatch — list, newest first
 * POST /api/v1/logistics/dispatch — create; auto-numbers DC-YYYYMMDD-NNN;
 *      debits the dispatched product's stock (COALESCE-safe, same pattern
 *      purchases/route.ts and mill/by-products use).
 */

async function nextDispatchNumber(shopId: string): Promise<string> {
  const d = new Date();
  const prefix = `DC-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const same = await (prisma as any).dispatchEntry.count({ where: { shopId, dispatchNumber: { startsWith: prefix } } });
  return `${prefix}-${String(same + 1).padStart(3, '0')}`;
}

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);
  const where: any = { shopId: shop.id };
  if (q.partyId) where.partyId = q.partyId;

  const rows = await (prisma as any).dispatchEntry.findMany({
    where,
    include: {
      party: { select: { id: true, name: true, mobile: true } },
      product: { select: { id: true, name: true, baseUnit: true } },
      gateEntry: { select: { id: true, entryNumber: true } },
    },
    orderBy: { dispatchedAt: 'desc' },
    take: 200,
  });
  return json(rows);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);

  const vehicleNumber = (body.vehicleNumber || '').toString().trim();
  const dispatchNumber = (body.dispatchNumber || '').toString().trim() || await nextDispatchNumber(shop.id);

  let productId: string | null = body.productId || null;
  if (productId) {
    const product = await prisma.product.findFirst({ where: { id: productId, shopId: shop.id } });
    if (!product) throw new ApiError(400, 'Product not found for this shop');
  }
  const quantity = body.quantity != null && body.quantity !== '' ? Number(body.quantity) : null;
  if (quantity != null && (!isFinite(quantity) || quantity <= 0)) throw new ApiError(400, 'quantity must be a positive number');

  const gateEntryId: string | null = body.gateEntryId || null;
  if (gateEntryId) {
    const gate = await (prisma as any).gateEntry.findFirst({ where: { id: gateEntryId, shopId: shop.id } });
    if (!gate) throw new ApiError(400, 'Gate entry not found for this shop');
  }

  const ops: any[] = [
    (prisma as any).dispatchEntry.create({
      data: {
        shopId: shop.id,
        dispatchNumber,
        partyId: body.partyId || null,
        vehicleNumber: vehicleNumber || null,
        gateEntryId,
        productId,
        quantity,
        unit: (body.unit || '').trim() || null,
        notes: (body.notes || '').trim() || null,
        dispatchedAt: body.dispatchedAt ? new Date(body.dispatchedAt) : new Date(),
      },
      include: {
        party: { select: { id: true, name: true } },
        product: { select: { id: true, name: true, baseUnit: true } },
      },
    }),
  ];

  // Dispatching finished goods debits stock the same way a sale would —
  // best-effort only when a real product + quantity were given.
  if (productId && quantity && quantity > 0) {
    ops.push(
      prisma.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) - ${quantity} WHERE id = ${productId}::uuid`,
      prisma.stockMovement.create({
        data: { shopId: shop.id, productId, type: 'dispatch', quantity, referenceId: gateEntryId },
      }),
    );
  }

  const [created] = await prisma.$transaction(ops);
  return json(created, 201);
});
