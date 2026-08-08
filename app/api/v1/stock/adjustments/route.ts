import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Stock adjustments (Damaged/Expired/Theft/etc — see AdjustDrawer's reason
// list) are recorded on Product.currentStock + a StockMovement row, but the
// REASON only ever got written to ActivityLog.details (a JSON blob) — there's
// no dedicated adjustments table. This exposes that history so the Stock
// page's per-product "Damaged/Exp" figure can be real instead of hardcoded 0.
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);

  const logs = await prisma.activityLog.findMany({
    where: { shopId: shop.id, action: 'stock_adjusted' },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { details: true, createdAt: true },
  });

  const adjustments = logs
    .map((l) => {
      const d = l.details as any;
      return {
        productId: d?.productId as string | undefined,
        difference: Number(d?.difference) || 0,
        reason: (d?.reason as string) || 'Manual adjustment',
        createdAt: l.createdAt,
      };
    })
    .filter((a) => a.productId);

  return json(adjustments);
});
