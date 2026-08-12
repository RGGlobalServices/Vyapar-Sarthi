import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Shopkeeper-facing recycle bin — same DeletedRecord table the internal
// admin/trash tool reads, but scoped to the caller's own shop only (unlike
// admin, which can see every shop). Mirrors admin/trash/route.ts's shape.
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const url = new URL(req.url);
  const entityType = url.searchParams.get('entityType');
  const q = url.searchParams.get('q');
  const includeRestored = url.searchParams.get('includeRestored') === 'true';

  const where: any = { shopId: shop.id };
  if (!includeRestored) where.restoredAt = null;
  if (entityType) where.entityType = entityType;
  if (q) where.label = { contains: q, mode: 'insensitive' };

  const records = await prisma.deletedRecord.findMany({
    where,
    orderBy: { deletedAt: 'desc' },
    take: 500,
  });

  return json(records.map(r => ({
    id: r.id,
    entityType: r.entityType,
    entityId: r.entityId,
    label: r.label,
    deletedBy: r.deletedBy,
    deletedAt: r.deletedAt,
    restoredAt: r.restoredAt,
    purgeWarnedAt: r.purgeWarnedAt,
  })));
});
