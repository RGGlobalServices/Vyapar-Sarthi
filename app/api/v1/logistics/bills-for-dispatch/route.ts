import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/logistics/bills-for-dispatch
 * Returns recent Sale bills that can be linked to a dispatch entry.
 * Optional ?q= to search by invoice number or party name.
 * Optional ?partyId= to filter by customer.
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);
  const search = (q.q || '').trim();
  const partyId = q.partyId || null;

  const where: any = { shopId: shop.id };
  if (partyId) where.customerId = partyId;
  if (search) {
    where.OR = [
      { invoice_number: { contains: search, mode: 'insensitive' } },
      { customer: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const bills = await (prisma as any).sale.findMany({
    where,
    select: {
      id: true,
      invoice_number: true,
      totalAmount: true,
      createdAt: true,
      customer: { select: { id: true, name: true } },
      items: {
        select: {
          id: true,
          itemName: true,
          quantity: true,
          unit: true,
          productId: true,
          product: { select: { id: true, name: true, baseUnit: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return json(bills);
});
