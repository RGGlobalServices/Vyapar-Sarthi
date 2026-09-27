import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { getWipLotByIdService, getWipTraceabilityService } from '@/lib/server/wipService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req, ctx: any) => {
  const params = await ctx.params;
  const { shop } = await requireShop(req);
  const { id } = await params;

  const url = new URL(req.url);
  const includeTraceability = url.searchParams.get('traceability') === 'true';

  if (includeTraceability) {
    const traceability = await getWipTraceabilityService(shop.id, id);
    return json(traceability);
  }

  const wipLot = await getWipLotByIdService(shop.id, id);
  return json(wipLot);
});
