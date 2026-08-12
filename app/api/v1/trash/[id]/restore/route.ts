import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { restoreDeletedRecord } from '@/lib/server/trashRestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// Shop-scoped restore — a shopkeeper must only ever restore their own shop's
// records. See lib/server/trashRestore.ts for the actual entityType switch,
// shared with the bulk-restore route.
export const POST = handle<Ctx>(async (req, { params }) => {
  const { shop } = await requireShop(req);
  const { id } = await params;
  const { skipped } = await restoreDeletedRecord(shop.id, id);
  return json({ success: true, skipped });
});
