import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';
import { isWholesaleTierPackage } from '@/lib/config/packageConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// POST /collections/:id/finalize — locks the sheet and files it into the
// searchable history. Every entry already posted as a real payment the
// moment it was saved (see lib/server/customerPayment.ts), so this is purely
// a bookkeeping seal: it does not touch any customer balance. Idempotent —
// finalizing an already-finalized sheet just returns it unchanged.
export const POST = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  if (!isWholesaleTierPackage(shop.packageType)) throw new ApiError(403, 'Udyog package required');

  const existing = await prisma.collectionSheet.findFirst({ where: { id, shopId: shop.id } });
  if (!existing) throw new ApiError(404, 'Collection not found');
  if (existing.status === 'finalized') return json(existing);

  const sheet = await prisma.collectionSheet.update({
    where: { id },
    data: { status: 'finalized', finalizedAt: new Date() },
  });

  return json(sheet);
});
