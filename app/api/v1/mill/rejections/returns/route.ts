import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { getRejectionReturnsHistoryService } from '@/lib/server/rejectionService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const returns = await getRejectionReturnsHistoryService(shop.id);
  return json({ items: returns });
});
