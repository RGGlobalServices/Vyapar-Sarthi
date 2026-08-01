import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/shop/repair-names
 *
 * One-shot repair for shops whose name / businessType got bulk-overwritten by
 * the old `PATCH /user/profile` sync (see route.ts in that folder — the sync
 * has since been narrowed to only cascade the owner's mobile). This endpoint
 * accepts a caller-provided mapping and applies each entry ONLY if the target
 * shop is owned by the authenticated user, so a compromised session can never
 * rename someone else's shops.
 *
 * Body shape:
 *   { mapping: [{ shopId?: string; shopCode?: string; name: string; businessType?: string }] }
 *
 * Response:
 *   { updated: [{ shopId, before: {...}, after: {...} }], skipped: [{ ..., reason }] }
 */
export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await readBody(req);
  const mapping = Array.isArray(body?.mapping) ? body.mapping : null;
  if (!mapping || mapping.length === 0) {
    throw new ApiError(400, 'mapping array is required');
  }

  const updated: Array<{ shopId: string; before: any; after: any }> = [];
  const skipped: Array<{ query: any; reason: string }> = [];

  for (const entry of mapping) {
    const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
    if (!name) { skipped.push({ query: entry, reason: 'empty name' }); continue; }

    const where: any = { ownerId: user.uuid! };
    if (entry.shopId) where.id = entry.shopId;
    else if (entry.shopCode) where.shopCode = entry.shopCode;
    else { skipped.push({ query: entry, reason: 'no shopId or shopCode' }); continue; }

    const existing = await prisma.shop.findFirst({ where });
    if (!existing) { skipped.push({ query: entry, reason: 'shop not found or not owned' }); continue; }

    const data: Record<string, unknown> = { name };
    if (entry.businessType) data.businessType = String(entry.businessType);

    const after = await prisma.shop.update({ where: { id: existing.id }, data });
    updated.push({
      shopId: existing.id,
      before: { name: existing.name, businessType: existing.businessType },
      after: { name: after.name, businessType: after.businessType },
    });
  }

  return json({ updated, skipped, updatedCount: updated.length, skippedCount: skipped.length });
});
