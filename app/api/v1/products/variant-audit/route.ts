import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { isWholesaleTierPackage } from '@/lib/config/packageConfig';
import { auditVariants, applyResync, applyMerge } from '@/lib/server/variantAudit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const tierOf = (shop: any) => isWholesaleTierPackage(shop.subscriptionPlan) || isWholesaleTierPackage(shop.packageType);

/** Dry-run report: stock-mismatch products + suggested merges. Changes nothing. */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  return json(await auditVariants(shop.id, tierOf(shop)));
});

/** Apply: { action: 'resync', ids: [...], alignTotalIds?: [...] } or { action: 'merge', groups: [{ baseName, ids: [...] }] } */
export const POST = handle(async (req) => {
  const { shop, user } = await requireShop(req);
  const b = await readBody(req);
  const by = (user as any)?.email || null;
  if (b.action === 'resync') {
    const ids: string[] = Array.isArray(b.ids) ? b.ids.filter((x: any) => typeof x === 'string') : [];
    if (!ids.length) throw new ApiError(400, 'No products selected');
    const alignTotalIds: string[] = Array.isArray(b.alignTotalIds) ? b.alignTotalIds.filter((x: any) => typeof x === 'string') : [];
    return json(await applyResync(shop.id, ids, tierOf(shop), by, alignTotalIds));
  }
  if (b.action === 'merge') {
    const groups: Array<{ baseName: string; ids: string[] }> = Array.isArray(b.groups) ? b.groups : [];
    if (!groups.length) throw new ApiError(400, 'No groups selected');
    let merged = 0;
    const errors: string[] = [];
    for (const g of groups) {
      const baseName = String(g.baseName || '').trim();
      const ids = Array.isArray(g.ids) ? g.ids.filter((x) => typeof x === 'string') : [];
      if (!baseName || ids.length < 2) continue;
      try { merged += (await applyMerge(shop.id, baseName, ids, by)).merged; }
      catch (e: any) { errors.push(`${baseName}: ${e?.message || 'failed'}`); }
    }
    return json({ merged, errors });
  }
  throw new ApiError(400, 'Unknown action');
});
