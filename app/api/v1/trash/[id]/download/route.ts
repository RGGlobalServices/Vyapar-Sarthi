import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  const { shop } = await requireShop(req);
  const { id } = await params;

  const record = await prisma.deletedRecord.findFirst({ where: { id, shopId: shop.id } });
  if (!record) throw new ApiError(404, 'Deleted record not found');

  const filename = `${record.entityType}-${(record.label || record.entityId).replace(/[^a-z0-9-_]+/gi, '_')}-${new Date(record.deletedAt).toISOString().split('T')[0]}.json`;

  return json(
    {
      entityType: record.entityType,
      entityId: record.entityId,
      label: record.label,
      deletedBy: record.deletedBy,
      deletedAt: record.deletedAt,
      restoredAt: record.restoredAt,
      data: record.data,
    },
    200,
    { 'Content-Disposition': `attachment; filename="${filename}"` }
  );
});
