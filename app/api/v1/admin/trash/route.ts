import prisma from '@/lib/server/prisma';
import { requireAdmin } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  await requireAdmin(req);
  const url = new URL(req.url);
  const entityType = url.searchParams.get('entityType');
  const q = url.searchParams.get('q');
  const includeRestored = url.searchParams.get('includeRestored') === 'true';

  const where: any = {};
  if (!includeRestored) where.restoredAt = null;
  if (entityType) where.entityType = entityType;
  if (q) where.label = { contains: q, mode: 'insensitive' };

  const records = await prisma.deletedRecord.findMany({
    where,
    orderBy: { deletedAt: 'desc' },
    take: 500,
  });

  const shopIds = Array.from(new Set(records.map(r => r.shopId)));
  const shops = shopIds.length > 0
    ? await prisma.shop.findMany({ where: { id: { in: shopIds } }, select: { id: true, name: true, shopCode: true, packageType: true } })
    : [];
  const shopMap = new Map(shops.map(s => [s.id, s]));

  return json(records.map(r => ({
    id: r.id,
    entityType: r.entityType,
    entityId: r.entityId,
    label: r.label,
    deletedBy: r.deletedBy,
    deletedAt: r.deletedAt,
    restoredAt: r.restoredAt,
    shop: shopMap.get(r.shopId) || null,
  })));
});
