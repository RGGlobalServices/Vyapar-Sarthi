import prisma from '@/lib/server/prisma';
import { getBrokerBills } from '@/lib/server/dispatchDetails';
import { getBrokerPurchases } from '@/lib/server/purchaseBroker';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Every bill (sale or purchase) a broker was tagged on, regardless of whether a commission amount
 * was ever entered for it — see lib/server/dispatchDetails.ts and lib/server/purchaseBroker.ts for
 * why this can't be read off commissionEntry rows alone. Shown on the Brokers page so the owner can
 * hand the broker their own bill list and let the broker state the commission, instead of the shop
 * already knowing it.
 *
 * GET /api/v1/management/commission/bills?brokerId=...
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);
  const brokerId = q.brokerId;
  if (!brokerId) throw new ApiError(400, 'brokerId is required');

  const broker = await prisma.customer.findFirst({ where: { id: brokerId, shopId: shop.id, customerType: 'broker' }, select: { name: true } });
  if (!broker || !broker.name) throw new ApiError(404, 'Broker not found for this shop');

  const [sales, purchases] = await Promise.all([
    getBrokerBills(prisma, shop.id, broker.name),
    getBrokerPurchases(prisma, shop.id, broker.name),
  ]);

  const bills = [
    ...sales.map((b) => ({ id: b.id, type: 'sale' as const, invoiceNumber: b.invoiceNumber, date: b.date, amount: b.amount, party: b.customerName })),
    ...purchases.map((p) => ({ id: p.id, type: 'purchase' as const, invoiceNumber: p.invoiceNumber, date: p.date, amount: p.amount, party: p.supplierName })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return json({ bills });
});
