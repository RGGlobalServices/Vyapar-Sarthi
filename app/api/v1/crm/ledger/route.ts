import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const url = new URL(req.url);
  const entityType = url.searchParams.get('entityType'); // 'customer' or 'supplier'
  const entityId = url.searchParams.get('entityId');

  if (!entityType || !entityId) {
    throw new ApiError(400, 'Missing entityType or entityId');
  }

  if (entityType === 'customer' || entityType === 'party') {
    const ledger = await prisma.customer_transactions.findMany({
      where: { customer_id: entityId, customers: { shopId: shop.id } },
      orderBy: { created_at: 'desc' },
    });
    return json(ledger);
  } else if (entityType === 'supplier') {
    const ledger = await prisma.supplierTransaction.findMany({
      where: { supplierId: entityId, supplier: { shopId: shop.id } },
      orderBy: { createdAt: 'desc' },
    });
    return json(ledger);
  } else {
    throw new ApiError(400, 'Invalid entityType');
  }
});
