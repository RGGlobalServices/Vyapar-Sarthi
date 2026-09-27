import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { getWipLotsService } from '@/lib/server/wipService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const url = new URL(req.url);

  const productId = url.searchParams.get('productId') || undefined;
  const status = url.searchParams.get('status') || undefined;
  const search = url.searchParams.get('search') || undefined;
  const batchId = url.searchParams.get('batchId') || undefined;
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '20', 10);

  const result = await getWipLotsService(shop.id, {
    productId,
    status,
    search,
    batchId,
    page,
    limit,
  });

  return json(result);
});
