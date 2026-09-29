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

  const ops: any[] = [
    (prisma as any).dispatchEntry.update({
      where: { id },
      data: { status: 'returned', returnedAt, returnNotes },
      include: {
        party: { select: { id: true, name: true } },
        product: { select: { id: true, name: true, baseUnit: true } },
      },
    }),
  ];

  // Credit stock back if product+quantity are on the original dispatch
  if (entry.productId && entry.quantity && entry.quantity > 0) {
    ops.push(
      prisma.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) + ${entry.quantity} WHERE id = ${entry.productId}::uuid AND shop_id = ${shop.id}::uuid`,
      prisma.stockMovement.create({
        data: {
          shopId: shop.id,
          productId: entry.productId,
          type: 'return',
          quantity: entry.quantity,
          referenceId: entry.id,
        },
      }),
    );
  }

  const [updated] = await prisma.$transaction(ops);
  return json(updated);
});
