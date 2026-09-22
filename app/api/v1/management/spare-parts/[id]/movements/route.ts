import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/management/spare-parts/[id]/movements
 *
 * Adjust a spare part's stock ('in' = restocked/purchased, 'out' = used on a
 * machine) and log the movement — mirrors StockMovement's role for Products.
 */
export const POST = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);

  const part = await (prisma as any).sparePart.findFirst({ where: { id, shopId: shop.id } });
  if (!part) throw new ApiError(404, 'Spare part not found');

  const type = body.type === 'out' ? 'out' : 'in';
  const quantity = parseFloat(String(body.quantity ?? ''));
  if (!isFinite(quantity) || quantity <= 0) throw new ApiError(400, 'A positive quantity is required');
  if (type === 'out' && quantity > Number(part.quantity)) {
    throw new ApiError(400, `Only ${part.quantity} in stock — cannot use ${quantity}`);
  }

  // Restocking a part with a known unit cost is money spent: record it as an Expense (+ cash-book outflow), like POST /expenses.
  const spend = type === 'in' ? Math.round(quantity * (Number(part.unitCost) || 0) * 100) / 100 : 0;
  const pm = ['Cash', 'UPI', 'Card', 'Bank'].includes(body.paymentMethod) ? body.paymentMethod : 'Cash';
  const extra: any[] = spend > 0 ? [
    prisma.expense.create({ data: { shopId: shop.id, category: 'Spare Parts', amount: spend, description: `${part.name} x ${quantity}`, paymentMode: pm } }),
    ...(pm === 'Cash' ? [prisma.cashBook.create({ data: { shopId: shop.id, type: 'expense', amount: spend, description: `Expense: Spare Parts - ${part.name}` } })] : []),
  ] : [];

  const [updated] = await prisma.$transaction([
    (prisma as any).sparePart.update({
      where: { id },
      data: { quantity: { [type === 'in' ? 'increment' : 'decrement']: quantity } },
      include: { machine: { select: { id: true, name: true } } },
    }),
    (prisma as any).sparePartMovement.create({
      data: { shopId: shop.id, sparePartId: id, type, quantity, note: (body.note || '').trim() || null },
    }),
    ...extra,
  ]);

  return json(updated, 201);
});
