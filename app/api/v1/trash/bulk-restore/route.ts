import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { restoreDeletedRecord } from '@/lib/server/trashRestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /trash/bulk-restore { ids: string[] } — loops the same single-record
// restore per id (each entity type's restore does several dependent writes,
// so this can't collapse into one bulk query) and reports success/failure/
// skipped-notes per id, the same three-bucket shape as every other bulk
// route in this app (products/bulk, billing/bulk, suppliers/bulk, etc.) —
// one id failing (already restored, a 409, whatever) doesn't sink the rest
// of the batch.
export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const { ids } = await readBody<{ ids: string[] }>(req);
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw new ApiError(400, 'No record IDs provided');
  }

  const restored: string[] = [];
  const failed: { id: string; error: string }[] = [];
  const skippedByRecord: Record<string, string[]> = {};

  for (const id of ids) {
    try {
      const { skipped } = await restoreDeletedRecord(shop.id, id);
      restored.push(id);
      if (skipped.length > 0) skippedByRecord[id] = skipped;
    } catch (error: any) {
      failed.push({ id, error: error.message || 'Restore failed' });
    }
  }

  return json({ success: true, restored, failed, skippedByRecord });
});
