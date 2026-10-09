import prisma from '@/lib/server/prisma';
import { getBrokerBills } from '@/lib/server/dispatchDetails';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Every bill (sale) a broker was tagged on, regardless of whether a commission amount was ever
 * entered for it — see lib/server/dispatchDetails.ts for why this can't be read off
 * commissionEntry rows alone. Shown on the Brokers page so the owner can hand the broker their
 * own bill list and let the broker state the commission, instead of the shop already knowing it.
 *
 * GET /api/v1/management/commission/bills?brokerId=...
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);
  const brokerId = q.brokerId;
  if (!brokerId) throw new ApiError(400, 'brokerId is required');

  const broker = await prisma.customer.findFirst({ where: { id: brokerId, shopId: shop.id, customerType: 'broker' }, select: { name: true } });
  if (!broker) throw new ApiError(404, 'Broker not found for this shop');

  const bills = await getBrokerBills(prisma, shop.id, broker.name);
  return json({ bills });
});
