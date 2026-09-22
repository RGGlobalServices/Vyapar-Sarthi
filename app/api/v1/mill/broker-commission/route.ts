import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { logBrokerCommission } from '@/lib/server/brokerCommission';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST — log a broker (and their commission) against a bill just saved from Purchases or Billing. Body: { name, commission, billNumber, kind: 'supplier'|'customer', party? } */
export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const b = await readBody<any>(req);
  if (!String(b.name ?? '').trim()) throw new ApiError(400, 'Broker name is required');
  if (!String(b.billNumber ?? '').trim()) throw new ApiError(400, 'billNumber is required');
  const id = await logBrokerCommission(shop.id, { name: b.name, commission: b.commission, billNumber: String(b.billNumber), kind: b.kind === 'customer' ? 'customer' : 'supplier', party: b.party });
  return json({ brokerId: id }, 201);
});
