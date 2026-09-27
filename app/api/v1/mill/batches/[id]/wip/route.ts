import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { getWipLotsService } from '@/lib/server/wipService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);

  const result = await getWipLotsService(shop.id, {
    batchId: id,
    limit: 100,
  });

  return json(result.items);
});
