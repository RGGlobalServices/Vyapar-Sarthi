import { debitGodown, creditGodown, syncsGodownStock } from '@/lib/server/godownStock';
import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { assertOwned } from '@/lib/server/ownership';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/logistics/dispatch/[id]/return
 * Marks a dispatched entry as returned and credits stock back.
 */
export const POST = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);

  const entry = await (prisma as any).dispatchEntry.findFirst({
    where: { id, shopId: shop.id },
  });
  if (!entry) throw new ApiError(404, 'Dispatch entry not found');
  if (entry.status === 'returned') throw new ApiError(400, 'Already marked as returned');

  const returnNotes = (body.returnNotes || '').trim() || null;
  const returnedAt = body.returnedAt ? new Date(body.returnedAt) : new Date();

  // Stock goes back only if THIS dispatch took it: not when it came from a challan (the challan took it; returning the challan gives it back)
  // and not when it was made against a bill (marked 'dispatch_billed' — the bill took it).
  const billed = entry.productId
    ? await prisma.stockMovement.count({ where: { shopId: shop.id, productId: entry.productId, type: 'dispatch_billed', referenceId: entry.id } })
    : 0;
  const tookStock = !entry.challanId && billed === 0;

  const updated = await prisma.$transaction(async (tx) => {
    // the status flip is the lock: two clicks at once -> only one changes the row, the other stops here, before any stock is touched
    const flipped = await (tx as any).dispatchEntry.updateMany({
      where: { id, shopId: shop.id, status: { not: 'returned' } },
      data: { status: 'returned', returnedAt, returnNotes },
    });
    if (flipped.count === 0) throw new ApiError(400, 'Already marked as returned');

    // Credit stock back if product+quantity are on the original dispatch
    if (tookStock && entry.productId && entry.quantity && entry.quantity > 0) {
      await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) + ${entry.quantity} WHERE id = ${entry.productId}::uuid AND shop_id = ${shop.id}::uuid`;
      await tx.stockMovement.create({
        data: { shopId: shop.id, productId: entry.productId, type: 'return', quantity: entry.quantity, referenceId: entry.id },
      });
      if (syncsGodownStock(shop)) await creditGodown(tx, shop.id, entry.productId, entry.quantity);
    }
    return (tx as any).dispatchEntry.findFirst({
      where: { id, shopId: shop.id },
      include: {
        party: { select: { id: true, name: true } },
        product: { select: { id: true, name: true, baseUnit: true } },
      },
    });
  }, { timeout: 30000, maxWait: 10000 });
  return json(updated);
});
