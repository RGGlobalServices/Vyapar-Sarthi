import { initiateRefund } from '@/lib/server/payu';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const { mihpayid, amount } = await readBody(req);
  if (!mihpayid || !amount) throw new ApiError(400, 'mihpayid and amount are required');
  const result = await initiateRefund(mihpayid, amount);
  return json(result);
});
