import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { getReprocessingBatchesService } from '@/lib/server/rejectionService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  const { shop } = await requireShop(req);
  const { id } = await params;

  const batches = await getReprocessingBatchesService(shop.id, id);
  return json(batches);
});
