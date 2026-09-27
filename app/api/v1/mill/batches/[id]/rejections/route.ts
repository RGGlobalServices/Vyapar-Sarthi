import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { getRejectionLotsService } from '@/lib/server/rejectionService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  const { id: batchId } = await params;
  const { shop } = await requireShop(req);

  const result = await getRejectionLotsService(shop.id, {
    batchId,
    limit: 100,
  });

  return json(result);
});
