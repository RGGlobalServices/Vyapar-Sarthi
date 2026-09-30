import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { orderLots } from '@/lib/lots';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Live lots of every product that currently has MORE THAN ONE lot with stock, grouped by product id and ordered
 * oldest-first. Billing uses this to list each lot as its own search result ("Lot A31 · ₹150 · 3 left",
 * "Lot B07 · ₹180 · 5 left"). Products with 0 or 1 live lot are left out: they search exactly like before.
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req, { enforceSubscription: false });

  const grouped = await prisma.batch.groupBy({
    by: ['productId'],
    where: { shopId: shop.id, quantity: { gt: 0 } },
    _count: { _all: true },
    having: { productId: { _count: { gt: 1 } } },
  });
  const ids = grouped.map((g) => g.productId);
  if (!ids.length) return json({});

  const lots = await prisma.batch.findMany({
    where: { shopId: shop.id, productId: { in: ids }, quantity: { gt: 0 } },
    select: {
      id: true, productId: true, batchNumber: true, quantity: true, initialQuantity: true,
      costPrice: true, sellingPrice: true, purchaseDate: true, expiryDate: true, createdAt: true,
    },
  });

  const byProduct: Record<string, typeof lots> = {};
  for (const l of lots) (byProduct[l.productId] ||= []).push(l);
  for (const id of Object.keys(byProduct)) byProduct[id] = orderLots(byProduct[id] as any) as any;
  return json(byProduct);
});
