import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { getRejectionLotByIdService, getRejectionTraceabilityService } from '@/lib/server/rejectionService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const url = new URL(req.url);

  const includeTraceability = url.searchParams.get('traceability') === 'true';

  if (includeTraceability) {
    const traceability = await getRejectionTraceabilityService(shop.id, id);
    return json(traceability);
  }

  const lot = await getRejectionLotByIdService(shop.id, id);
  return json(lot);
});
