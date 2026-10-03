import { debitGodown, creditGodown, syncsGodownStock } from '@/lib/server/godownStock';
import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { assertOwned } from '@/lib/server/ownership';
import { handle, json, readBody, query, ApiError } from '@/lib/server/http';
import { randomUUID } from 'crypto';
import { withDispatchNumber } from '@/lib/server/dispatchNumber';

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

  const saleIds: string[] = [...new Set((rows as any[]).map((r: any) => r.saleId).filter(Boolean))];
  let saleMap: Record<string, { id: string; invoice_number: string | null }> = {};
  if (saleIds.length > 0) {
    const sales = await (prisma as any).sale.findMany({
      where: { id: { in: saleIds }, shopId: shop.id },
      select: { id: true, invoice_number: true },
    });
    for (const s of sales as any[]) saleMap[s.id] = s;
  }

  const enriched = (rows as any[]).map((r: any) => ({
    ...r,
    sale: r.saleId ? (saleMap[r.saleId] ?? null) : null,
  }));
  return json(enriched);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);

  // partyId is a Customer id supplied by the client (product and gate entry are
  // already shop-checked below).
  await assertOwned(shop.id, { customerId: body.partyId });

  const vehicleNumber = (body.vehicleNumber || '').toString().trim();
  const typedNumber = (body.dispatchNumber || '').toString().trim();
  if (body.saleId) {
    const sale = await prisma.sale.findFirst({ where: { id: String(body.saleId), shopId: shop.id }, select: { id: true } });
    if (!sale) throw new ApiError(400, 'Invoice not found for this shop');
  }

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

  const VALID_TYPES = ['sale', 'sample', 'transfer', 'job_work', 'other'];
  const dispatchType = VALID_TYPES.includes(body.dispatchType) ? body.dispatchType : 'sale';
  const noOfBags = body.noOfBags != null && body.noOfBags !== '' ? Math.round(Number(body.noOfBags)) : null;

  const entryId = randomUUID();
  const build = (dispatchNumber: string) => {
  const ops: any[] = [
    (prisma as any).dispatchEntry.create({
      data: {
        id: entryId,
        shopId: shop.id,
        dispatchNumber,
        partyId: body.partyId || null,
        vehicleNumber: vehicleNumber || null,
        driverName: (body.driverName || '').trim() || null,
        gateEntryId,
        productId,
        quantity,
        unit: (body.unit || '').trim() || null,
        noOfBags,
        lotNumber: (body.lotNumber || '').trim() || null,
        dispatchType,
        saleId: body.saleId || null,
        notes: (body.notes || '').trim() || null,
        status: 'dispatched',
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
  // ...but NOT when it is dispatched against a bill (saleId): the bill already took that stock, a second debit would count the same goods twice.
  if (productId && quantity && quantity > 0 && !body.saleId) {
    ops.push(
      prisma.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) - ${quantity} WHERE id = ${productId}::uuid AND shop_id = ${shop.id}::uuid`,
      prisma.stockMovement.create({
        data: { shopId: shop.id, productId, type: 'dispatch', quantity, referenceId: gateEntryId },
      }),
    );
    if (syncsGodownStock(shop)) ops.push(debitGodown(prisma, shop.id, productId, quantity));
  } else if (productId && quantity && quantity > 0) {
    // zero-quantity marker: this dispatch took no stock (the bill did), so its return must not give any back
    ops.push(prisma.stockMovement.create({ data: { shopId: shop.id, productId, type: 'dispatch_billed', quantity: 0, referenceId: entryId } }));
  }
  return ops;
  };

  const [created] = typedNumber
    ? await prisma.$transaction(build(typedNumber))
    : await withDispatchNumber(shop.id, (n) => prisma.$transaction(build(n)));
  return json(created, 201);
});
